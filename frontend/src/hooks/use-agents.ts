"use client";

import { useEffect, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export interface AgentData {
  /** The wallet pubkey that owns this agent */
  wallet: string;
  /** The agent PDA address */
  pda: string;
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  totalGames: number;
  winRate: number;
  registeredAt: number;
  totalAurEarned: number;
  totalSolEarned: number;
  last100: number[];
  last100Idx: number;
  matchesT1: number;
  matchesT2: number;
  matchesT3: number;
}

/** Agent state: 1 + 32 + 4 + 4 + 4 + 100 + 1 + 8 + 1 + 8 + 8 + 4 + 4 + 4 = 183 bytes */
function deserializeAgent(d: Buffer, pda: string): AgentData | null {
  if (d.length < 183) return null;
  const initialized = d[0];
  if (!initialized) return null;

  let o = 1;
  const wallet = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const totalWins = d.readUInt32LE(o);
  o += 4;
  const totalLosses = d.readUInt32LE(o);
  o += 4;
  const totalPushes = d.readUInt32LE(o);
  o += 4;
  const last100 = Array.from(d.slice(o, o + 100));
  o += 100;
  const last100Idx = d[o];
  o += 1;
  const registeredAt = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 1; // bump
  const totalAurEarned = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalSolEarned = Number(d.readBigUInt64LE(o));
  o += 8;
  // Per-tier match counts
  const matchesT1 = d.readUInt32LE(o);
  o += 4;
  const matchesT2 = d.readUInt32LE(o);
  o += 4;
  const matchesT3 = d.readUInt32LE(o);
  o += 4;

  const totalGames = totalWins + totalLosses + totalPushes;

  // Calculate win rate from last 100
  let wins = 0,
    valid = 0;
  const rounds = Math.min(totalGames, 100);
  for (let i = 0; i < rounds; i++) {
    const idx =
      last100Idx >= i + 1 ? last100Idx - i - 1 : 100 + last100Idx - i - 1;
    if (last100[idx] === 1) {
      wins++;
      valid++;
    } else if (last100[idx] === 0) {
      valid++;
    }
  }
  const winRate = valid > 0 ? Math.round((wins * 100) / valid) : 50;

  return {
    wallet,
    pda,
    totalWins,
    totalLosses,
    totalPushes,
    totalGames,
    winRate,
    registeredAt,
    totalAurEarned,
    totalSolEarned,
    last100,
    last100Idx,
    matchesT1,
    matchesT2,
    matchesT3,
  };
}

export function useAgentLeaderboard(pollMs = 5000) {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      // Get all agent accounts (they have a known size of 183 bytes)
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: 183 }],
      });

      const parsed: AgentData[] = [];
      for (const { pubkey, account } of accounts) {
        const agent = deserializeAgent(
          account.data as Buffer,
          pubkey.toBase58(),
        );
        if (agent) parsed.push(agent);
      }

      // Sort by total SOL earned descending (profit leaderboard)
      parsed.sort((a, b) => b.totalSolEarned - a.totalSolEarned);

      setAgents(parsed);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const id = setInterval(fetchAgents, pollMs);
    return () => clearInterval(id);
  }, [fetchAgents, pollMs]);

  return { agents, loading, error };
}

export function useAgentProfile(walletAddress: string) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const walletPk = new PublicKey(walletAddress);
      const [agentPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("agent"), walletPk.toBuffer()],
        PROGRAM_ID,
      );
      const info = await connection.getAccountInfo(agentPDA);
      if (!info) {
        setError("Agent not found");
        setLoading(false);
        return;
      }
      const data = deserializeAgent(info.data as Buffer, agentPDA.toBase58());
      setAgent(data);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchAgent();
    const id = setInterval(fetchAgent, 5000);
    return () => clearInterval(id);
  }, [fetchAgent]);

  return { agent, loading, error };
}
