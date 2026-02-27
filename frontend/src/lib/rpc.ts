/**
 * Returns the full RPC proxy URL for use with @solana/web3.js Connection.
 * Constructs the absolute URL from window.location.origin at runtime
 * so the Helius API key stays server-side.
 */
export function getRpcUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc`;
  }
  // Server-side fallback (should never be used by client hooks)
  return process.env.RPC_URL || "https://api.devnet.solana.com";
}
