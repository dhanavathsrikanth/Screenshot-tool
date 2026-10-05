import {
  REGION_PRESETS,
  SnapforgeError,
  isRegionId,
  type CaptureOptions,
  type ProxyOptions,
  type RegionId,
} from "@snapforge/contracts";

export interface ResolvedRegion {
  id: RegionId;
  locale: string;
  timezone: string;
  currency: string;
  country: string;
  proxy?: ProxyOptions;
}

/**
 * A region only changes what a target serves when the egress IP is in that country, so
 * an explicit locale or timezone is treated as an override rather than a fallback.
 */
export function resolveRegion(
  options: CaptureOptions,
  requestId: string,
): ResolvedRegion | null {
  if (!options.region) return null;
  if (!isRegionId(options.region)) {
    throw new SnapforgeError({
      code: "unsupported_option",
      message: `Unknown region "${options.region}". Supported regions: ${Object.keys(REGION_PRESETS).join(", ")}`,
      requestId,
      details: { region: options.region },
    });
  }

  const preset = REGION_PRESETS[options.region];
  return {
    id: options.region,
    locale: options.locale ?? preset.locale,
    timezone: options.timezone ?? preset.timezone,
    currency: preset.currency,
    country: preset.country,
    ...(options.proxy ? { proxy: options.proxy } : {}),
  };
}

/**
 * Egress answers arrive as ISO codes ("US"), alpha-2 ("us"), or names ("United States"),
 * so verification compares on the ISO code only and never on a display name.
 */
export function countryMatches(
  observed: string | null | undefined,
  expected: string,
): boolean {
  if (!observed) return false;
  const normalized = observed.trim().toUpperCase();
  return normalized === expected.trim().toUpperCase();
}
