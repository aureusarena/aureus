import fs from "fs";
import path from "path";
import matter from "gray-matter";

export interface BlogMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  readingTime: number;
}

export interface BlogPost extends BlogMeta {
  content: string;
}

const CONTENT_DIR = path.join(process.cwd(), "src/app/blog/content");

function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function getAllPosts(): BlogMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx"));

  return files
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf8");
      const { data, content } = matter(raw);

      return {
        slug,
        title: data.title || slug,
        description: data.description || "",
        date: data.date || "2026-01-01",
        author: data.author || "Aureus Arena",
        tags: data.tags || [],
        readingTime: estimateReadingTime(content),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | null {
  const filepath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filepath)) return null;

  const raw = fs.readFileSync(filepath, "utf8");
  const { data, content } = matter(raw);

  return {
    slug,
    title: data.title || slug,
    description: data.description || "",
    date: data.date || "2026-01-01",
    author: data.author || "Aureus Arena",
    tags: data.tags || [],
    readingTime: estimateReadingTime(content),
    content,
  };
}
