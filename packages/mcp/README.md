# Snapforge MCP server

`@snapforge/mcp` exposes Snapforge's real Playwright capture engine to MCP clients over stdio. It registers `take_screenshot`, `inspect_page`, and `capture_element`.

## Build and run

From the monorepo root:

```sh
pnpm install
pnpm --filter @snapforge/contracts run build
pnpm --filter @snapforge/engine run build
pnpm --filter @snapforge/mcp run build
pnpm --filter @snapforge/engine exec playwright install chromium
pnpm --filter @snapforge/mcp run start
```

The server is local and stdio-only. It does not write protocol logs to stdout. Set `SNAPFORGE_MCP_CONCURRENCY` to change the default limit of two concurrent captures.

## Claude Desktop configuration

Point `command` and `args` at the Node executable and the built `packages/mcp/dist/main.js` in this checkout:

```json
{
  "mcpServers": {
    "snapforge": {
      "command": "node",
      "args": ["C:/path/to/scr tool/packages/mcp/dist/main.js"],
      "env": {
        "SNAPFORGE_MCP_CONCURRENCY": "2"
      }
    }
  }
}
```

## Tools

- `take_screenshot` returns an MCP image block and small JSON metadata.
- `inspect_page` returns the screenshot, readable Markdown, and a bounded accessibility snapshot.
- `capture_element` returns a selector screenshot and its CSS-pixel viewport bounding box.

Image output is limited to PNG, JPEG, and WebP. Capture errors use Snapforge error codes and include a short remediation step.
