export const runtime = "edge";
import { NextResponse } from "next/server";

/**
 * POST /api/rpc
 *
 * Server-side proxy for Solana JSON-RPC requests.
 * Keeps the Helius API key hidden from the client bundle.
 *
 * Uses the Cloudflare Cache API to cache responses at the edge,
 * so repeated identical RPC calls across all visitors at a given
 * PoP only hit Helius once within the TTL window.
 */

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

// TTL per RPC method (seconds). Methods not listed are not cached.
const METHOD_TTL: Record<string, number> = {
  getAccountInfo: 5,
  getProgramAccounts: 10,
  getSlot: 2,
  getMultipleAccountsInfo: 5,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const method = (body as Record<string, unknown>).method as string;
    const ttl = METHOD_TTL[method] ?? 0;

    // ── Try Cloudflare edge cache ──
    let cacheKey: Request | null = null;
    if (ttl > 0 && typeof caches !== "undefined") {
      // Build a synthetic GET URL as cache key (Cache API requires GET)
      const keyStr = `https://rpc-cache.internal/${method}/${JSON.stringify((body as Record<string, unknown>).params ?? [])}`;
      cacheKey = new Request(keyStr, { method: "GET" });

      const cache = (caches as unknown as { default: Cache }).default;
      const cached = await cache.match(cacheKey);
      if (cached) {
        // Patch the JSON-RPC id to match the caller's request
        const cachedData = await cached.json();
        if ((body as Record<string, unknown>).id !== undefined) {
          (cachedData as Record<string, unknown>).id = (
            body as Record<string, unknown>
          ).id;
        }
        return NextResponse.json(cachedData, {
          headers: { "X-Cache": "HIT" },
        });
      }
    }

    // ── Cache miss — fetch from Helius ──
    const rpcRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await rpcRes.json();

    // ── Store in edge cache ──
    if (cacheKey && ttl > 0 && typeof caches !== "undefined") {
      const cacheRes = new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      });
      // put() is fire-and-forget on Cloudflare
      (caches as unknown as { default: Cache }).default.put(cacheKey, cacheRes);
    }

    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("RPC proxy error:", msg);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: msg }, id: null },
      { status: 502 },
    );
  }
}
