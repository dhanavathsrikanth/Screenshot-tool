import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { createEngine, verifyEgress, type ResolvedRegion } from "./index.js";

const JP: ResolvedRegion = {
  id: "jp",
  locale: "ja-JP",
  timezone: "Asia/Tokyo",
  currency: "JPY",
  country: "JP",
};

const DE: ResolvedRegion = {
  id: "de",
  locale: "de-DE",
  timezone: "Europe/Berlin",
  currency: "EUR",
  country: "DE",
};

/**
 * The lookup endpoint is the only seam verification has, so tests serve their own
 * country instead of reaching a third-party geolocation API.
 */
function geoServer(country: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith("/json")) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<p>not found</p>");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ country_code: country }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/json/`,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

test("verifyEgress passes when the context egresses from the region", async (t) => {
  const geo = await geoServer("JP");
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  t.after(async () => {
    await context.close();
    await browser.close();
    await geo.close();
  });

  const result = await verifyEgress(
    context,
    JP,
    "req-ok",
    "https://example.com",
    geo.url,
  );

  assert.equal(result.checked, true);
  assert.equal(result.country, "JP");
});

test("verifyEgress rejects an egress country outside the region", async (t) => {
  const geo = await geoServer("US");
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  t.after(async () => {
    await context.close();
    await browser.close();
    await geo.close();
  });

  await assert.rejects(
    verifyEgress(context, JP, "req-mismatch", "https://example.com", geo.url),
    (err: Error) => {
      assert.match(err.message, /Egress country US does not match/);
      return true;
    },
  );
});

test("verifyEgress reports an unreachable lookup as retriable", async (t) => {
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  t.after(async () => {
    await context.close();
    await browser.close();
  });

  await assert.rejects(
    verifyEgress(context, JP, "req-down", "https://example.com", "http://127.0.0.1:1/"),
    (err: Error) => {
      assert.match(err.message, /Could not verify egress/);
      assert.equal((err as { retriable?: boolean }).retriable, true);
      return true;
    },
  );
});

test("a region preset drives locale, timezone, and geolocation on the context", async (t) => {
  const geo = await geoServer("DE");
  const site = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>t</title><h1 id=h>geo</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const sitePort = (site.address() as AddressInfo).port;

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: DE.locale,
    timezoneId: DE.timezone,
    geolocation: { latitude: 51.1657, longitude: 10.4515, accuracy: 1000 },
    permissions: ["geolocation"],
  });

  t.after(async () => {
    await context.close();
    await browser.close();
    await geo.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  });

  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${sitePort}/`, { waitUntil: "load" });

  assert.equal(await page.evaluate(() => navigator.language), "de-DE");
  assert.equal(
    await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    "Europe/Berlin",
  );

  const coords = await page.evaluate(
    () =>
      new Promise<{ latitude: number; longitude: number }>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          reject,
          { timeout: 5000 },
        ),
      ),
  );
  assert.ok(Math.abs(coords.latitude - 51.1657) < 0.01, "latitude matches preset");
  assert.ok(Math.abs(coords.longitude - 10.4515) < 0.01, "longitude matches preset");

  const result = await verifyEgress(
    context,
    DE,
    "req-de",
    `http://127.0.0.1:${sitePort}/`,
    geo.url,
  );
  assert.equal(result.country, "DE");
});

test("the engine fails a region request whose egress is in the wrong country", async (t) => {
  const geo = await geoServer("US");
  const site = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>t</title><h1>never reached</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const sitePort = (site.address() as AddressInfo).port;

  const engine = createEngine({
    stealth: false,
    egressLookupUrl: geo.url,
  });

  t.after(async () => {
    await engine.close();
    await geo.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  });

  await assert.rejects(
    engine.capture({
      url: `http://127.0.0.1:${sitePort}/`,
      region: "jp",
      timeout: 15000,
    }),
    (err: Error) => {
      assert.match(err.message, /Egress country US does not match/);
      assert.match(err.message, /requested region "jp"/);
      return true;
    },
  );
});

test("a matching region reports the region and verified country", async (t) => {
  const geo = await geoServer("JP");
  const site = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>t</title><h1 id=h>geo ok</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const sitePort = (site.address() as AddressInfo).port;

  const engine = createEngine({
    stealth: false,
    egressLookupUrl: geo.url,
  });

  t.after(async () => {
    await engine.close();
    await geo.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  });

  const { data } = await engine.capture({
    url: `http://127.0.0.1:${sitePort}/`,
    region: "jp",
    timeout: 15000,
  });

  assert.equal(data.region, "jp");
  assert.equal(data.egress_country, "JP");
  assert.ok(data.bytes > 1000);
});

test("captures still succeed when no region is requested", async (t) => {
  const site = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>t</title><h1 id=h>plain</h1>");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const sitePort = (site.address() as AddressInfo).port;

  const engine = createEngine({ stealth: false });

  t.after(async () => {
    await engine.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  });

  const { data } = await engine.capture({
    url: `http://127.0.0.1:${sitePort}/`,
    timeout: 15000,
  });

  assert.equal(data.region, undefined, "no region reported");
  assert.equal(data.egress_country, undefined, "no egress lookup performed");
});

test("an unknown region is rejected before a browser is needed", async (t) => {
  const engine = createEngine({ stealth: false });
  t.after(() => engine.close());

  await assert.rejects(
    engine.capture({ url: "https://example.com", region: "atlantis" }),
    (err: Error) => {
      assert.match(err.message, /Unknown region/);
      return true;
    },
  );
});
