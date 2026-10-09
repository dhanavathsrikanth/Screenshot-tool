import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { BRAND_NEUTRAL, BRAND_PRIMARY, BRAND_SURFACE_LIGHT } from "@snapforge/brand";
import "./globals.css";

const geist = localFont({
  src: "./fonts/GeistSans.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Snapforge Console",
  description: "Capture anything. Ship screenshots at scale.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">
        <ClerkProvider
          appearance={{
            variables: {
              colorPrimary: BRAND_PRIMARY[600],
              colorPrimaryForeground: BRAND_NEUTRAL[0],
              colorNeutral: BRAND_NEUTRAL[700],
              colorForeground: BRAND_NEUTRAL[900],
              colorMutedForeground: BRAND_NEUTRAL[600],
              colorBackground: BRAND_SURFACE_LIGHT.surface,
              colorInput: BRAND_SURFACE_LIGHT.surface,
              colorInputForeground: BRAND_NEUTRAL[900],
              colorRing: BRAND_PRIMARY[500],
              colorBorder: BRAND_SURFACE_LIGHT.border,
              fontFamily: "var(--font-geist-sans), sans-serif",
              fontFamilyButtons: "var(--font-geist-sans), sans-serif",
              borderRadius: "0.625rem",
            },
            elements: {
              rootBox: { maxWidth: "100%" },
              cardBox: { maxWidth: "100%", boxShadow: "none", border: `1px solid ${BRAND_SURFACE_LIGHT.border}` },
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
