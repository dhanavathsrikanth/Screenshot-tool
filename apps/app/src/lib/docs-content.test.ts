import assert from "node:assert/strict";
import test from "node:test";
import { captureOptionsSchema, ERROR_CODES } from "@snapforge/contracts";
import { CAPTURE_CODE, CAPTURE_EXAMPLE, DOC_FIELDS, DOC_PAGES, docMarkdown, getDoc } from "./docs-content.js";

test("the parameter reference covers the capture schema and its actual defaults", () => {
  assert.deepEqual(DOC_FIELDS.map((field) => field.name).sort(), Object.keys(captureOptionsSchema.shape).sort());
  const defaults = captureOptionsSchema.parse({ url: "https://example.com" });
  for (const field of DOC_FIELDS) {
    if (field.name === "url") assert.equal(field.default, "Required");
    else if (field.name in defaults) assert.equal(field.default, JSON.stringify(defaults[field.name as keyof typeof defaults]));
    else assert.equal(field.default, "Optional");
    assert.ok(field.description.length > 20);
  }
  assert.ok(captureOptionsSchema.safeParse(CAPTURE_EXAMPLE).success);
});

test("every page has unique anchors, working internal links, and a Markdown equivalent", () => {
  assert.equal(new Set(DOC_PAGES.map((page) => page.slug)).size, DOC_PAGES.length);
  for (const page of DOC_PAGES) {
    assert.equal(getDoc(page.slug), page);
    assert.equal(new Set(page.sections.map((section) => section.id)).size, page.sections.length);
    assert.ok(page.sections.length > 0);
    const markdown = docMarkdown(page);
    assert.ok(markdown.startsWith(`# ${page.title}\n`));
    for (const section of page.sections) assert.ok(markdown.includes(`## ${section.title}`));
    for (const match of markdown.matchAll(/\]\(\/docs(?:\/([^\s)#]+))?(?:#[^)]*)?\)/g)) assert.ok(getDoc(match[1] ?? ""), `${page.slug}: broken link ${match[0]}`);
  }
  assert.equal(getDoc("unknown-page"), undefined);
});

test("examples distinguish source URLs from artifacts and support queued responses", () => {
  for (const sample of CAPTURE_CODE.filter((entry) => entry.label !== "cURL")) {
    assert.ok(sample.code.includes("cdn_url"));
    assert.ok(sample.code.includes("202"));
    assert.ok(sample.code.includes("poll_url"));
  }
  const errorPage = getDoc("errors");
  assert.ok(errorPage);
  for (const code of ERROR_CODES) assert.ok(errorPage.sections.some((section) => section.id === code));
  const options = getDoc("api/options");
  assert.ok(options);
  for (const field of DOC_FIELDS) assert.ok(docMarkdown(options).includes(`### ${field.name}\n`));
});
