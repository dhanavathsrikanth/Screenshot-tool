export interface RegionPreset {
  name: string;
  /** BCP-47 locale handed to the browser context. */
  locale: string;
  /** IANA timezone, kept consistent with the egress country. */
  timezone: string;
  /** ISO 4217 currency code for the region. */
  currency: string;
  /** ISO 3166-1 alpha-2 country code, used to verify the actual egress. */
  country: string;
  /** Approximate country centroid, exposed only when the caller opts in. */
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

/**
 * Region presets derive locale and timezone from the egress country. Egress IP is the
 * only layer that changes what a target serves, so these values exist to keep the
 * browser fingerprint consistent with it rather than to override a geo-block.
 */
export const REGION_PRESETS = {
  us: {
    name: "United States",
    locale: "en-US",
    timezone: "America/New_York",
    currency: "USD",
    country: "US",
    coordinates: { latitude: 39.8283, longitude: -98.5795, accuracy: 1000 },
  },
  ca: {
    name: "Canada",
    locale: "en-CA",
    timezone: "America/Toronto",
    currency: "CAD",
    country: "CA",
    coordinates: { latitude: 56.1304, longitude: -106.3468, accuracy: 1000 },
  },
  gb: {
    name: "United Kingdom",
    locale: "en-GB",
    timezone: "Europe/London",
    currency: "GBP",
    country: "GB",
    coordinates: { latitude: 55.3781, longitude: -3.436, accuracy: 1000 },
  },
  ie: {
    name: "Ireland",
    locale: "en-IE",
    timezone: "Europe/Dublin",
    currency: "EUR",
    country: "IE",
    coordinates: { latitude: 53.1424, longitude: -7.6921, accuracy: 1000 },
  },
  de: {
    name: "Germany",
    locale: "de-DE",
    timezone: "Europe/Berlin",
    currency: "EUR",
    country: "DE",
    coordinates: { latitude: 51.1657, longitude: 10.4515, accuracy: 1000 },
  },
  fr: {
    name: "France",
    locale: "fr-FR",
    timezone: "Europe/Paris",
    currency: "EUR",
    country: "FR",
    coordinates: { latitude: 46.2276, longitude: 2.2137, accuracy: 1000 },
  },
  es: {
    name: "Spain",
    locale: "es-ES",
    timezone: "Europe/Madrid",
    currency: "EUR",
    country: "ES",
    coordinates: { latitude: 40.4637, longitude: -3.7492, accuracy: 1000 },
  },
  it: {
    name: "Italy",
    locale: "it-IT",
    timezone: "Europe/Rome",
    currency: "EUR",
    country: "IT",
    coordinates: { latitude: 41.8719, longitude: 12.5674, accuracy: 1000 },
  },
  nl: {
    name: "Netherlands",
    locale: "nl-NL",
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    country: "NL",
    coordinates: { latitude: 52.1326, longitude: 5.2913, accuracy: 1000 },
  },
  sg: {
    name: "Singapore",
    locale: "en-SG",
    timezone: "Asia/Singapore",
    currency: "SGD",
    country: "SG",
    coordinates: { latitude: 1.3521, longitude: 103.8198, accuracy: 1000 },
  },
  au: {
    name: "Australia",
    locale: "en-AU",
    timezone: "Australia/Sydney",
    currency: "AUD",
    country: "AU",
    coordinates: { latitude: -25.2744, longitude: 133.7751, accuracy: 1000 },
  },
  jp: {
    name: "Japan",
    locale: "ja-JP",
    timezone: "Asia/Tokyo",
    currency: "JPY",
    country: "JP",
    coordinates: { latitude: 36.2048, longitude: 138.2529, accuracy: 1000 },
  },
  kr: {
    name: "South Korea",
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    currency: "KRW",
    country: "KR",
    coordinates: { latitude: 35.9078, longitude: 127.7669, accuracy: 1000 },
  },
  in: {
    name: "India",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    currency: "INR",
    country: "IN",
    coordinates: { latitude: 20.5937, longitude: 78.9629, accuracy: 1000 },
  },
  br: {
    name: "Brazil",
    locale: "pt-BR",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    country: "BR",
    coordinates: { latitude: -14.235, longitude: -51.9253, accuracy: 1000 },
  },
  mx: {
    name: "Mexico",
    locale: "es-MX",
    timezone: "America/Mexico_City",
    currency: "MXN",
    country: "MX",
    coordinates: { latitude: 23.6345, longitude: -102.5528, accuracy: 1000 },
  },
  za: {
    name: "South Africa",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    currency: "ZAR",
    country: "ZA",
    coordinates: { latitude: -30.5595, longitude: 22.9375, accuracy: 1000 },
  },
  ae: {
    name: "United Arab Emirates",
    locale: "ar-AE",
    timezone: "Asia/Dubai",
    currency: "AED",
    country: "AE",
    coordinates: { latitude: 23.4241, longitude: 53.8478, accuracy: 1000 },
  },
} as const satisfies Record<string, RegionPreset>;

export type RegionId = keyof typeof REGION_PRESETS;

export const REGION_IDS = Object.keys(REGION_PRESETS) as RegionId[];

export function isRegionId(value: string): value is RegionId {
  return Object.prototype.hasOwnProperty.call(REGION_PRESETS, value);
}
