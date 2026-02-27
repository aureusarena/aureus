"use client";

import { useEffect, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { getRpcUrl } from "@/lib/rpc";

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);

export interface StakerData {
  /** The staker PDA address */
  pda: string;
  /** The owner wallet pubkey */
  owner: string;
  /** Amount of AUR staked (raw, 6 decimals) */
  aurStaked: number;
  /** Reward debt snapshot (u128) */
  rewardDebt: bigint;
  /** Pending SOL rewards (lamports) */
  pendingRewards: number;
  /** Slot when staked */
  stakedAt: number;
}

/**
 * StakeState layout:
 *   is_initialized: bool (1)
 *   owner: Pubkey (32)
 *   aur_staked: u64 (8)
 *   reward_debt: u128 (16)
 *   pending_rewards: u64 (8)
 *   staked_at: u64 (8)
 *   bump: u8 (1)
 *   Total: 74 bytes
 */
function deserializeStaker(d: Buffer, pda: string): StakerData | null {
  if (d.length < 74) return null;
  const initialized = d[0];
  if (!initialized) return null;

  let o = 1;
  const owner = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const aurStaked = Number(d.readBigUInt64LE(o));
  o += 8;
  // u128 little-endian
  const lo = d.readBigUInt64LE(o);
  const hi = d.readBigUInt64LE(o + 8);
  const rewardDebt = (hi << BigInt(64)) | lo;
  o += 16;
  const pendingRewards = Number(d.readBigUInt64LE(o));
  o += 8;
  const stakedAt = Number(d.readBigUInt64LE(o));
  o += 8;

  return { pda, owner, aurStaked, rewardDebt, pendingRewards, stakedAt };
}

export function useStakerLeaderboard(pollMs = 30000) {
  const [stakers, setStakers] = useState<StakerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStakers = useCallback(async () => {
    try {
      const connection = new Connection(getRpcUrl(), "confirmed");
      // StakeState accounts are exactly 74 bytes
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: 74 }],
      });

      const parsed: StakerData[] = [];
      for (const { pubkey, account } of accounts) {
        const staker = deserializeStaker(
          account.data as Buffer,
          pubkey.toBase58(),
        );
        if (staker && staker.aurStaked > 0) parsed.push(staker);
      }

      // Sort by amount staked descending
      parsed.sort((a, b) => b.aurStaked - a.aurStaked);

      setStakers(parsed);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStakers();
    const id = setInterval(fetchStakers, pollMs);
    return () => clearInterval(id);
  }, [fetchStakers, pollMs]);

  return { stakers, loading, error, refetch: fetchStakers };
}

/**
 * Calculate real-time pending SOL rewards for a staker.
 * Formula: ((cumulative - debt) × staked / REWARD_PRECISION) + stored_pending
 * REWARD_PRECISION = 1e12 (matches on-chain constant)
 */
const REWARD_PRECISION = BigInt("1000000000000"); // 1e12

export function calcPendingRewards(
  staker: StakerData,
  rewardPerTokenCumulative: bigint,
): number {
  if (staker.aurStaked === 0) return staker.pendingRewards;
  const diff = rewardPerTokenCumulative - staker.rewardDebt;
  if (diff <= BigInt(0)) return staker.pendingRewards;
  const accrued = (diff * BigInt(staker.aurStaked)) / REWARD_PRECISION;
  return staker.pendingRewards + Number(accrued);
}
