import { getPostBySlug, getAllPosts } from "../lib/posts";
import { BlogPostClient } from "./blog-post-client";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not Found" };

  const ogImageUrl = `/blog/${slug}/og`;

  return {
    title: `${post.title} — Aureus Arena`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [ogImageUrl],
    },
  };
}

/** Simple markdown to HTML — runs server-side only */
function mdToHtml(md: string): string {
  let html = md;

  // 1. Extract fenced code blocks first (before anything else can mangle them)
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const placeholder = `__CODEBLOCK_${codeBlocks.length}__`;
    codeBlocks.push(
      `<pre><code class="language-${lang || "text"}">${escaped}</code></pre>`,
    );
    return placeholder;
  });

  // 2. Tables
  html = html.replace(/(?:^\|.+\|$\n?)+/gm, (table) => {
    const rows = table.trim().split("\n").filter(Boolean);
    if (rows.length < 2) return table;
    const parseRow = (r: string) =>
      r
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
    const headers = parseRow(rows[0]);
    const body = rows.slice(2).map(parseRow);
    let t = "<table><thead><tr>";
    headers.forEach((h) => (t += `<th>${h}</th>`));
    t += "</tr></thead><tbody>";
    body.forEach((row) => {
      t += "<tr>";
      row.forEach((c) => (t += `<td>${c}</td>`));
      t += "</tr>";
    });
    t += "</tbody></table>";
    return t;
  });

  // 3. Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // 4. Horizontal rules
  html = html.replace(/^---$/gm, "<hr />");

  // 5. Blockquotes (multi-line)
  html = html.replace(/(?:^> .+$\n?)+/gm, (block) => {
    const lines = block
      .trim()
      .split("\n")
      .map((l) => l.replace(/^> /, ""));
    return (
      "<blockquote>" +
      lines.map((l) => `<p>${l}</p>`).join("") +
      "</blockquote>"
    );
  });

  // 6. Unordered lists
  html = html.replace(/(?:^- .+$\n?)+/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => l.replace(/^- /, ""));
    return "<ul>" + items.map((i) => `<li>${i}</li>`).join("") + "</ul>";
  });

  // 7. Inline formatting
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>',
  );

  // 8. Paragraphs — wrap remaining text lines
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<table") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("__CODEBLOCK_")
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  // 9. Restore code blocks
  codeBlocks.forEach((block, i) => {
    html = html.replace(`__CODEBLOCK_${i}__`, block);
  });

  return html;
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const contentHtml = mdToHtml(post.content);

  // Find 2 related posts for internal linking
  const allPosts = getAllPosts().filter((p) => p.slug !== slug);
  const scored = allPosts.map((p) => {
    const sharedTags = p.tags.filter((t) => post.tags.includes(t)).length;
    return { ...p, score: sharedTags };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const relatedPosts = scored.slice(0, 2).map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    tags: p.tags,
    readingTime: p.readingTime,
  }));

  return (
    <BlogPostClient
      title={post.title}
      description={post.description}
      date={post.date}
      author={post.author}
      tags={post.tags}
      readingTime={post.readingTime}
      contentHtml={contentHtml}
      relatedPosts={relatedPosts}
    />
  );
}
