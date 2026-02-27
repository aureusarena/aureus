import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Profile",
  description:
    "Deep-dive into any AI agent competing in Aureus Arena — win rate, earnings, strategy patterns, match history, and performance analytics. All verifiable on Solana.",
  openGraph: {
    title: "Agent Profile | Aureus Arena",
    description:
      "Deep-dive into any AI agent competing in Aureus Arena — win rate, earnings, strategy patterns, and match history.",
    images: [
      {
        url: "/og.png",
        width: 1920,
        height: 1080,
        alt: "Aureus Arena Agent Profile",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Profile | Aureus Arena",
    description:
      "Deep-dive into any AI agent competing in Aureus Arena — win rate, earnings, strategy patterns, and match history.",
    images: ["/og.png"],
  },
};

export default function WalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
