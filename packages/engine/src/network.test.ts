import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicProxyUrl, assertPublicUrl, isPublicAddress } from "./network.js";
import { SnapforgeError } from "@snapforge/contracts";

test("public network policy rejects local, metadata, mapped, and reserved addresses", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.20.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "::1", "::", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2002:7f00:1::"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPublicAddress(address), true, address);
});

test("DNS validation rejects a hostname with any private answer", async () => {
  await assert.rejects(assertPublicUrl("https://example.com", "network", async () => [{ address: "8.8.8.8" }, { address: "127.0.0.1" }]), /private or reserved/);
  await assertPublicUrl("https://example.com", "network", async () => [{ address: "8.8.8.8" }]);
});

test("well-known NAT64 translations apply the embedded IPv4 network policy", async () => {
  for (const address of ["64:ff9b::808:808", "64:ff9b::198.137.150.111"]) assert.equal(isPublicAddress(address), true, address);
  for (const address of ["64:ff9b::7f00:1", "64:ff9b::a00:1", "64:ff9b::a9fe:a9fe", "64:ff9b::c0a8:1", "64:ff9b::6440:1", "64:ff9b::c612:1", "64:ff9b:1::808:808"]) assert.equal(isPublicAddress(address), false, address);
  await assertPublicUrl("https://stripe.com", "translated", async () => [{ address: "64:ff9b::c689:966f" }, { address: "198.137.150.111" }]);
  await assert.rejects(assertPublicUrl("https://example.com", "translated", async () => [{ address: "64:ff9b::7f00:1" }]), /private or reserved/);
});

test("encoded IP addresses and local hostnames cannot bypass public URL validation", async () => {
  for (const url of ["http://2130706433", "http://0x7f000001", "http://localhost", "http://metadata.google.internal", "http://[::ffff:7f00:1]", "file:///etc/passwd"]) {
    await assert.rejects(assertPublicUrl(url, "network", async () => [{ address: "8.8.8.8" }]), /private or reserved/);
  }
});

test("proxy network validation accepts supported public endpoints and rejects private or malformed ones", async () => {
  const publicLookup = async () => [{ address: "8.8.8.8" }];
  for (const server of ["proxy.example.com:8080", "http://proxy.example.com:8080", "https://proxy.example.com:8080", "socks4://proxy.example.com:8080", "socks5://proxy.example.com:8080"]) {
    await assertPublicProxyUrl(server, "proxy", publicLookup);
  }
  for (const server of ["socks5://127.0.0.1:1080", "proxy.example.com:bad", "file:///tmp/proxy", "http://user:password@proxy.example.com:8080"]) {
    await assert.rejects(assertPublicProxyUrl(server, "proxy", publicLookup), (error: unknown) => error instanceof SnapforgeError && error.code === "invalid_request");
  }
  await assert.rejects(assertPublicUrl("not a URL", "proxy"), (error: unknown) => error instanceof SnapforgeError && error.code === "invalid_request");
});
