import test from "node:test";
import assert from "node:assert/strict";
import { buildBannerRemovalScript, buildBannerStyleCss, CMP_SELECTORS } from "./banners.js";

test("CMP selectors cover the major consent platforms", () => {
  const joined = CMP_SELECTORS.join("\n");
  assert.ok(joined.includes("#onetrust-banner-sdk"));
  assert.ok(joined.includes("#CybotCookiebotDialog"));
  assert.ok(joined.includes("#qc-cmp2-container"));
  assert.ok(joined.includes("#didomi-host"));
  assert.ok(joined.includes(".cky-consent-container"));
  assert.ok(joined.includes("[id*=cookie-banner]"));
});

test("banner removal script embeds selectors, lifetime, and bridge", () => {
  const script = buildBannerRemovalScript();
  assert.ok(script.includes("#onetrust-banner-sdk"));
  assert.ok(script.includes("__snapforgeBannerSweep"));
  assert.ok(script.includes("30000"));
  assert.ok(script.includes("MutationObserver"));
  assert.ok(script.includes("shadowRoot"));
});

test("banner removal script honors custom selectors and lifetime", () => {
  const script = buildBannerRemovalScript(["#custom-banner"], 5000);
  assert.ok(script.includes("#custom-banner"));
  assert.ok(!script.includes("#onetrust-banner-sdk"));
  assert.ok(script.includes("5000"));
});

test("banner style css hides each selector", () => {
  assert.equal(buildBannerStyleCss(["#a", "#b"]), "#a{display:none!important}\n#b{display:none!important}");
});

test("banner removal script is valid javascript", () => {
  const script = buildBannerRemovalScript();
  assert.doesNotThrow(() => new Function(script));
});
