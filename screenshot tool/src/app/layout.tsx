import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dodo Payments Next.js Boilerplate",
  description: "Minimal boilerplate for Dodo Payments with Next.js App Router",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="bg-black text-white selection:bg-white selection:text-black antialiased min-h-screen flex flex-col">
        <Header />
        <main className="grow pt-16">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
