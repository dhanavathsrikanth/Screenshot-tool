import type { CaptureOptionsInput } from "@snapforge/contracts";

export const BENCHMARK_TIERS = ["easy", "moderate", "hard"] as const;
export type BenchmarkTier = (typeof BENCHMARK_TIERS)[number];

export const SITES_PER_TIER = 10;

/**
 * Visual correctness assertions evaluated against the capture envelope, the image
 * buffer, and (when inspection is on) the extracted page markdown.
 */
export interface SiteChecks {
  /** Case-insensitive substrings that must appear in the extracted page text. */
  expectText?: string[];
  /** Case-insensitive substrings that must NOT appear (cookie banners, interstitials). */
  forbidText?: string[];
  /** Substrings of `final_url` that indicate a redirect into a block/challenge page. */
  forbidFinalUrl?: string[];
  minBytes?: number;
  /** Average bits per pixel. A solid blank capture compresses far below this. */
  minBitsPerPixel?: number;
  minWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export interface BenchmarkSite {
  id: string;
  tier: BenchmarkTier;
  url: string;
  /** Why this site is in the tier — what it proves about the engine. */
  note: string;
  options?: Omit<CaptureOptionsInput, "url">;
  checks: SiteChecks;
}

/**
 * The 30-site Gauntlet: 10 easy / 10 moderate / 10 hard.
 *
 * - Easy: static docs and simple sites — proves basic render fidelity.
 * - Moderate: SPAs, hydration and lazy-loaded grids — proves settlement and
 *   full-page scrolling.
 * - Hard: CMP cookie dialogs, Turnstile, infinite feeds, heavy fixed chrome —
 *   proves stealth, banner annihilation and bounded scrolling.
 */
export const SITE_SUITE: readonly BenchmarkSite[] = [
  // ---------------------------------------------------------------- easy ---
  {
    id: "example-com",
    tier: "easy",
    url: "https://example.com",
    note: "Static single-page baseline.",
    checks: { expectText: ["documentation examples"] },
  },
  {
    id: "wikipedia-home",
    tier: "easy",
    url: "https://www.wikipedia.org/",
    note: "Static portal with language links.",
    checks: { expectText: ["Wikipedia"] },
  },
  {
    id: "hackernews-front",
    tier: "easy",
    url: "https://news.ycombinator.com/",
    note: "Server-rendered list, minimal JS.",
    checks: { expectText: ["Hacker News"] },
  },
  {
    id: "mdn-web",
    tier: "easy",
    url: "https://developer.mozilla.org/en-US/docs/Web",
    note: "Documentation landing page.",
    checks: { expectText: ["MDN"] },
  },
  {
    id: "rust-lang-home",
    tier: "easy",
    url: "https://www.rust-lang.org/",
    note: "Marketing page with web fonts.",
    checks: { expectText: ["Rust"] },
  },
  {
    id: "python-docs",
    tier: "easy",
    url: "https://docs.python.org/3/",
    note: "Long sidebar docs page, full-page capture.",
    options: { full_page: true, timeout: 45_000 },
    checks: { expectText: ["Python"], maxHeight: 24_000 },
  },
  {
    id: "kernel-org",
    tier: "easy",
    url: "https://www.kernel.org/",
    note: "Simple static homepage.",
    checks: { expectText: ["Linux"] },
  },
  {
    id: "peps-index",
    tier: "easy",
    url: "https://peps.python.org/pep-0000/",
    note: "Very long static table page.",
    options: { full_page: true, timeout: 45_000 },
    checks: { expectText: ["Python Enhancement Proposals"], maxHeight: 24_000 },
  },
  {
    id: "gnu-home",
    tier: "easy",
    url: "https://www.gnu.org/",
    note: "Static homepage, plain layout.",
    checks: { expectText: ["GNU"] },
  },
  {
    id: "python-org-home",
    tier: "easy",
    url: "https://www.python.org/",
    note: "Static-ish homepage with downloads grid.",
    checks: { expectText: ["Python"] },
  },

  // ------------------------------------------------------------ moderate ---
  {
    id: "react-dev",
    tier: "moderate",
    url: "https://react.dev/",
    note: "Client-hydrated docs SPA.",
    options: { timeout: 45_000 },
    checks: { expectText: ["React"] },
  },
  {
    id: "nextjs-docs",
    tier: "moderate",
    url: "https://nextjs.org/docs",
    note: "Hydrated docs shell with sidebar router.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Next.js"] },
  },
  {
    id: "tailwind-docs",
    tier: "moderate",
    url: "https://tailwindcss.com/docs",
    note: "Docs SPA, full-page capture with sticky nav.",
    options: { full_page: true, timeout: 45_000 },
    checks: { expectText: ["Tailwind CSS"], maxHeight: 24_000 },
  },
  {
    id: "typescript-docs",
    tier: "moderate",
    url: "https://www.typescriptlang.org/docs/",
    note: "Docs SPA with client-side navigation.",
    options: { timeout: 45_000 },
    checks: { expectText: ["TypeScript"] },
  },
  {
    id: "github-home",
    tier: "moderate",
    url: "https://github.com",
    note: "Heavily hydrated logged-out marketing SPA.",
    options: { timeout: 45_000 },
    checks: { expectText: ["GitHub"] },
  },
  {
    id: "amazon-serp",
    tier: "moderate",
    url: "https://www.amazon.com/s?k=laptop",
    note: "Lazy-loaded product grid plus aggressive bot defenses.",
    options: { timeout: 45_000 },
    checks: { expectText: ["laptop"], minBytes: 12_000 },
  },
  {
    id: "allbirds-store",
    tier: "moderate",
    url: "https://www.allbirds.com/",
    note: "Shopify storefront with lazy product imagery.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Allbirds"] },
  },
  {
    id: "dribbble-grid",
    tier: "moderate",
    url: "https://dribbble.com/",
    note: "Infinite lazy image grid, full-page scroll trigger.",
    options: { full_page: true, timeout: 45_000 },
    checks: { expectText: ["Dribbble"], minHeight: 4_000, maxHeight: 24_000 },
  },
  {
    id: "svelte-docs",
    tier: "moderate",
    url: "https://svelte.dev/docs/svelte/",
    note: "Client-rendered docs with code tabs.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Svelte"] },
  },
  {
    id: "vercel-docs",
    tier: "moderate",
    url: "https://vercel.com/docs",
    note: "Docs SPA with search widget hydration.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Vercel"] },
  },

  // --------------------------------------------------------------- hard ---
  {
    id: "reddit-feed",
    tier: "hard",
    url: "https://www.reddit.com/",
    note: "Infinite-scroll social feed with login interstitials.",
    options: { timeout: 45_000 },
    checks: {
      expectText: ["Reddit"],
      forbidText: ["Prove your humanity"],
      forbidFinalUrl: ["/login", "/block"],
    },
  },
  {
    id: "bbc-news",
    tier: "hard",
    url: "https://www.bbc.com/news",
    note: "BBC CMP cookie dialog over a dynamic news grid.",
    options: { timeout: 45_000 },
    checks: { expectText: ["BBC"], forbidText: ["Accept extra cookies"] },
  },
  {
    id: "guardian-home",
    tier: "hard",
    url: "https://www.theguardian.com/international",
    note: "Sourcepoint CMP over a dense editorial layout.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Guardian"] },
  },
  {
    id: "youtube-watch",
    tier: "hard",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    note: "Video watch page: SPA hydration, fixed player, scrolling comments.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Never Gonna Give You Up"] },
  },
  {
    id: "twitch-home",
    tier: "hard",
    url: "https://www.twitch.tv/",
    note: "WebSocket-heavy live directory.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Twitch"] },
  },
  {
    id: "imdb-home",
    tier: "hard",
    url: "https://www.imdb.com/",
    note: "Cookiebot consent dialog over a media carousel.",
    options: { timeout: 45_000 },
    checks: {
      expectText: ["IMDb"],
      forbidText: ["confirm you are human"],
      minBytes: 12_000,
    },
  },
  {
    id: "booking-home",
    tier: "hard",
    url: "https://www.booking.com/",
    note: "Dense CMP-driven travel search with fixed header.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Booking.com"] },
  },
  {
    id: "stackoverflow-home",
    tier: "hard",
    url: "https://stackoverflow.com/",
    note: "Q&A feed with sticky top bar and login prompts.",
    options: { timeout: 45_000 },
    checks: { expectText: ["questions"] },
  },
  {
    id: "cloudflare-turnstile",
    tier: "hard",
    url: "https://www.cloudflare.com/turnstile/",
    note: "Cloudflare-protected marketing site with Turnstile demo widget.",
    options: { timeout: 45_000 },
    checks: { expectText: ["Turnstile"] },
  },
  {
    id: "spotify-home",
    tier: "hard",
    url: "https://www.spotify.com/",
    note: "SPA marketing site with regional CMP overlay.",
    options: { timeout: 45_000, wait_for_content: true },
    // A hydration-stuck shell renders ~18 KB; a real homepage is media-heavy.
    checks: { expectText: ["Spotify"], minBytes: 40_000 },
  },
];

export interface SiteFilter {
  tiers?: readonly BenchmarkTier[];
  ids?: readonly string[];
}

export function selectSites(
  suite: readonly BenchmarkSite[] = SITE_SUITE,
  filter: SiteFilter = {},
): BenchmarkSite[] {
  const tiers = filter.tiers && filter.tiers.length > 0 ? new Set(filter.tiers) : null;
  const ids = filter.ids && filter.ids.length > 0 ? new Set(filter.ids) : null;
  return suite.filter(
    (site) =>
      (tiers === null || tiers.has(site.tier)) &&
      (ids === null || ids.has(site.id)),
  );
}
