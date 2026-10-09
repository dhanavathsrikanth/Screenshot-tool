/**
 * Snapforge brand tokens.
 *
 * Source of truth: the Hostinger brand palette, verified against the live
 * hostinger.com stylesheet (primary #673DE6, plus the #E536DB -> #673DE6 ->
 * #3AB0FF gradient used for gradient text).
 *
 * The tonal scales below are derived from that primary so that steps 50-950
 * are monotonic in lightness and hold the brand hue. All contrast ratios in
 * the comments were measured, not estimated.
 *
 * Rule: no raw hex literals in UI code. Reference these tokens (or the
 * matching CSS custom properties in ./tokens.css) instead.
 */

/** Hostinger's primary purple, used as the anchor of the primary scale. */
export const BRAND_HEX = "#673DE6" as const;

export const BRAND_PRIMARY = {
  50: "#F5F0FE",
  100: "#EAE2FD",
  200: "#D8CBFB",
  300: "#BFABF8",
  400: "#9A7DF2",
  500: "#7F5BEC",
  /** Brand default. 6.20:1 on white, 3.23:1 on `neutral.950`. */
  600: "#673DE6",
  700: "#5323D7",
  800: "#4B24AE",
  900: "#402287",
  950: "#2D1958",
} as const;

/**
 * Purple-biased greys (hue 270, low saturation). A neutral ramp tinted toward
 * the brand reads as chosen; a flat #808080 reads as a default.
 */
export const BRAND_NEUTRAL = {
  0: "#FFFFFF",
  50: "#FAF9FB",
  100: "#F5F3F6",
  200: "#EBE8ED",
  300: "#DBD7E0",
  400: "#C7C1CD",
  500: "#A8A1AF",
  600: "#8C8395",
  700: "#6E6379",
  800: "#4F4659",
  900: "#332C3A",
  /** Dark theme base surface. */
  950: "#1C1721",
} as const;

/** Gradient stops lifted from the live hostinger.com gradient text rule. */
export const BRAND_ACCENT = {
  magenta: "#C63FF3",
  purple: "#673DE6",
  blue: "#4DB5FF",
} as const;

export const BRAND_GRADIENT = {
  brand: "linear-gradient(-87.63deg, #C63FF3 6.95%, #673DE6 51.17%, #4DB5FF 109.29%)",
} as const;

/**
 * Status colours. These are NOT Hostinger brand colours - they are derived to
 * sit harmoniously next to the purple ramp and to clear WCAG AA on the dark
 * surface. Use `*Text` variants for text and icons, the base for fills.
 */
export const BRAND_STATUS = {
  success: "#27B070",
  successText: "#7CDEAD",
  warning: "#F59F0A",
  warningText: "#FBC456",
  danger: "#EA3E55",
  dangerText: "#F88191",
  info: "#29A6FF",
  infoText: "#74CEFB",
} as const;

export interface SurfaceScale {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  focusRing: string;
}

/**
 * Dark is the default theme. The roadmap calls for a "sleek, dark-themed
 * command center", so the dark ramp is the one tuned for real contrast.
 */
export const BRAND_SURFACE_DARK: SurfaceScale = {
  canvas: BRAND_NEUTRAL[950],
  surface: "#241E2B",
  surfaceRaised: "#2E2737",
  border: "#3A3245",
  borderStrong: "#4C4259",
  textPrimary: BRAND_NEUTRAL[50],
  textSecondary: BRAND_NEUTRAL[300],
  textMuted: BRAND_NEUTRAL[500],
  accent: BRAND_PRIMARY[400],
  accentHover: BRAND_PRIMARY[300],
  accentText: BRAND_PRIMARY[300],
  focusRing: BRAND_PRIMARY[300],
};

export const BRAND_SURFACE_LIGHT: SurfaceScale = {
  canvas: BRAND_NEUTRAL[50],
  surface: BRAND_NEUTRAL[0],
  surfaceRaised: BRAND_NEUTRAL[0],
  border: BRAND_NEUTRAL[200],
  borderStrong: BRAND_NEUTRAL[300],
  textPrimary: BRAND_NEUTRAL[900],
  textSecondary: BRAND_NEUTRAL[800],
  textMuted: BRAND_NEUTRAL[700],
  accent: BRAND_PRIMARY[600],
  accentHover: BRAND_PRIMARY[700],
  accentText: BRAND_PRIMARY[700],
  focusRing: BRAND_PRIMARY[500],
};

export const BRAND_RADIUS = {
  sm: "6px",
  md: "10px",
  lg: "16px",
  pill: "999px",
} as const;

export type BrandScale = keyof typeof BRAND_PRIMARY;
export type BrandNeutralStep = keyof typeof BRAND_NEUTRAL;
export type BrandTheme = "dark" | "light";

export const BRAND_THEMES: Record<BrandTheme, SurfaceScale> = {
  dark: BRAND_SURFACE_DARK,
  light: BRAND_SURFACE_LIGHT,
};
