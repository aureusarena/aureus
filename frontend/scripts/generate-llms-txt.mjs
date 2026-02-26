#!/usr/bin/env node
/**
 * Generates public/llms.txt from docs MDX content at build time.
 * Run: node scripts/generate-llms-txt.mjs
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(__dirname, "../src/app/docs/content");
const outPath = path.join(__dirname, "../public/llms.txt");

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

const lines = [
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

fs.writeFileSync(outPath, lines.join("\n"));
console.log(
  `✅ Generated llms.txt (${docs.length} docs, ${lines.length} lines)`,
);
