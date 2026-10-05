import test from "node:test";
import assert from "node:assert/strict";
import {
  BENCHMARK_TIERS,
  SITE_SUITE,
  SITES_PER_TIER,
  selectSites,
  type BenchmarkSite,
} from "../src/sites.js";

test("the suite holds exactly 30 sites, 10 per tier", () => {
  assert.equal(SITE_SUITE.length, 30);
  for (const tier of BENCHMARK_TIERS) {
    const count = SITE_SUITE.filter((site) => site.tier === tier).length;
    assert.equal(count, SITES_PER_TIER, `expected ${SITES_PER_TIER} ${tier} sites`);
  }
});

test("site ids are unique and kebab-case", () => {
  const ids = SITE_SUITE.map((site) => site.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate site ids");
  for (const id of ids) {
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id "${id}" is not kebab-case`);
  }
});

test("every site has a valid http(s) URL and a description", () => {
  for (const site of SITE_SUITE) {
    const url = new URL(site.url);
    assert.ok(["http:", "https:"].includes(url.protocol), `${site.id} has a non-http URL`);
    assert.ok(site.note.length > 0, `${site.id} is missing a note`);
  }
});

test("every site declares at least one correctness check", () => {
  for (const site of SITE_SUITE) {
    const checks = site.checks;
    const declared =
      (checks.expectText?.length ?? 0) > 0 ||
      (checks.forbidText?.length ?? 0) > 0 ||
      (checks.forbidFinalUrl?.length ?? 0) > 0 ||
      checks.minBytes !== undefined ||
      checks.minHeight !== undefined ||
      checks.maxHeight !== undefined;
    assert.ok(declared, `${site.id} declares no checks`);
  }
});

test("moderate and hard sites assert on page text", () => {
  for (const site of SITE_SUITE) {
    if (site.tier === "easy") continue;
    assert.ok(
      (site.checks.expectText?.length ?? 0) > 0,
      `${site.id} should assert expectText`,
    );
  }
});

test("site options never override the target url", () => {
  for (const site of SITE_SUITE) {
    const options = (site.options ?? {}) as Record<string, unknown>;
    assert.equal(options.url, undefined, `${site.id} pins a url in options`);
  }
});

test("selectSites filters by tier and id, and composes", () => {
  assert.equal(selectSites().length, 30);
  assert.equal(selectSites(SITE_SUITE, { tiers: ["hard"] }).length, 10);
  assert.equal(selectSites(SITE_SUITE, { tiers: ["easy", "moderate"] }).length, 20);

  const byId = selectSites(SITE_SUITE, { ids: ["example-com"] });
  assert.equal(byId.length, 1);
  assert.equal(byId[0].id, "example-com");

  const composed: BenchmarkSite[] = selectSites(SITE_SUITE, { tiers: ["hard"], ids: ["reddit-feed"] });
  assert.equal(composed.length, 1);
  assert.equal(composed[0].id, "reddit-feed");

  assert.equal(selectSites(SITE_SUITE, { ids: ["nope"] }).length, 0);
});
