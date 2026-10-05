import test from "node:test";
import assert from "node:assert/strict";
import { SnapforgeError } from "@snapforge/contracts";
import { createDashboardEngine } from "./engine.js";

test("dashboard engine rejects private targets and proxies before cache lookup or browser startup", async () => {
  let lookups = 0;
  const engine = createDashboardEngine({ lookup: async () => { lookups++; return null; }, save: async (_, data) => data });
  try {
    for (const url of ["http://localhost", "http://127.0.0.1", "http://2130706433", "http://0x7f000001", "http://10.0.0.1", "http://169.254.169.254", "http://[::ffff:7f00:1]"]) {
      await assert.rejects(engine.capture({ url }), (error: unknown) => error instanceof SnapforgeError && error.code === "invalid_request");
    }
    await assert.rejects(engine.capture({ url: "https://8.8.8.8", proxy: { server: "socks5://127.0.0.1:1080" } }), (error: unknown) => error instanceof SnapforgeError && error.code === "invalid_request");
    assert.equal(lookups, 0);
    assert.equal((await engine.health()).browser, null);
  } finally {
    await engine.close();
  }
});
