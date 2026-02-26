"use client";

import Link from "next/link";
import { Header } from "@/components/header";

interface RelatedPost {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  readingTime: number;
}

interface BlogPostClientProps {
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: number;
  contentHtml: string;
  relatedPosts: RelatedPost[];
}

export function BlogPostClient({
  title,
  description,
  date,
  author,
  tags,
  readingTime,
  contentHtml,
  relatedPosts,
}: BlogPostClientProps) {
  return (
    <div className="min-h-screen bg-[#2441ff] text-white">
      <Header />

      <div className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-white/50 text-sm hover:text-white/80 transition-colors mb-8"
        >
          ← All Posts
        </Link>

        <article className="bg-white rounded-[24px] shadow-[0_30px_80px_rgba(0,0,60,0.35)] overflow-hidden">
          {/* Header */}
          <div className="px-10 pt-10 pb-8 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] tracking-[0.15em] uppercase font-semibold text-[#2441ff] bg-blue-50 px-2.5 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h1
              className="text-3xl md:text-4xl text-[#1a1a2e] leading-tight mb-3"
              style={{ fontFamily: "var(--font-playfair, Georgia, serif)" }}
            >
              {title}
            </h1>

            {description && (
              <p className="text-gray-500 text-[15px] leading-relaxed mb-6">
                {description}
              </p>
            )}

            <div className="flex items-center gap-4 text-[11px] text-gray-400">
              <span>
                {new Date(date).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span className="text-gray-200">·</span>
              <span>{readingTime} min read</span>
              <span className="text-gray-200">·</span>
              <span>{author}</span>
            </div>
          </div>

          {/* Body */}
          <div
            className="blog-body px-10 py-10"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />
        </article>

        {/* Read Next */}
        {relatedPosts.length > 0 && (
          <div className="mt-8">
            <h3 className="text-white/40 text-[11px] tracking-[0.2em] uppercase font-semibold mb-4">
              Read Next
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedPosts.map((rp) => (
                <Link
                  key={rp.slug}
                  href={`/blog/${rp.slug}`}
                  className="block group"
                >
                  <div className="bg-white/10 backdrop-blur-sm rounded-[16px] p-6 hover:bg-white/15 transition-colors h-full">
                    <div className="flex items-center gap-2 mb-2">
                      {rp.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] tracking-[0.12em] uppercase font-semibold text-white/50 bg-white/10 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h4 className="text-white font-semibold text-[15px] leading-snug group-hover:text-white/90 transition-colors mb-2">
                      {rp.title}
                    </h4>
                    <p className="text-white/40 text-[12px] leading-relaxed line-clamp-2">
                      {rp.description}
                    </p>
                    <span className="text-white/30 text-[11px] mt-3 block">
                      {rp.readingTime} min read →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .blog-body {
          color: #1a1a2e;
          font-size: 15px;
          line-height: 1.8;
        }
        .blog-body h1 {
          font-size: 1.8rem;
          font-weight: 700;
          margin: 2rem 0 1rem;
          color: #1a1a2e;
        }
        .blog-body h2 {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 2rem 0 0.75rem;
          color: #1a1a2e;
        }
        .blog-body h3 {
          font-size: 1.15rem;
          font-weight: 600;
          margin: 1.5rem 0 0.5rem;
          color: #1a1a2e;
        }
        .blog-body p {
          margin: 0 0 1rem;
          color: #444;
        }
        .blog-body strong {
          color: #1a1a2e;
          font-weight: 600;
        }
        .blog-body a {
          color: #2441ff;
          text-decoration: underline;
        }
        .blog-body ul,
        .blog-body ol {
          margin: 0.5rem 0 1rem 1.5rem;
          color: #444;
        }
        .blog-body li {
          margin-bottom: 0.35rem;
        }
        .blog-body code {
          background: #f0f2ff;
          color: #2441ff;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          font-size: 0.85em;
        }
        .blog-body pre {
          background: #0a1440;
          color: #e0e6ff;
          padding: 1.25rem;
          border-radius: 12px;
          overflow-x: auto;
          margin: 1rem 0;
          font-size: 0.85rem;
          line-height: 1.6;
        }
        .blog-body pre code {
          background: none;
          color: inherit;
          padding: 0;
          font-size: inherit;
        }
        .blog-body blockquote {
          border-left: 3px solid #2441ff;
          padding: 0.75rem 1.25rem;
          margin: 1rem 0;
          background: #f8f9ff;
          border-radius: 0 8px 8px 0;
          color: #555;
        }
        .blog-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1rem 0;
          font-size: 0.9rem;
        }
        .blog-body th {
          background: #f0f2ff;
          padding: 0.6rem 1rem;
          text-align: left;
          font-weight: 600;
          font-size: 0.8rem;
          color: #1a1a2e;
          border-bottom: 2px solid #e0e3ff;
        }
        .blog-body td {
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #f0f2ff;
          color: #444;
        }
        .blog-body hr {
          border: none;
          border-top: 1px solid #eee;
          margin: 2rem 0;
        }
      `}</style>
    </div>
  );
}
