import { DEVICE_PRESETS } from "@snapforge/contracts";
import type { CaptureOptionsInput } from "@snapforge/contracts";

export interface PlaygroundState {
  url: string;
  device: string;
  customWidth: number;
  customHeight: number;
  format: "png" | "jpeg" | "webp" | "pdf";
  quality: number;
  fullPage: boolean;
  darkMode: boolean;
  waitUntil: "load" | "domcontentloaded" | "networkidle";
  waitForIdle: boolean;
  waitForSelector: string;
  delay: number;
  timeout: number;
  blockAds: boolean;
  blockCookieBanners: boolean;
  blockTrackers: boolean;
  hideSelectors: string;
  removeSelectors: string;
  customCss: string;
  customJs: string;
}

export const DEFAULT_STATE: PlaygroundState = {
  url: "https://example.com",
  device: "desktop_standard",
  customWidth: 1280,
  customHeight: 720,
  format: "png",
  quality: 85,
  fullPage: false,
  darkMode: false,
  waitUntil: "networkidle",
  waitForIdle: true,
  waitForSelector: "",
  delay: 0,
  timeout: 30000,
  blockAds: true,
  blockCookieBanners: true,
  blockTrackers: true,
  hideSelectors: "",
  removeSelectors: "",
  customCss: "",
  customJs: "",
};

export function splitSelectors(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function effectiveViewport(state: PlaygroundState) {
  if (state.device === "custom") {
    return {
      width: state.customWidth,
      height: state.customHeight,
      deviceScaleFactor: 1,
    };
  }
  const preset = DEVICE_PRESETS[state.device];
  return {
    width: preset.viewport.width,
    height: preset.viewport.height,
    deviceScaleFactor: preset.viewport.deviceScaleFactor ?? 1,
  };
}

export function toCaptureOptions(state: PlaygroundState): CaptureOptionsInput {
  const options: Record<string, unknown> = {
    url: state.url,
    format: state.format,
    full_page: state.fullPage,
    quality: state.quality,
    dark_mode: state.darkMode,
    wait_until: state.waitUntil,
    wait_for_idle: state.waitForIdle,
    delay: state.delay,
    timeout: state.timeout,
    block_ads: state.blockAds,
    block_cookie_banners: state.blockCookieBanners,
    block_trackers: state.blockTrackers,
  };

  if (state.device === "custom") {
    options.viewport = {
      width: state.customWidth,
      height: state.customHeight,
      deviceScaleFactor: 1,
    };
  } else {
    options.device = state.device;
  }

  const selector = state.waitForSelector.trim();
  if (selector) options.wait_for_selector = selector;

  const hide = splitSelectors(state.hideSelectors);
  if (hide.length > 0) options.hide_selectors = hide;

  const remove = splitSelectors(state.removeSelectors);
  if (remove.length > 0) options.remove_selectors = remove;

  if (state.customCss.trim()) options.custom_css = state.customCss;
  if (state.customJs.trim()) options.custom_js = state.customJs;

  return options as CaptureOptionsInput;
}

function toQuery(options: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return search.toString();
}

const API_BASE = "https://api.snapforge.dev";

export function buildCurl(state: PlaygroundState): string {
  const options = toCaptureOptions(state) as Record<string, unknown>;
  return [
    `curl -X POST ${API_BASE}/v1/screenshot \\`,
    `  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${JSON.stringify(options, null, 2)}'`,
  ].join("\n");
}

export function buildTypeScript(state: PlaygroundState): string {
  const options = JSON.stringify(toCaptureOptions(state), null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return `import { Snapforge } from "@snapforge/sdk";

const snapforge = new Snapforge({ apiKey: process.env.SNAPFORGE_API_KEY! });

const job = await snapforge.screenshot({
${options}
});

console.log(job.url, job.width + "x" + job.height, job.duration_ms + "ms");`;
}

export function buildPython(state: PlaygroundState): string {
  const options = JSON.stringify(toCaptureOptions(state), null, 2)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

  return `import os
import requests

response = requests.post(
    "${API_BASE}/v1/screenshot",
    headers={
        "Authorization": f"Bearer {os.environ['SNAPFORGE_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
${options}
    },
    timeout=60,
)

payload = response.json()
print(payload["data"]["url"], payload["data"]["duration_ms"], "ms")`;
}

export function buildQueryCurl(state: PlaygroundState): string {
  return `curl -G ${API_BASE}/v1/screenshot \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  --data-urlencode "url=${state.url}"${state.format === "png" ? "" : ` \\
  --data-urlencode "format=${state.format}"`}`;
}

export function buildMcpConfig(state: PlaygroundState): string {
  const options = toCaptureOptions(state);
  return JSON.stringify(
    {
      mcpServers: {
        snapforge: {
          command: "npx",
          args: ["-y", "@snapforge/mcp"],
          env: {
            SNAPFORGE_API_KEY: "<your-api-key>",
            SNAPFORGE_DEFAULT_OPTIONS: JSON.stringify(options),
          },
        },
      },
    },
    null,
    2,
  );
}

export function toQueryString(state: PlaygroundState): string {
  return toQuery(toCaptureOptions(state) as Record<string, unknown>);
}
