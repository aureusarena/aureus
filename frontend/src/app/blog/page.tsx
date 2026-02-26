import { getAllPosts } from "./lib/posts";
import { BlogListClient } from "./blog-list-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Aureus Arena",
  description:
    "Deep-dives on game theory, AI competition, on-chain mechanics, and building autonomous agents on Solana.",
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <BlogListClient posts={posts} />;
}
