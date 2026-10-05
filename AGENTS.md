# AGENTS.md

Guidance for AI agents working in this repository.

## Branding: use the Hostinger palette

**All UI and branding must use the Hostinger colour palette.** It is not optional
and not a suggestion — do not introduce colours from any other source.

The single source of truth is `packages/brand`:

- `packages/brand/src/tokens.ts` — typed token objects for TypeScript consumers.
- `packages/brand/src/tokens.css` — CSS custom properties (`--sf-*`) for UI apps.

Both are derived from Hostinger's live brand: primary **purple `#673DE6`**, white,
and the `#E536DB → #673DE6 → #3AB0FF` gradient.

Rules:

1. **No raw hex literals in UI code.** Import the token, or use the matching
   `--sf-*` custom property. This is what keeps the brand consistent.
2. Primary actions, links, focus rings, and active states use the primary purple
   scale (`--sf-color-primary-*` / `BRAND_PRIMARY`).
3. Surfaces, borders, and body text use the purple-biased neutral scale
   (`--sf-color-neutral-*` / `BRAND_NEUTRAL`). The default theme is **dark**.
4. The brand gradient is for hero text and accent flourishes only, not body copy.
5. Status colours (`BRAND_STATUS`) are the one sanctioned exception — they are
   derived, not Hostinger brand colours, and are tuned to clear WCAG AA on the
   dark canvas. Use the `*Text` variants for text and icons.

Before adding a new colour, check whether an existing token already covers it.

## Repository layout

`pnpm` + TypeScript monorepo (workspaces: `packages/*`, `apps/*`).

| Path | Purpose |
| --- | --- |
| `packages/contracts` | Zod capture-options schema, error taxonomy, response envelopes, device presets. |
| `packages/engine` | Pure Playwright capture engine. No HTTP, no database. |
| `packages/brand` | Design tokens (the branding source of truth). |
| `apps/*` | Not scaffolded yet — API, worker, and dashboard land here per `todo.md`. |

## Commands

```bash
pnpm install
pnpm --filter @snapforge/<pkg> run build   # tsc
pnpm --filter @snapforge/<pkg> run test    # node --test, requires a prior build
```

`pnpm -r run build` from the root builds every package. Tests run against
compiled output in `dist/`, so always build before testing. Note that pnpm's
PowerShell wrapper swallows child stderr — if a `pnpm run` call looks like it
failed silently, invoke the local binary directly
(`packages/<pkg>/node_modules/.bin/tsc.cmd`) to see the real output.

## Conventions

- TypeScript `strict`, ES2022, `NodeNext` module resolution. Relative imports
  inside a package need the `.js` extension.
- Double quotes, 2-space indent, semicolons, trailing commas in multiline literals.
- `as const` on exported constant tables; derive types with `keyof typeof`.
- Tests use `node:test` and `node:assert/strict`, colocated as `*.test.ts`.
- Do not add code comments unless asked. The existing files are the exception
  where a comment records a non-obvious decision (such as token provenance).

## Product context

`todo.md` is the roadmap and the source of truth for scope. Chunks 1 and 2 are
complete. Read it before planning work.
