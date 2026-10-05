import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { CaptureTimer } from "./timings.js";

export interface FreshPage {
  context: BrowserContext;
  page: Page;
}

interface PendingPage {
  browser: Browser;
  key: string;
  result: Promise<FreshPage | null>;
  context?: BrowserContext;
  cancelled: boolean;
  controller: AbortController;
}

export class FreshPageStandby {
  private pending: PendingPage | null = null;
  private closed = false;

  constructor(
    private readonly canPrepare: () => boolean = () => true,
    private readonly startupTimeoutMs = 30_000,
    private readonly closeTimeoutMs = 3_000,
  ) {}

  private async bounded<T>(operation: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms exceeded preparing or closing capture page`)), timeoutMs);
          abort = () => reject(new Error("Page preparation cancelled"));
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) signal?.removeEventListener("abort", abort);
    }
  }

  private async closeContext(context: BrowserContext): Promise<void> {
    await this.bounded(context.close(), this.closeTimeoutMs).catch(() => {});
  }

  private async create(browser: Browser, options: BrowserContextOptions, timer?: CaptureTimer, pending?: PendingPage): Promise<FreshPage> {
    const opening = browser.newContext(options);
    let abandoned = false;
    void opening.then(async (context) => {
      if (abandoned || pending?.cancelled) await this.closeContext(context);
    }).catch(() => {});
    const open = async () => {
      try {
        return await this.bounded(opening, this.startupTimeoutMs, pending?.controller.signal);
      } catch (error) {
        abandoned = true;
        throw error;
      }
    };
    const context = timer ? await timer.measure("context_setup", open) : await open();
    try {
      if (pending) {
        pending.context = context;
        if (pending.cancelled) throw new Error("Page preparation cancelled");
      }
      const page = timer
        ? await timer.measure("page_setup", () => this.bounded(context.newPage(), this.startupTimeoutMs, pending?.controller.signal))
        : await this.bounded(context.newPage(), this.startupTimeoutMs, pending?.controller.signal);
      return { context, page };
    } catch (error) {
      await this.closeContext(context);
      throw error;
    }
  }

  async take(browser: Browser, options: BrowserContextOptions, timer: CaptureTimer): Promise<FreshPage> {
    if (this.closed) throw new Error("Page standby is closed");
    const pending = this.pending;
    this.pending = null;
    if (pending?.browser === browser && pending.key === JSON.stringify(options)) {
      const fresh = await timer.measure("page_setup", () => pending.result);
      if (fresh && !fresh.page.isClosed()) return fresh;
      if (fresh) await this.closeContext(fresh.context);
    } else if (pending) {
      await this.discard(pending);
    }
    return this.create(browser, options, timer);
  }

  prepare(browser: Browser, options: BrowserContextOptions, startup = false): void {
    if (this.closed || this.pending || !browser.isConnected() || (!startup && !this.canPrepare())) return;
    const pending: PendingPage = {
      browser,
      key: JSON.stringify(options),
      result: Promise.resolve(null),
      cancelled: false,
      controller: new AbortController(),
    };
    this.pending = pending;
    pending.result = this.create(browser, options, undefined, pending).catch(() => null);
  }

  async prime(browser: Browser, options: BrowserContextOptions): Promise<void> {
    if (this.closed) throw new Error("Page standby is closed");
    if (this.pending && (this.pending.browser !== browser || this.pending.key !== JSON.stringify(options))) {
      await this.clear();
    }
    this.prepare(browser, options, true);
    const fresh = await this.pending?.result;
    if (!fresh || fresh.page.isClosed()) throw new Error("Startup page preparation failed");
  }

  private async discard(pending: PendingPage): Promise<void> {
    pending.cancelled = true;
    pending.controller.abort();
    if (pending.context) await this.closeContext(pending.context);
    const unused = await this.bounded(pending.result, this.closeTimeoutMs).catch(() => null);
    if (unused && !pending.context) await this.closeContext(unused.context);
  }

  async clear(): Promise<void> {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    await this.discard(pending);
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.clear();
  }
}
