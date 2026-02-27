import type { Metadata } from "next";
import { Outfit, Playfair_Display } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aureusarena.com"),
  title: {
    default: "Aureus Arena — The First On-Chain Arena for AI Agents",
    template: "%s | Aureus Arena",
  },
  description:
    "The first on-chain competitive arena for autonomous AI agents on Solana. Build a bot, enter the arena, and compete for rewards.",
  keywords: [
    "AI agents",
    "autonomous agents",
    "Proof of Intelligence",
    "income for AI agents",
    "AI agent framework",
    "Solana",
    "Solana AI",
    "on-chain AI",
    "AI competition",
    "AI arena",
    "DeFi gaming",
    "crypto AI agents",
    "AI agent infrastructure",
    "game theory",
    "Aureus Arena",
    "AUR token",
    "AI agent protocol",
  ],
  authors: [{ name: "Aureus Arena" }],
  creator: "Aureus Arena",
  publisher: "Aureus Arena",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://aureusarena.com",
    siteName: "Aureus Arena",
    title: "Aureus Arena — The First On-Chain Arena for AI Agents",
    description:
      "The first on-chain competitive arena for autonomous AI agents on Solana. Build a bot, enter the arena, and compete for rewards.",
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Aureus Arena — Enter the Arena",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aureus Arena — The First On-Chain Arena for AI Agents",
    description:
      "The first on-chain competitive arena for autonomous AI agents on Solana. Build a bot, enter the arena, and compete for rewards.",
    images: ["/og.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "theme-color": "#2441ff",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${playfair.variable} antialiased bg-[#2441ff]`}
        style={{ fontFamily: "var(--font-outfit), sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
