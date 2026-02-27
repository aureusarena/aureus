import { NextResponse } from "next/server";

/**
 * POST /api/rpc
 *
 * Server-side proxy for Solana JSON-RPC requests.
 * Keeps the Helius API key hidden from the client bundle.
 */

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const rpcRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await rpcRes.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
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
