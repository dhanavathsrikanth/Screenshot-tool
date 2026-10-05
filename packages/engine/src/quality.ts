import type { Page } from "playwright";
import { SnapforgeError, type CaptureOptions } from "@snapforge/contracts";
import type { SettlementBudget } from "./settlement.js";
import { sleep } from "./util.js";

export interface QualityState {
  text: string;
  loadingShell: boolean;
}

export function readQualityState(selector?: string): QualityState {
  const visible = (element: Element): boolean => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < innerHeight && rect.left < innerWidth && style.visibility !== "hidden" &&
      style.display !== "none" && style.opacity !== "0";
  };
  const root = (selector ? document.querySelector(selector) : document.querySelector("main, [role=main]")) ?? document.body;
  let content = "";
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let visited = 0;
    while ((node = walker.nextNode()) && visited++ < 20_000 && content.length < 1000) {
      const parent = node.parentElement;
      if (!parent || parent.closest("nav,header,footer,aside,script,style,[aria-hidden=true]")) continue;
      if (visible(parent)) content += ` ${node.textContent ?? ""}`;
    }
  }
  content = content.replace(/\s+/g, " ").trim();
  const loader = root ? Array.from(root.querySelectorAll(
    '[role="progressbar"],[role="status"],[aria-busy="true"],[data-testid*="loading" i],[data-testid*="spinner" i],[aria-label*="loading" i],.loading,.spinner',
  )).some((element) => !element.closest("nav,header,footer,aside") && visible(element)) ||
    (root.getAttribute("aria-busy") === "true" && visible(root)) : false;
  const visual = root ? Array.from(root.querySelectorAll("img,video,canvas,iframe,svg")).some((element) => {
    if (!visible(element) || element.closest("nav,header,footer,aside")) return false;
    if (element.tagName === "IMG") return (element as HTMLImageElement).naturalWidth > 0;
    return element.getBoundingClientRect().width * element.getBoundingClientRect().height >= 10_000;
  }) : false;
  return {
    text: (document.body?.innerText ?? "").slice(0, 1_000_000),
    loadingShell: /^(?:loading(?:\s+\w+){0,3}|please wait)[.!…\s]*$/i.test(content) ||
      (loader && content.length < 80 && !visual),
  };
}

export function qualityFailures(state: QualityState, options: CaptureOptions): string[] {
  const text = state.text.toLocaleLowerCase();
  return [
    ...(options.fail_if_incomplete && state.loadingShell ? ["loading_shell"] : []),
    ...options.fail_if_content_missing.filter((value) => !text.includes(value.toLocaleLowerCase())).map((value) => `missing_content: ${value}`),
    ...options.fail_if_content_contains.filter((value) => text.includes(value.toLocaleLowerCase())).map((value) => `forbidden_content: ${value}`),
  ];
}

export async function ensureCaptureQuality(
  page: Page,
  options: CaptureOptions,
  budget: SettlementBudget,
  waitMs: number,
  requestId: string,
): Promise<void> {
  if (!options.fail_if_incomplete && !options.fail_if_content_missing.length && !options.fail_if_content_contains.length) return;
  const deadline = Date.now() + Math.min(waitMs, budget.remaining());
  let failures: string[];
  do {
    failures = qualityFailures(await page.evaluate(readQualityState, options.selector), options);
    if (!failures.length) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(250, remaining));
  } while (true);
  throw new SnapforgeError({
    code: "render_incomplete",
    message: "Page did not satisfy capture quality requirements",
    requestId,
    details: { failures, final_url: page.url() },
  });
}

export function ensureOutputQuality(output: { height: number; buffer: Buffer }, options: CaptureOptions, requestId: string): void {
  const failures = [
    ...(options.min_capture_height && output.height < options.min_capture_height ? ["min_capture_height"] : []),
    ...(options.min_capture_bytes && output.buffer.length < options.min_capture_bytes ? ["min_capture_bytes"] : []),
  ];
  if (failures.length) throw new SnapforgeError({
    code: "render_incomplete",
    message: "Capture output did not satisfy minimum dimensions or size",
    requestId,
    details: { failures, height: output.height, bytes: output.buffer.length },
  });
}
