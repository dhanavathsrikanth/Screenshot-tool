import { randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import type { Browser } from "playwright";
import type { EngineBrowserHealth, ResolvedEngineConfig } from "./types.js";
import { createLauncher } from "./stealth.js";
import { FreshPageStandby } from "./standby.js";
import { deriveConcurrency, sampleCpu } from "./cpu.js";

const MARKER_PREFIX = "--snapforge-engine=";

function execShell(command: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, windowsHide: true }, () => resolve());
  });
}

export class BrowserManager {
  readonly standby: FreshPageStandby;
  private browser: Browser | null = null;
  private marker: string | null = null;
  private launchedAt = 0;
  private contextsServed = 0;
  private restarts = 0;
  private launchChain: Promise<Browser> | null = null;

  constructor(private readonly config: ResolvedEngineConfig) {
    this.standby = new FreshPageStandby(() => {
      if (this.expired()) return false;
      const sample = sampleCpu();
      const slots = config.autoConcurrency
        ? deriveConcurrency(config.concurrencyPolicy, sample).target
        : config.maxConcurrentCaptures;
      return sample.freeMemoryMb >= config.concurrencyPolicy.memoryHeadroomMb +
        config.concurrencyPolicy.memoryPerCaptureMb * Math.max(1, slots);
    }, config.launchTimeoutMs, config.closeTimeoutMs);
  }

  get restartCount(): number {
    return this.restarts;
  }

  get health(): EngineBrowserHealth | null {
    if (!this.browser) return null;
    return {
      connected: this.browser.isConnected(),
      age_ms: Math.max(0, Date.now() - this.launchedAt),
      contexts_served: this.contextsServed,
      restarts: this.restarts,
    };
  }

  private expired(): boolean {
    if (!this.browser) return false;
    if (this.contextsServed >= this.config.recycleAfterContexts) return true;
    if (Date.now() - this.launchedAt > this.config.maxBrowserAgeMs) return true;
    return false;
  }

  async ensureBrowser(countContext = true): Promise<Browser> {
    if (this.browser && this.browser.isConnected() && !this.expired()) {
      if (countContext) this.contextsServed += 1;
      return this.browser;
    }
    if (this.launchChain) {
      const pending = await this.launchChain.catch(() => null);
      if (pending && pending.isConnected() && !this.expired()) {
        if (countContext) this.contextsServed += 1;
        return pending;
      }
    }
    const chain = this.launch();
    this.launchChain = chain;
    try {
      const browser = await chain;
      if (countContext) this.contextsServed += 1;
      return browser;
    } finally {
      if (this.launchChain === chain) this.launchChain = null;
    }
  }

  private async launch(): Promise<Browser> {
    const hadBrowser = this.browser !== null;
    if (this.browser) await this.destroyInternal();

    const marker = `${MARKER_PREFIX}${randomUUID()}`;
    const launcher = createLauncher(this.config.stealth);
    const browser = await launcher.launch({
      headless: this.config.headless,
      channel: this.config.channel,
      executablePath: this.config.executablePath,
      timeout: this.config.launchTimeoutMs,
      args: [...this.config.launchArgs, marker],
    });

    this.browser = browser;
    this.marker = marker;
    this.launchedAt = Date.now();
    this.contextsServed = 0;
    if (hadBrowser) this.restarts += 1;
    this.config.logger("debug", "browser launched", {
      restarts: this.restarts,
      headless: this.config.headless,
      stealth: this.config.stealth,
    });
    return browser;
  }

  async recycle(): Promise<void> {
    await this.destroyInternal();
  }

  async destroy(): Promise<void> {
    await this.destroyInternal();
    await this.standby.close();
  }

  private async destroyInternal(): Promise<void> {
    const browser = this.browser;
    const marker = this.marker;
    this.browser = null;
    this.marker = null;
    this.contextsServed = 0;
    this.launchedAt = 0;

    if (!browser) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const closing = browser
      .close()
      .then(() => {
        closed = true;
      })
      .catch(() => {});
    await Promise.race([
      closing,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.config.closeTimeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);

    if (!closed && marker) {
      this.config.logger("warn", "browser close timed out, killing process", {
        marker,
      });
      await this.killByMarker(marker);
    }
    await this.standby.clear();
  }

  private async killByMarker(marker: string): Promise<void> {
    const safe = marker.replace(/"/g, "");
    if (process.platform === "win32") {
      const filter = safe.replace(/'/g, "''");
      const command =
        `powershell -NoProfile -Command "` +
        `Get-CimInstance Win32_Process | Where-Object { \`$_.CommandLine -like '*${filter}*' } | ` +
        `ForEach-Object { Stop-Process -Id \`$_.ProcessId -Force -ErrorAction SilentlyContinue }"`;
      await execShell(command, 8000);
    } else {
      await execShell(`pkill -f '${safe}'`, 8000);
    }
  }
}
