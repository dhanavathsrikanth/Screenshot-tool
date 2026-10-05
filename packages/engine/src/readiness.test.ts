import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readContentState } from "./readiness.js";

function state(types: string[], readyState = "complete", text = "Static content. ".repeat(8), embedded = false) {
  return runInNewContext(`(${readContentState.toString()})()`, {
    document: {
      body: { innerText: text }, images: [], scripts: types.map((type) => ({ type })),
      readyState, documentElement: { scrollHeight: 720 },
      querySelector: () => embedded ? {} : null,
    },
    window: { innerHeight: 720 },
  }) as ReturnType<typeof readContentState>;
}

test("completed short HTML and JSON metadata are static", () => {
  assert.equal(state([]).staticReady, true);
  assert.equal(state(["application/ld+json", "application/json"]).staticReady, true);
});

test("JavaScript and modules keep the hydration guard", () => {
  for (const type of ["", "module", "text/javascript", "application/javascript", "text/ecmascript", "text/javascript; charset=utf-8", "text/x-javascript"]) {
    assert.equal(state([type]).staticReady, false, type);
  }
});

test("unfinished or nearly empty pages keep the guard", () => {
  assert.equal(state([], "interactive").staticReady, false);
  assert.equal(state([], "complete", "Loading").staticReady, false);
});

test("embedded documents keep the hydration and scroll guards", () => {
  assert.equal(state([], "complete", "Static content. ".repeat(8), true).staticReady, false);
});
