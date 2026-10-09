import { chromium as pwChromium, type Browser, type LaunchOptions } from "playwright";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

export interface FingerprintProfile {
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  languages: string[];
  webglVendor: string;
  webglRenderer: string;
  canvasSeed: number;
}

export interface EngineLauncher {
  launch(options?: LaunchOptions): Promise<Browser>;
}

let cachedStealthLauncher: EngineLauncher | null = null;

export function createLauncher(stealth: boolean): EngineLauncher {
  if (!stealth) return pwChromium;
  if (!cachedStealthLauncher) {
    const extra = addExtra(pwChromium);
    const plugin = StealthPlugin();
    plugin.enabledEvasions.delete("iframe.contentWindow");
    extra.use(plugin);
    cachedStealthLauncher = extra;
  }
  return cachedStealthLauncher;
}

export function derivePlatform(userAgent?: string): string {
  const ua = userAgent ?? "";
  if (/Android/i.test(ua)) return "Linux armv8l";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone";
  if (/Mac OS X/i.test(ua)) return "MacIntel";
  if (/Windows/i.test(ua)) return "Win32";
  if (/X11|Linux/i.test(ua)) return "Linux x86_64";
  if (process.platform === "darwin") return "MacIntel";
  if (process.platform === "linux") return "Linux x86_64";
  return "Win32";
}

export function buildUserAgent(browserVersion: string): string {
  let os = "Windows NT 10.0; Win64; x64";
  if (process.platform === "darwin") os = "Macintosh; Intel Mac OS X 10_15_7";
  else if (process.platform === "linux") os = "X11; Linux x86_64";
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
}

export function defaultFingerprint(platform: string): FingerprintProfile {
  return {
    platform,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    languages: ["en-US", "en"],
    webglVendor: "Google Inc. (NVIDIA)",
    webglRenderer:
      "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    canvasSeed: 0x5f3759df,
  };
}

export function buildFingerprintScripts(profile: FingerprintProfile): string[] {
  const identity = `(() => {
  const P = ${JSON.stringify(profile)};
  const def = (proto, prop, get) => {
    try {
      Object.defineProperty(proto, prop, { get, configurable: true, enumerable: true });
    } catch (e) {}
  };
  def(Navigator.prototype, "webdriver", () => undefined);
  def(Navigator.prototype, "languages", () => Object.freeze(P.languages.slice()));
  def(Navigator.prototype, "language", () => P.languages[0]);
  def(Navigator.prototype, "platform", () => P.platform);
  def(Navigator.prototype, "hardwareConcurrency", () => P.hardwareConcurrency);
  def(Navigator.prototype, "deviceMemory", () => P.deviceMemory);
  def(Navigator.prototype, "vendor", () => "Google Inc.");
  def(Navigator.prototype, "vendorSub", () => "");
  def(Navigator.prototype, "appName", () => "Netscape");
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) window.chrome.runtime = {};
  if (!window.chrome.loadTimes) {
    window.chrome.loadTimes = function () {
      return { requestTime: Date.now() / 1000, startLoadTime: Date.now() / 1000, commitLoadTime: Date.now() / 1000, firstPaintTime: Date.now() / 1000, firstPaintAfterLoadTime: 0, navigationType: "Other", wasFetchedViaSpdy: false, wasNpnNegotiated: false, npnNegotiatedProtocol: "unknown", wasAlternateProtocolAvailable: false, connectionInfo: "unknown" };
    };
  }
  if (!window.chrome.csi) {
    window.chrome.csi = function () {
      return { startE: Date.now(), onloadT: Date.now(), pageT: Date.now(), tran: "8" };
    };
  }
  if (!window.chrome.app) {
    window.chrome.app = { isInstalled: false, getDetails: function () { return null; }, getIsInstalled: function () { return false; }, runningState: function () { return "cannot run"; } };
  }
  try {
    if (typeof navigator.connection === "undefined") {
      def(Navigator.prototype, "connection", () => Object.freeze({ effectiveType: "4g", rtt: 50, downlink: 10, saveData: false }));
    }
  } catch (e) {}
})();`;

  const webgl = `(() => {
  const P = ${JSON.stringify({ vendor: profile.webglVendor, renderer: profile.webglRenderer })};
  const patch = (proto) => {
    if (!proto || typeof proto.getParameter !== "function") return;
    try {
      const original = proto.getParameter;
      proto.getParameter = function (param) {
        if (param === 37414) return P.vendor;
        if (param === 37415) return P.renderer;
        return original.apply(this, arguments);
      };
      proto.getParameter.toString = function () {
        return "function getParameter() { [native code] }";
      };
    } catch (e) {}
  };
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
})();`;

  const canvas = `(() => {
  const SEED = ${profile.canvasSeed >>> 0};
  let state = SEED;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise = (data) => {
    const stride = data.length > 4096 ? 80 : 40;
    for (let i = 0; i < data.length; i += stride) {
      if (next() < 0.35) data[i] = data[i] ^ 1;
    }
  };
  try {
    const ctxProto = CanvasRenderingContext2D.prototype;
    const originalGetImageData = ctxProto.getImageData;
    ctxProto.getImageData = function () {
      const image = originalGetImageData.apply(this, arguments);
      try { noise(image.data); } catch (e) {}
      return image;
    };
    ctxProto.getImageData.toString = function () {
      return "function getImageData() { [native code] }";
    };
  } catch (e) {}
  try {
    const canvasProto = HTMLCanvasElement.prototype;
    const originalToDataURL = canvasProto.toDataURL;
    canvasProto.toDataURL = function () {
      try {
        const area = (this.width || 0) * (this.height || 0);
        if (area > 0 && area <= 4096) {
          const ctx = this.getContext("2d");
          if (ctx) {
            const image = originalGetImageData.call(ctx, 0, 0, this.width, this.height);
            noise(image.data);
            ctx.putImageData(image, 0, 0);
          }
        }
      } catch (e) {}
      return originalToDataURL.apply(this, arguments);
    };
    canvasProto.toDataURL.toString = function () {
      return "function toDataURL() { [native code] }";
    };
  } catch (e) {}
})();`;

  return [identity, webgl, canvas];
}
