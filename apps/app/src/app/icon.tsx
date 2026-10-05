import { ImageResponse } from "next/og";
import { BRAND_NEUTRAL, BRAND_PRIMARY } from "@snapforge/brand";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function AppIcon() {
  return new ImageResponse(
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", borderRadius: 12, background: BRAND_PRIMARY[600] }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={BRAND_NEUTRAL[0]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 12h8m-4-4v8" />
      </svg>
    </div>,
    size,
  );
}
