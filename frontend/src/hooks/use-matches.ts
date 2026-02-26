"use client";

import { useEffect, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export interface MatchData {
  /** The commit PDA address */
  pda: string;
  /** Agent wallet pubkey */
  agent: string;
  /** Round number */
  round: number;
  /** Whether the strategy was revealed */
  revealed: boolean;
  /** The 5-field strategy [0-100] */
  strategy: number[];
  /** Opponent wallet pubkey */
  opponent: string;
  /** Whether match has been scored */
  scored: boolean;
  /** 0=loss, 1=win, 2=push, 255=unset */
  result: number;
  /** SOL won (lamports) */
  solWon: number;
  /** AUR tokens won (raw, 6 decimals) */
  tokensWon: number;
  /** Whether rewards have been claimed */
  claimed: boolean;
  /** Jackpot SOL won */
  jackpotSolWon: number;
  /** Jackpot AUR won */
  jackpotTokensWon: number;
  /** Commit index within the round (per-tier) */
  commitIndex: number;
  /** Tier: 0=Bronze, 1=Silver, 2=Gold */
  tier: number;
}

/**
 * CommitState layout (152 bytes):
 *   is_initialized: bool  (1)
 *   agent: Pubkey         (32)
 *   round_number: u64     (8)
 *   commitment: [u8; 32]  (32)
 *   revealed: bool        (1)
 *   strategy: [u8; 5]     (5)
 *   opponent: Pubkey       (32)
 *   scored: bool          (1)
 *   result: u8            (1)
 *   sol_won: u64          (8)
 *   tokens_won: u64       (8)
 *   claimed: bool         (1)
 *   bump: u8              (1)
 *   jackpot_sol_won: u64  (8)
 *   jackpot_tokens_won: u64 (8)
 *   commit_index: u32     (4)
 *   tier: u8              (1)
 *   Total: 152
 */
const COMMIT_STATE_SIZE = 152;

function deserializeMatch(d: Buffer, pda: string): MatchData | null {
  if (d.length < COMMIT_STATE_SIZE) return null;
  const initialized = d[0];
  if (!initialized) return null;

  let o = 1;
  const agent = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const round = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 32; // commitment hash (skip)
  const revealed = !!d[o];
  o += 1;
  const strategy = Array.from(d.slice(o, o + 5));
  o += 5;
  const opponent = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const scored = !!d[o];
  o += 1;
  const result = d[o];
  o += 1;
  const solWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokensWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const claimed = !!d[o];
  o += 1;
  o += 1; // bump
  const jackpotSolWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const jackpotTokensWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const commitIndex = d.readUInt32LE(o);
  o += 4;
  const tier = d[o];

  return {
    pda,
    agent,
    round,
    revealed,
    strategy,
    opponent,
    scored,
    result,
    solWon,
    tokensWon,
    claimed,
    jackpotSolWon,
    jackpotTokensWon,
    commitIndex,
    tier,
  };
}

/** Fetch all matches (commit accounts) from on-chain */
export function useAllMatches(pollMs = 10000) {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: COMMIT_STATE_SIZE }],
      });

      const parsed: MatchData[] = [];
      for (const { pubkey, account } of accounts) {
        const match = deserializeMatch(
          account.data as Buffer,
          pubkey.toBase58(),
        );
        if (match) parsed.push(match);
      }

      // Sort by round descending (newest first)
      parsed.sort((a, b) => b.round - a.round);

      setMatches(parsed);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    const id = setInterval(fetchMatches, pollMs);
    return () => clearInterval(id);
  }, [fetchMatches, pollMs]);

  return { matches, loading, error, refetch: fetchMatches };
}

/** Fetch matches for a specific wallet address */
export function useAgentMatches(walletAddress: string, pollMs = 10000) {
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      // Fetch all commit accounts and filter by agent
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: COMMIT_STATE_SIZE },
          {
            memcmp: {
              offset: 1, // agent pubkey starts at byte 1
              bytes: walletAddress,
            },
          },
        ],
      });

      const parsed: MatchData[] = [];
      for (const { pubkey, account } of accounts) {
        const match = deserializeMatch(
          account.data as Buffer,
          pubkey.toBase58(),
        );
        if (match) parsed.push(match);
      }

      // Sort by round descending (newest first)
      parsed.sort((a, b) => b.round - a.round);

      setMatches(parsed);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchMatches();
    const id = setInterval(fetchMatches, pollMs);
    return () => clearInterval(id);
  }, [fetchMatches, pollMs]);

  return { matches, loading, error, refetch: fetchMatches };
}

/* ─── helpers ─── */
export function resultLabel(result: number): string {
  switch (result) {
    case 1:
      return "Win";
    case 0:
      return "Loss";
    case 2:
      return "Push";
    default:
      return "Pending";
  }
}

export function resultColor(result: number): string {
  switch (result) {
    case 1:
      return "text-green-600";
    case 0:
      return "text-red-500";
    case 2:
      return "text-gray-400";
    default:
      return "text-white/40";
  }
}

export function resultBgColor(result: number): string {
  switch (result) {
    case 1:
      return "bg-green-500/10 border-green-500/20";
    case 0:
      return "bg-red-500/10 border-red-500/20";
    case 2:
      return "bg-gray-500/10 border-gray-500/20";
    default:
      return "bg-white/5 border-white/10";
  }
}

export function tierLabel(tier: number): string {
  switch (tier) {
    case 0:
      return "Bronze";
    case 1:
      return "Silver";
    case 2:
      return "Gold";
    default:
      return "Unknown";
  }
}

export function tierBadgeClass(tier: number): string {
  switch (tier) {
    case 0:
      return "bg-amber-100 text-amber-700";
    case 1:
      return "bg-slate-100 text-slate-600";
    case 2:
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}
