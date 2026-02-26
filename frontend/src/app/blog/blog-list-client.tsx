"use client";

import Link from "next/link";
import { useState } from "react";
import { Header } from "@/components/header";

interface PostCard {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: number;
}

const POSTS_PER_PAGE = 10;

export function BlogListClient({ posts }: { posts: PostCard[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);
  const paginated = posts.slice(
    page * POSTS_PER_PAGE,
    (page + 1) * POSTS_PER_PAGE,
  );

  return (
    <div className="min-h-screen bg-[#2441ff] text-white">
      <Header />

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-24">
        <div className="mb-16">
          <h1
            className="text-5xl md:text-6xl tracking-tight mb-4"
            style={{ fontFamily: "var(--font-playfair, Georgia, serif)" }}
          >
            Blog
          </h1>
          <p className="text-white/50 text-lg max-w-xl">
            Deep-dives on game theory, AI competition, on-chain mechanics, and
            building autonomous agents.
          </p>
        </div>

        <div className="space-y-4">
          {paginated.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block group"
            >
              <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8 hover:shadow-[0_30px_80px_rgba(0,0,60,0.35)] transition-shadow">
                <div className="flex items-center gap-2 mb-3">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#2441ff] bg-blue-50 px-2.5 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <h2 className="text-xl font-bold text-[#1a1a2e] group-hover:text-[#2441ff] transition-colors mb-2 leading-tight">
                  {post.title}
                </h2>

                <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">
                  {post.description}
                </p>

                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                  <span>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="text-gray-200">·</span>
                  <span>{post.readingTime} min read</span>
                  <span className="text-gray-200">·</span>
                  <span>{post.author}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="bg-white/10 rounded-2xl p-16 text-center text-white/40">
            No posts yet — check back soon.
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-10">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-5 py-2.5 rounded-full text-[12px] tracking-[0.15em] uppercase font-semibold transition-colors bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-9 h-9 rounded-full text-[13px] font-semibold transition-colors ${
                  page === i
                    ? "bg-white text-[#2441ff]"
                    : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {i + 1}
              </button>
            ))}

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-5 py-2.5 rounded-full text-[12px] tracking-[0.15em] uppercase font-semibold transition-colors bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
