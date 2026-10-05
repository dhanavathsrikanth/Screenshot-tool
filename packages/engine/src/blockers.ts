import type { BrowserContext } from "playwright";

export const AD_HOSTS: readonly string[] = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "googletagservices.com",
  "adservice.google.com",
  "pagead2.googlesyndication.com",
  "adnxs.com",
  "rubiconproject.com",
  "pubmatic.com",
  "criteo.com",
  "criteo.net",
  "casalemedia.com",
  "openx.net",
  "smartadserver.com",
  "bidswitch.net",
  "media.net",
  "taboola.com",
  "outbrain.com",
  "revcontent.com",
  "amazon-adsystem.com",
  "adsrvr.org",
  "adform.net",
  "zedo.com",
  "moatads.com",
  "scorecardresearch.com",
  "popads.net",
  "propellerads.com",
  "adcash.com",
  "hilltopads.net",
  "33across.com",
  "sharethrough.com",
  "yieldmo.com",
  "sovrn.com",
  "bluekai.com",
  "krxd.net",
  "agkn.com",
  "demdex.net",
  "adroll.com",
  "yieldlove.com",
  "serving-sys.com",
  "flashtalking.com",
  "turn.com",
  "exelator.com",
  "nexage.com",
  "inmobi.com",
  "chartboost.com",
];

export const TRACKER_HOSTS: readonly string[] = [
  "google-analytics.com",
  "analytics.google.com",
  "googletagmanager.com",
  "connect.facebook.net",
  "facebook.com", 
  "segment.io",
  "segment.com",
  "mixpanel.com",
  "hotjar.com",
  "hotjar.io",
  "fullstory.com",
  "amplitude.com",
  "branch.io",
  "appsflyer.com",
  "adjust.com",
  "newrelic.com",
  "nr-data.net",
  "sentry.io",
  "ingest.sentry.io",
  "optimizely.com",
  "vwo.com",
  "crazyegg.com",
  "mouseflow.com",
  "heap.io",
  "klaviyo.com",
  "clarity.ms",
  "matomo.cloud",
  "plausible.io",
  "chartbeat.com",
  "logrocket.com",
  "posthog.com",
  "rudderstack.com",
  "segmentify.com",
  "yandex.ru",
  "mc.yandex.ru",
  "bat.bing.com",
  "snap.licdn.com",
  "ads.linkedin.com",
  "analytics.tiktok.com",
  "static.hotjar.com",
  "api.mixpanel.com",
];

export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export interface BlockPolicy {
  blockAds: boolean;
  blockTrackers: boolean;
}

export function shouldBlockUrl(rawUrl: string, policy: BlockPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (policy.blockAds && AD_HOSTS.some((domain) => hostMatches(host, domain))) return true;
  if (policy.blockTrackers && TRACKER_HOSTS.some((domain) => hostMatches(host, domain)))
    return true;
  return false;
}

export async function installRequestFilters(
  context: BrowserContext,
  policy: BlockPolicy,
): Promise<() => number> {
  let blocked = 0;
  if (!policy.blockAds && !policy.blockTrackers) return () => blocked;

  await context.route("**/*", async (route) => {
    const request = route.request();
    if (shouldBlockUrl(request.url(), policy)) {
      blocked += 1;
      await route.abort("blockedbyclient").catch(() => {});
    } else {
      await route.continue().catch(() => {});
    }
  });

  return () => blocked;
}
