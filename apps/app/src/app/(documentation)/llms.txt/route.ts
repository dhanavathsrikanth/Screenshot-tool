import { DOC_PAGES } from "@/lib/docs-content";

export function GET() {
  const lines = [
    "# Snapforge",
    "",
    "> A browser capture API for screenshots, PDFs, and AI agents. This index links to the complete public developer documentation and its Markdown equivalents.",
    "",
    "## Integration essentials",
    "",
    "- Configure SNAPFORGE_API_URL with your gateway URL. Local gateway default: http://localhost:8787. Do not assume a production hostname.",
    "- REST requests use Authorization: Bearer $SNAPFORGE_API_KEY. Create captures with POST /v1/screenshot.",
    "- Always support HTTP 202 job polling, even with sync: true. Poll GET /v1/jobs/{id}.",
    "- Completed data.url is the source page; data.cdn_url is the artifact download URL.",
    "- Use Idempotency-Key to recover uncertain requests. Keep the same request and webhook configuration when replaying a key.",
    "- Failed captures release reserved credits. Successful captures, including cache hits, consume credits.",
    "- cache_ttl controls acceptable reuse age, not artifact retention or download-link expiry.",
    "- Region presets require your own matching proxy for regional egress. Capture destinations must resolve to public networks.",
    "- The MCP package runs locally over stdio and does not require a hosted Snapforge API key.",
    "",
  ];
  for (const group of [...new Set(DOC_PAGES.map((page) => page.group))]) {
    lines.push(`## ${group}`, "");
    for (const page of DOC_PAGES.filter((entry) => entry.group === group)) {
      lines.push(`- [${page.title}](/docs/markdown/${page.slug}): ${page.description}`);
    }
    lines.push("");
  }
  lines.push("## Human-readable documentation", "", "- [Documentation home](/docs)", "- [Capture playground](/playground)", "");
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
