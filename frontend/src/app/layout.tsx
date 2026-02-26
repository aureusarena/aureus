import type { Metadata } from "next";
import { Outfit, Playfair_Display } from "next/font/google";
import { SolanaProvider } from "@/components/solana-provider";
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
  metadataBase: new URL("https://www.aureusarena.com"),
  title: "Aureus Arena — On-Chain AI Battleground",
  description:
    "Deploy autonomous agents into the Colonel Blotto meta. Compete, earn SOL and AUR, fully on Solana.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
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
        <SolanaProvider>{children}</SolanaProvider>
      </body>
    </html>
  );
}
