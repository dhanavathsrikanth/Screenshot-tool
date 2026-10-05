import type { BrowserContext } from "playwright";
import { SnapforgeError } from "@snapforge/contracts";
import { countryMatches, type ResolvedRegion } from "./region.js";

export interface EgressResult {
  country: string | null;
  checked: boolean;
}

const DEFAULT_LOOKUP_URL = "https://ipapi.co/json/";
const LOOKUP_TIMEOUT_MS = 10_000;

interface LookupPayload {
  country_code?: unknown;
  country?: unknown;
}

/**
 * Reads the country from the context's own egress, which means the proxy is exercised
 * rather than trusted. A direct fetch from the host would report the host's country and
 * silently pass a mismatched region.
 */
async function lookupCountry(
  context: BrowserContext,
  lookupUrl: string,
): Promise<string | null> {
  const response = await context.request.get(lookupUrl, {
    timeout: LOOKUP_TIMEOUT_MS,
  });
  if (!response.ok()) return null;
  const payload = (await response.json()) as LookupPayload;
  const code = payload.country_code ?? payload.country;
  if (typeof code !== "string" || code.length === 0) return null;
  return code;
}

/**
 * Confirms the capture really originates from the requested region. Returning a
 * confidently wrong region is worse than failing, so a mismatch is surfaced as an error
 * instead of a mislabelled screenshot.
 */
export async function verifyEgress(
  context: BrowserContext,
  region: ResolvedRegion,
  requestId: string,
  url: string,
  lookupUrl: string = DEFAULT_LOOKUP_URL,
): Promise<EgressResult> {
  let observed: string | null;
  try {
    observed = await lookupCountry(context, lookupUrl);
  } catch (err) {
    throw new SnapforgeError({
      code: "egress_unavailable",
      message: `Could not verify egress for region "${region.id}": ${
        err instanceof Error ? err.message : String(err)
      }`,
      requestId,
      retriable: true,
      details: { region: region.id, expected_country: region.country },
    });
  }

  if (observed === null) {
    throw new SnapforgeError({
      code: "egress_unavailable",
      message: `Egress lookup returned no country for region "${region.id}"`,
      requestId,
      retriable: true,
      details: { region: region.id, expected_country: region.country },
    });
  }

  if (!countryMatches(observed, region.country)) {
    throw new SnapforgeError({
      code: "egress_mismatch",
      message: `Egress country ${observed} does not match requested region "${region.id}" (${region.country}). Set a proxy that egresses from ${region.country}.`,
      requestId,
      details: {
        region: region.id,
        expected_country: region.country,
        observed_country: observed,
        url,
      },
    });
  }

  return { country: observed, checked: true };
}
