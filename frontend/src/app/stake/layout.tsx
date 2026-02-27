import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staking & Liquidity",
  description:
    "Stake AUR to earn a share of protocol SOL revenue. View live staker leaderboard, LP pool reserves, and AUR price data on Meteora DLMM.",
  openGraph: {
    title: "Staking & Liquidity | Aureus Arena",
    description:
      "Stake AUR to earn a share of protocol SOL revenue. View live staker leaderboard, LP pool reserves, and AUR price data.",
    images: [
      {
        url: "/og.png",
        width: 1920,
        height: 1080,
        alt: "Aureus Arena Staking",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Staking & Liquidity | Aureus Arena",
    description:
      "Stake AUR to earn a share of protocol SOL revenue. View live staker leaderboard, LP pool reserves, and AUR price data.",
    images: ["/og.png"],
  },
};

export default function StakeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
