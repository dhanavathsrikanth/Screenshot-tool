import type { Page } from "playwright";

export async function freezeViewportMotion(page: Page) {
  return page.evaluateHandle(() => {
    const paused: Animation[] = [];
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (target instanceof Element) {
        const rect = target.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) continue;
      }
      const timing = animation.effect?.getComputedTiming();
      if (timing && Number.isFinite(timing.endTime)) {
        try { animation.finish(); } catch {}
      } else if (animation.playState === "running") {
        animation.pause();
        paused.push(animation);
      }
    }
    const media = Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio")).filter((element) => !element.paused);
    for (const element of media) element.pause();
    const timeline = (window as unknown as { gsap?: { globalTimeline?: { paused(): boolean; pause(): void; resume(): void } } }).gsap?.globalTimeline;
    const resumeTimeline = timeline && !timeline.paused();
    if (resumeTimeline) timeline.pause();
    return { paused, media, timeline, resumeTimeline };
  });
}

export async function waitForViewportStability(page: Page, timeoutMs: number): Promise<void> {
  if (timeoutMs <= 0) return;
  await page.evaluate(async (timeout) => {
    const deadline = performance.now() + timeout;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,p,img,video,canvas,main > *,section > *"))
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.bottom > 0 && rect.top < innerHeight; })
      .slice(0, 80);
    const signature = () => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height), style.opacity, style.transform].join(",");
    }).join(";");
    let previous = signature();
    let stable = 0;
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(80, Math.max(0, deadline - performance.now()))));
      const current = signature();
      stable = current === previous ? stable + 1 : 0;
      if (stable >= 2) return;
      previous = current;
    }
  }, timeoutMs);
}
