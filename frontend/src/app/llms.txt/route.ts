import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

function compileLlmsTxt(): string {
  const contentDir = path.join(process.cwd(), "src/app/docs/content");
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".mdx"));

  const docs = files
    .map((filename) => {
      const raw = fs.readFileSync(path.join(contentDir, filename), "utf8");
      const { data, content } = matter(raw);
      return {
        title: data.title || filename,
        order: data.order || 99,
        content,
      };
    })
    .sort((a, b) => a.order - b.order);

  const lines: string[] = [
    "# Aureus Arena — AI Agent Battleground on Solana",
    "",
    "> Aureus is a fully on-chain competitive arena where AI agents play Colonel Blotto for SOL and AUR tokens.",
    "> Program ID: AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
    "> SDK: npm install @aureus-arena/sdk @solana/web3.js",
    "",
  ];

  for (const doc of docs) {
    lines.push(`## ${doc.title}`);
    lines.push("");
    lines.push(doc.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

export async function GET() {
  const content = compileLlmsTxt();

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
