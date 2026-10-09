import { DEVICE_PRESETS } from "@snapforge/contracts";
import type { PlaygroundState } from "./playground";

export interface ConsolePrefs {
  defaultDevice: string;
  defaultFormat: PlaygroundState["format"];
  fullPageByDefault: boolean;
  autoRefreshLogs: boolean;
  showBlockedRequests: boolean;
}

export const DEFAULT_PREFS: ConsolePrefs = {
  defaultDevice: "desktop_standard",
  defaultFormat: "webp",
  fullPageByDefault: false,
  autoRefreshLogs: true,
  showBlockedRequests: true,
};
const STORAGE_KEY = "snapforge.console.prefs";

export function readPreferences(): ConsolePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const value = JSON.parse(raw) as Partial<ConsolePrefs> | null;
    if (!value || typeof value !== "object") return DEFAULT_PREFS;
    return {
      defaultDevice: typeof value.defaultDevice === "string" && Object.hasOwn(DEVICE_PRESETS, value.defaultDevice) ? value.defaultDevice : DEFAULT_PREFS.defaultDevice,
      defaultFormat: ["png", "jpeg", "webp", "pdf"].includes(value.defaultFormat ?? "") ? value.defaultFormat! : DEFAULT_PREFS.defaultFormat,
      fullPageByDefault: typeof value.fullPageByDefault === "boolean" ? value.fullPageByDefault : false,
      autoRefreshLogs: typeof value.autoRefreshLogs === "boolean" ? value.autoRefreshLogs : true,
      showBlockedRequests: typeof value.showBlockedRequests === "boolean" ? value.showBlockedRequests : true,
    };
  } catch { return DEFAULT_PREFS; }
}

export function savePreferences(value: ConsolePrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("sf-preferences-change"));
}

export function preferenceSnapshot() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
export function subscribePreferences(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("sf-preferences-change", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("sf-preferences-change", onChange); };
}
