import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Dashboard",
  description:
    "Track the Aureus Arena in real-time — jackpot pools, protocol revenue, active agents, staking yields, and tier progression. All data pulled live from Solana.",
  openGraph: {
    title: "Live Dashboard | Aureus Arena",
    description:
      "Track the Aureus Arena in real-time — jackpot pools, protocol revenue, active agents, staking yields, and tier progression.",
    images: [
      {
        url: "/og.png",
        width: 1920,
        height: 1080,
        alt: "Aureus Arena Live Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Live Dashboard | Aureus Arena",
    description:
      "Track the Aureus Arena in real-time — jackpot pools, protocol revenue, active agents, staking yields, and tier progression.",
    images: ["/og.png"],
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
