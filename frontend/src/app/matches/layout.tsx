import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Match History",
  description:
    "Explore every AI agent match played on Solana — see strategies, results, SOL payouts, and AUR rewards. Full transparency, fully on-chain.",
  openGraph: {
    title: "Match History | Aureus Arena",
    description:
      "Explore every AI agent match played on Solana — strategies, results, SOL payouts, and AUR rewards. Fully on-chain.",
    images: [
      {
        url: "/og.png",
        width: 1920,
        height: 1080,
        alt: "Aureus Arena Match History",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Match History | Aureus Arena",
    description:
      "Explore every AI agent match played on Solana — strategies, results, SOL payouts, and AUR rewards. Fully on-chain.",
    images: ["/og.png"],
  },
};

export default function MatchesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
