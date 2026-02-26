"use client";

import { useEffect, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

const [ARENA_PDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("arena")],
  PROGRAM_ID,
);

export interface JackpotWin {
  round: number;
  winner: string;
  amount: number;
  type: "SOL" | "AUR";
}

export interface ArenaState {
  genesis: number;
  totalRounds: number;
  totalAgents: number;
  era: number;
  emitted: number;
  // Per-tier jackpots
  solJackpotT1: number;
  solJackpotT2: number;
  solJackpotT3: number;
  tokenJackpotT1: number;
  tokenJackpotT2: number;
  tokenJackpotT3: number;
  // Aggregated for display
  solJackpot: number;
  tokenJackpot: number;
  // Tier eligibility
  totalStakersT2Eligible: number;
  totalStakersT3Eligible: number;
  // Swap fee AUR jackpot (pre-minted, routed to T1)
  swapFeeAurJackpot: number;
  protocolRevenue: number;
  stakerRewardPool: number;
  totalAurStaked: number;
  rewardPerTokenCumulative: bigint;
  lpFund: number;
  lpPool: string;
  totalLpDeployed: number;
  jackpotHistory: JackpotWin[];
}

function deserializeArena(d: Buffer): ArenaState {
  let o = 0;
  o += 1 + 32 + 32 + 32; // is_initialized, authority, token_mint, sol_vault
  const genesis = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalRounds = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalAgents = Number(d.readBigUInt64LE(o));
  o += 8;
  const era = d[o];
  o += 1;
  const emitted = Number(d.readBigUInt64LE(o));
  o += 8;
  // Per-tier jackpots (3 SOL + 3 AUR)
  const solJackpotT1 = Number(d.readBigUInt64LE(o));
  o += 8;
  const solJackpotT2 = Number(d.readBigUInt64LE(o));
  o += 8;
  const solJackpotT3 = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokenJackpotT1 = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokenJackpotT2 = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokenJackpotT3 = Number(d.readBigUInt64LE(o));
  o += 8;
  // bumps (right after jackpots in struct order)
  o += 3; // bump, mint_bump, vault_bump
  const protocolRevenue = Number(d.readBigUInt64LE(o));
  o += 8;
  const stakerRewardPool = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalAurStaked = Number(d.readBigUInt64LE(o));
  o += 8;
  // reward_per_token_cumulative u128 (little-endian)
  const rptLo = d.readBigUInt64LE(o);
  const rptHi = d.readBigUInt64LE(o + 8);
  const rewardPerTokenCumulative = (rptHi << BigInt(64)) | rptLo;
  o += 16;
  const lpFund = Number(d.readBigUInt64LE(o));
  o += 8;
  let lpPool = PublicKey.default.toBase58();
  let totalLpDeployed = 0;
  if (o + 40 <= d.length) {
    lpPool = new PublicKey(d.slice(o, o + 32)).toBase58();
    o += 32;
    totalLpDeployed = Number(d.readBigUInt64LE(o));
    o += 8;
  }

  // Jackpot history ring buffer (if present in data)
  const jackpotHistory: JackpotWin[] = [];
  if (o + 10 * 8 + 10 * 32 + 10 * 8 + 10 + 1 <= d.length) {
    const rounds: number[] = [];
    for (let i = 0; i < 10; i++) {
      rounds.push(Number(d.readBigUInt64LE(o)));
      o += 8;
    }
    const winners: string[] = [];
    for (let i = 0; i < 10; i++) {
      const pk = new PublicKey(d.slice(o, o + 32));
      winners.push(pk.toBase58());
      o += 32;
    }
    const amounts: number[] = [];
    for (let i = 0; i < 10; i++) {
      amounts.push(Number(d.readBigUInt64LE(o)));
      o += 8;
    }
    const types: number[] = [];
    for (let i = 0; i < 10; i++) {
      types.push(d[o]);
      o += 1;
    }
    const historyIdx = d[o];
    o += 1;

    // Read in order from oldest to newest
    for (let i = 0; i < 10; i++) {
      const idx = (historyIdx + i) % 10;
      if (rounds[idx] > 0) {
        jackpotHistory.push({
          round: rounds[idx],
          winner: winners[idx],
          amount: amounts[idx],
          type: types[idx] === 0 ? "SOL" : "AUR",
        });
      }
    }
  }

  // Tier eligibility counters
  let totalStakersT2Eligible = 0;
  let totalStakersT3Eligible = 0;
  if (o + 8 <= d.length) {
    totalStakersT2Eligible = d.readUInt32LE(o);
    o += 4;
    totalStakersT3Eligible = d.readUInt32LE(o);
    o += 4;
  }

  // Swap fee AUR jackpot (new field, at end of struct)
  let swapFeeAurJackpot = 0;
  if (o + 8 <= d.length) {
    swapFeeAurJackpot = Number(d.readBigUInt64LE(o));
    o += 8;
  }

  // Aggregate jackpots for display (include swap fee AUR in T1 token jackpot)
  const solJackpot = solJackpotT1 + solJackpotT2 + solJackpotT3;
  const tokenJackpot =
    tokenJackpotT1 + tokenJackpotT2 + tokenJackpotT3 + swapFeeAurJackpot;

  return {
    genesis,
    totalRounds,
    totalAgents,
    era,
    emitted,
    solJackpotT1,
    solJackpotT2,
    solJackpotT3,
    tokenJackpotT1,
    tokenJackpotT2,
    tokenJackpotT3,
    solJackpot,
    tokenJackpot,
    totalStakersT2Eligible,
    totalStakersT3Eligible,
    swapFeeAurJackpot,
    protocolRevenue,
    stakerRewardPool,
    totalAurStaked,
    rewardPerTokenCumulative,
    lpFund,
    lpPool,
    totalLpDeployed,
    jackpotHistory,
  };
}

export function useArenaState(pollMs = 3000) {
  const [arena, setArena] = useState<ArenaState | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchArena = useCallback(async () => {
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const [info, slot] = await Promise.all([
        connection.getAccountInfo(ARENA_PDA),
        connection.getSlot(),
      ]);
      setCurrentSlot(slot);
      if (!info) {
        setError("Arena not initialized");
        setLoading(false);
        return;
      }
      const state = deserializeArena(info.data as Buffer);
      setArena(state);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArena();
    const id = setInterval(fetchArena, pollMs);
    return () => clearInterval(id);
  }, [fetchArena, pollMs]);

  return { arena, currentSlot, error, loading, refetch: fetchArena };
}

/* ─── round timing ─── */
const SLOTS_PER_ROUND = 30;
const COMMIT_SLOTS = 20;
const REVEAL_SLOTS = 8;

export interface RoundInfo {
  roundNumber: number;
  phase: "commit" | "reveal" | "scoring";
  slotsRemaining: number;
  progress: number; // 0-100
  phaseProgress: number; // 0-100 within current phase
}

export function getRoundInfo(genesis: number, currentSlot: number): RoundInfo {
  const elapsed = Math.max(0, currentSlot - genesis);
  const roundNumber = Math.floor(elapsed / SLOTS_PER_ROUND) + 1;
  const slotInRound = elapsed % SLOTS_PER_ROUND;

  let phase: "commit" | "reveal" | "scoring";
  let slotsRemaining: number;
  let phaseProgress: number;

  if (slotInRound < COMMIT_SLOTS) {
    phase = "commit";
    slotsRemaining = COMMIT_SLOTS - slotInRound;
    phaseProgress = (slotInRound / COMMIT_SLOTS) * 100;
  } else {
    phase = "reveal";
    slotsRemaining = SLOTS_PER_ROUND - slotInRound;
    phaseProgress = ((slotInRound - COMMIT_SLOTS) / REVEAL_SLOTS) * 100;
  }

  const progress = (slotInRound / SLOTS_PER_ROUND) * 100;

  return { roundNumber, phase, slotsRemaining, progress, phaseProgress };
}

/* ─── helpers for display ─── */
export function lamportsToSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

export function tokenToAur(raw: number): string {
  return (raw / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
