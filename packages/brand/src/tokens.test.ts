import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND_HEX,
  BRAND_NEUTRAL,
  BRAND_PRIMARY,
  BRAND_STATUS,
  BRAND_SURFACE_DARK,
  BRAND_SURFACE_LIGHT,
  BRAND_THEMES,
} from "./tokens.js";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

test("primary scale is anchored on the verified Hostinger brand purple", () => {
  assert.equal(BRAND_HEX, "#673DE6");
  assert.equal(BRAND_PRIMARY[600], BRAND_HEX);
});

test("primary scale runs monotonically from lightest to darkest", () => {
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
  const luminances = steps.map((s) => relativeLuminance(BRAND_PRIMARY[s]));
  for (let i = 1; i < luminances.length; i++) {
    assert.ok(
      luminances[i] < luminances[i - 1],
      `step ${steps[i]} should be darker than step ${steps[i - 1]}`,
    );
  }
});

test("every colour token is a valid 6-digit hex", () => {
  const all = [
    ...Object.values(BRAND_PRIMARY),
    ...Object.values(BRAND_NEUTRAL),
    ...Object.values(BRAND_STATUS),
  ];
  for (const hex of all) {
    assert.match(hex, HEX_PATTERN);
  }
});

test("brand primary clears WCAG AA for body text on white", () => {
  assert.ok(contrastRatio(BRAND_PRIMARY[600], "#FFFFFF") >= 4.5);
});

test("dark theme body text and status text clear WCAG AA on the canvas", () => {
  const canvas = BRAND_SURFACE_DARK.canvas;
  assert.ok(contrastRatio(BRAND_SURFACE_DARK.textPrimary, canvas) >= 4.5);
  assert.ok(contrastRatio(BRAND_SURFACE_DARK.textSecondary, canvas) >= 4.5);
  assert.ok(contrastRatio(BRAND_SURFACE_DARK.accent, canvas) >= 4.5);
  for (const key of ["successText", "warningText", "dangerText", "infoText"] as const) {
    assert.ok(contrastRatio(BRAND_STATUS[key], canvas) >= 4.5, `${key} on dark canvas`);
  }
});

test("light theme body text clears WCAG AA on the canvas", () => {
  const canvas = BRAND_SURFACE_LIGHT.canvas;
  assert.ok(contrastRatio(BRAND_SURFACE_LIGHT.textPrimary, canvas) >= 4.5);
  assert.ok(contrastRatio(BRAND_SURFACE_LIGHT.textSecondary, canvas) >= 4.5);
});

test("both themes are registered and share the same role keys", () => {
  assert.deepEqual(Object.keys(BRAND_THEMES), ["dark", "light"]);
  assert.deepEqual(Object.keys(BRAND_THEMES.dark), Object.keys(BRAND_THEMES.light));
});
