import test from "node:test";
import assert from "node:assert/strict";
import { createLauncher } from "./stealth.js";

test("stealth preserves iframe srcdoc and isolates layout measurements from the parent", { timeout: 30_000 }, async (t) => {
  const browser = await createLauncher(true).launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<html><body style="margin:0"><main style="height:1800px">Parent content</main></body></html>');
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.id = "measurement";
    frame.style.display = "none";
    frame.srcdoc = '<html><body>Isolated measurement</body></html>';
    document.body.append(frame);
  });
  await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>("#measurement")?.contentDocument?.body?.textContent === "Isolated measurement", undefined, { timeout: 5000 });
  const geometry = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("#measurement")!;
    const child = frame.contentWindow!.document;
    child.body.style.width = "4000px";
    child.body.style.zoom = "0.5";
    child.body.append("word ".repeat(100));
    return { isolated: child !== document, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, parentStyle: document.body.getAttribute("style"), parentText: document.body.innerText };
  });
  assert.equal(geometry.isolated, true);
  assert.equal(geometry.width, 1280);
  assert.equal(geometry.height, 1800);
  assert.equal(geometry.parentStyle, "margin:0");
  assert.equal(geometry.parentText, "Parent content");
});
