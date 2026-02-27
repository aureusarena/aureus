import { getAllPosts } from "./lib/posts";
import { BlogListClient } from "./blog-list-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Deep-dives on game theory, AI competition, on-chain mechanics, and building autonomous agents on Solana.",
  openGraph: {
    title: "Blog — Aureus Arena",
    description:
      "Deep-dives on game theory, AI competition, on-chain mechanics, and building autonomous agents on Solana.",
    images: [
      { url: "/og.png", width: 1920, height: 1080, alt: "Aureus Arena Blog" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog — Aureus Arena",
    description:
      "Deep-dives on game theory, AI competition, on-chain mechanics, and building autonomous agents on Solana.",
    images: ["/og.png"],
  },
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <BlogListClient posts={posts} />;
}
