# Snapforge workspace redesign

Implemented and verified: 2026-10-05.

## Reference and visual direction

The reference is the local Xem frontend at `C:\Users\ratho\Desktop\xem\mail\client`. Reviewed its current `components/app-shell.tsx`, `components/workspace-shell.module.css`, global typography, dashboard design-system notes, and the saved desktop dashboard reference. Xem was read only.

Snapforge adopts the reference's compact navigation, inset workspace, quiet dividers, restrained headings, Geist typography, and consistent spacing. Its colours come entirely from `packages/brand`; Xem's lime and charcoal literals were not copied. The default theme stays dark. Primary actions use Hostinger purple with white text, and the existing brand gradient is limited to hero text and a thin accent rule.

## Delivered

- A 236px sidebar that collapses to a 48px icon rail. Its state survives reload, and icon links retain accessible names and tooltips.
- A 56px workspace header with breadcrumbs, actual service readiness, navigation search, and the existing Clerk account menu.
- A mobile navigation drawer with background isolation, focus containment, Escape and backdrop closing, and focus restoration.
- Keyboard shortcuts: Ctrl/Cmd K for navigation search, Ctrl/Cmd B for the sidebar, and the preserved Ctrl/Cmd Enter capture shortcut.
- Locally hosted Geist Sans and Geist Mono variable fonts. The SIL Open Font License is retained at `apps/app/src/app/fonts/LICENSE.txt`. Mono is not preloaded on every page.
- Shared page headings, panels, controls, buttons, metric rows, loading states, empty states, and focus styling across Overview, Playground, Capture history, Analytics, API keys, Billing, Documentation, and Settings.
- A reusable capture-frame brand mark, matching generated browser icon, and branded authentication shell. Clerk styling uses supported appearance variables and elements.
- Overview uses actual account captures. Local-engine internals, build-chunk cards, and fabricated analytics fallback bars were removed.
- Settings now expose working browser preferences. Saved defaults populate the playground; automatic history refresh and filtered-request display use the same preference store. Malformed or invalid stored preferences fall back safely.
- Capture history and API-key actions display loading/error states. Clearing history asks for an explicit second action; failed key creation preserves the entered label, and failed clipboard access retains the newly issued secret on screen.
- Billing combines allowance and prepaid balance in one panel and removes advertised concurrency, scheduling, and support promises that the current plan implementation does not establish. Existing plan prices and included volumes are preserved.
- API reference search includes existing request recovery and webhook-delivery endpoints and names the actual Idempotency-Key header.

## Verification

- Final Next.js production build passes, including TypeScript and all page generation. Local verification used two build workers (`CIRCLE_NODE_TOTAL=3`) after the initial 11-worker build exhausted laptop memory. This does not change capture concurrency or production configuration.
- Dashboard capture regressions: 42 passed, zero failed. The suite includes authentication, shared admission, worker delivery, PDF download, reload recovery, and duplicate-submission safeguards.
- Frontend lint passes with zero errors; two existing raw-image preview warnings remain. Capture outputs retain their original bytes for preview and download.
- Reviewed authenticated populated and empty-account overview states, analytics, keys, billing, capture history, documentation, settings, and the playground.
- Verified collapsed sidebar persistence, navigation search by keyboard and Enter, filtering and empty results in capture history, and webhook reference search.
- Reviewed desktop at 1440 × 1000 and mobile at 390 × 844. Mobile Settings and Documentation have no document-level horizontal overflow. Mobile drawer focus wraps, Escape closes it, and focus returns to its trigger.
- Signed-out Clerk forms compile with the new styling. Both available browser profiles already had sessions and redirected sign-in to the dashboard, so a fresh signed-out interactive authentication flow remains a manual review item. No account was signed out or created for this check.
- The local app is available at `http://localhost:3000`. This work does not deploy production or establish a new capture-latency result.

## Saved previews

- [Overview](ui-redesign/overview-desktop.jpg)
- [Collapsed sidebar](ui-redesign/sidebar-collapsed.jpg)
- [Playground](ui-redesign/playground-desktop.jpg)
- [API keys](ui-redesign/api-keys-desktop.jpg)
- [Capture history](ui-redesign/history-desktop.jpg)
- [Mobile settings](ui-redesign/settings-mobile.jpg)
- [Mobile navigation](ui-redesign/navigation-mobile.jpg)

The images are local development screenshots. Account counters and captures are actual account records at the time of review; they are not benchmark measurements.
