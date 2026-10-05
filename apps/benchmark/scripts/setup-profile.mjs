import { createLauncher } from "@snapforge/engine";

for (const channel of [undefined, "chromium"]) {
  const stealth = true;
  const browser = await createLauncher(stealth).launch({ headless: true, channel });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const start = performance.now();
      const context = await browser.newContext();
      const contextMs = performance.now() - start;
      const pageStart = performance.now();
      const page = await context.newPage();
      const pageMs = performance.now() - pageStart;
      const navStart = performance.now();
      await page.goto("about:blank");
      const navMs = performance.now() - navStart;
      console.log(JSON.stringify({ channel: channel ?? "headless-shell", stealth, attempt, contextMs, pageMs, navMs }));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
