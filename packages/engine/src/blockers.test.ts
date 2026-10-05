import test from "node:test";
import assert from "node:assert/strict";
import { hostMatches, shouldBlockUrl } from "./blockers.js";

test("hostMatches handles exact and subdomain matches", () => {
  assert.equal(hostMatches("doubleclick.net", "doubleclick.net"), true);
  assert.equal(hostMatches("ad.doubleclick.net", "doubleclick.net"), true);
  assert.equal(hostMatches("notdoubleclick.net", "doubleclick.net"), false);
  assert.equal(hostMatches("doubleclick.net.evil.com", "doubleclick.net"), false);
});

test("shouldBlockUrl blocks ad hosts when ads are enabled", () => {
  const policy = { blockAds: true, blockTrackers: true };
  assert.equal(shouldBlockUrl("https://pagead2.googlesyndication.com/ad.js", policy), true);
  assert.equal(shouldBlockUrl("https://adservice.google.com/x", policy), true);
  assert.equal(shouldBlockUrl("https://static.doubleclick.net/instream/ad.js", policy), true);
});

test("shouldBlockUrl blocks tracker hosts when trackers are enabled", () => {
  const policy = { blockAds: true, blockTrackers: true };
  assert.equal(shouldBlockUrl("https://www.google-analytics.com/analytics.js", policy), true);
  assert.equal(shouldBlockUrl("https://connect.facebook.net/en_US/fbevents.js", policy), true);
  assert.equal(shouldBlockUrl("https://cdn.segment.com/analytics.js", policy), true);
});

test("shouldBlockUrl allows first-party and unrelated hosts", () => {
  const policy = { blockAds: true, blockTrackers: true };
  assert.equal(shouldBlockUrl("https://example.com/app.js", policy), false);
  assert.equal(shouldBlockUrl("https://cdn.example.com/img.png", policy), false);
  assert.equal(shouldBlockUrl("https://notgoogle-analytics.com/x", policy), false);
});

test("shouldBlockUrl respects disabled policies", () => {
  const off = { blockAds: false, blockTrackers: false };
  assert.equal(shouldBlockUrl("https://pagead2.googlesyndication.com/ad.js", off), false);
  assert.equal(shouldBlockUrl("https://www.google-analytics.com/analytics.js", off), false);

  const adsOnly = { blockAds: true, blockTrackers: false };
  assert.equal(shouldBlockUrl("https://pagead2.googlesyndication.com/ad.js", adsOnly), true);
  assert.equal(shouldBlockUrl("https://www.google-analytics.com/analytics.js", adsOnly), false);
});

test("shouldBlockUrl ignores non-http protocols and invalid urls", () => {
  const policy = { blockAds: true, blockTrackers: true };
  assert.equal(shouldBlockUrl("file:///C:/doubleclick.net/x", policy), false);
  assert.equal(shouldBlockUrl("data:text/html,x", policy), false);
  assert.equal(shouldBlockUrl("not a url", policy), false);
});

test("shouldBlockUrl is case-insensitive for hosts", () => {
  const policy = { blockAds: true, blockTrackers: true };
  assert.equal(shouldBlockUrl("https://Ad.DoubleClick.NET/ad", policy), true);
});
