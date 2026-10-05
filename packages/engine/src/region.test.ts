import test from "node:test";
import assert from "node:assert/strict";
import {
  REGION_PRESETS,
  captureOptionsSchema,
  isRegionId,
} from "@snapforge/contracts";
import { countryMatches, resolveRegion } from "./region.js";

test("region preset table is internally consistent", () => {
  for (const [id, preset] of Object.entries(REGION_PRESETS)) {
    assert.equal(preset.country, preset.country.toUpperCase(), `${id} country`);
    assert.match(preset.locale, /^[a-z]{2}-[A-Z]{2}$/, `${id} locale`);
    assert.match(preset.timezone, /^[A-Za-z]+\/[A-Za-z_]+$/, `${id} timezone`);
    assert.equal(preset.country.length, 2, `${id} country code length`);
    assert.ok(preset.currency.length === 3, `${id} currency`);
    const { latitude, longitude, accuracy } = preset.coordinates;
    assert.ok(latitude >= -90 && latitude <= 90, `${id} latitude`);
    assert.ok(longitude >= -180 && longitude <= 180, `${id} longitude`);
    assert.ok(accuracy > 0, `${id} accuracy`);
  }
});

test("region schema accepts known ids and rejects unknown ones", () => {
  const base = { url: "example.com" };
  const parsed = captureOptionsSchema.parse({ ...base, region: "US" });
  assert.equal(parsed.region, "us", "region is normalised to lowercase");

  const invalid = captureOptionsSchema.safeParse({ ...base, region: "atlantis" });
  assert.equal(invalid.success, false);
  assert.match(invalid.error?.issues[0]?.message ?? "", /Unknown region/);
});

test("isRegionId guards against prototype keys", () => {
  assert.equal(isRegionId("us"), true);
  assert.equal(isRegionId("constructor"), false);
  assert.equal(isRegionId("toString"), false);
  assert.equal(isRegionId("__proto__"), false);
});

test("resolveRegion derives locale, timezone, and currency from the preset", () => {
  const options = captureOptionsSchema.parse({ url: "example.com", region: "jp" });
  const region = resolveRegion(options, "req-1");

  assert.ok(region);
  assert.equal(region.id, "jp");
  assert.equal(region.locale, "ja-JP");
  assert.equal(region.timezone, "Asia/Tokyo");
  assert.equal(region.currency, "JPY");
  assert.equal(region.country, "JP");
  assert.equal(region.proxy, undefined);
});

test("explicit locale and timezone override the preset", () => {
  const options = captureOptionsSchema.parse({
    url: "example.com",
    region: "us",
    locale: "es-US",
    timezone: "America/Chicago",
  });
  const region = resolveRegion(options, "req-2");

  assert.equal(region?.locale, "es-US");
  assert.equal(region?.timezone, "America/Chicago");
});

test("proxy is carried on the resolved region", () => {
  const options = captureOptionsSchema.parse({
    url: "example.com",
    region: "de",
    proxy: {
      server: "http://proxy.example:8080",
      username: "user",
      password: "pass",
    },
  });
  const region = resolveRegion(options, "req-3");

  assert.equal(region?.proxy?.server, "http://proxy.example:8080");
  assert.equal(region?.proxy?.username, "user");
});

test("no region means no geo bundle", () => {
  const options = captureOptionsSchema.parse({ url: "example.com" });
  assert.equal(resolveRegion(options, "req-4"), null);
});

test("countryMatches compares on the ISO code only", () => {
  assert.equal(countryMatches("US", "US"), true);
  assert.equal(countryMatches("us", "US"), true);
  assert.equal(countryMatches(" US ", "US"), true);
  assert.equal(countryMatches("GB", "US"), false);
  assert.equal(countryMatches("United States", "US"), false);
  assert.equal(countryMatches(null, "US"), false);
  assert.equal(countryMatches(undefined, "US"), false);
});
