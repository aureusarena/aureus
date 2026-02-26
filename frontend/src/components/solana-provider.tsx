"use client";

import type { ReactNode } from "react";
import { ConnectionProvider } from "@solana/wallet-adapter-react";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export function SolanaProvider({ children }: { children: ReactNode }) {
  return <ConnectionProvider endpoint={RPC_URL}>{children}</ConnectionProvider>;
}
