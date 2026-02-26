import { Connection, PublicKey } from "@solana/web3.js";
import {
  findArenaPDA,
  findAgentPDA,
  findCommitPDA,
  findATA,
  findMintPDA,
} from "./pda";

// ═══════════════════════════════════════════════════
// On-chain State Types
// ═══════════════════════════════════════════════════

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
  solJackpotT1: number;
  solJackpotT2: number;
  solJackpotT3: number;
  tokenJackpotT1: number;
  tokenJackpotT2: number;
  tokenJackpotT3: number;
  protocolRevenue: number;
  stakerRewardPool: number;
  totalAurStaked: number;
  lpFund: number;
  totalLpDeployed: number;
  t2Eligible: number;
  t3Eligible: number;
  jackpotHistory: JackpotWin[];
}

export interface AgentState {
  authority: string;
  totalWins: number;
  totalLosses: number;
  totalPushes: number;
  winRate: number;
  totalAurEarned: number;
  totalSolEarned: number;
  registeredAt: number;
}

export interface CommitResult {
  result: number; // 0=loss, 1=win, 2=push, 255=unset
  solWon: number;
  tokensWon: number;
  strategy: number[];
  commitIndex: number;
  claimed: boolean;
  opponent: string;
  tier: number;
}

// ═══════════════════════════════════════════════════
// Deserializers
// ═══════════════════════════════════════════════════

export function deserializeArena(d: Buffer): ArenaState {
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
  // Per-tier jackpots (6 × u64)
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
  o += 3; // bumps (bump, mint_bump, vault_bump)
  const protocolRevenue = Number(d.readBigUInt64LE(o));
  o += 8;
  const stakerRewardPool = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalAurStaked = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 16; // reward_per_token_cumulative u128
  const lpFund = Number(d.readBigUInt64LE(o));
  o += 8;

  let totalLpDeployed = 0;
  if (o + 40 <= d.length) {
    o += 32; // lp_pool pubkey
    totalLpDeployed = Number(d.readBigUInt64LE(o));
    o += 8;
  }

  // Jackpot history ring buffer
  const jackpotHistory: JackpotWin[] = [];
  if (o + 10 * 8 + 10 * 32 + 10 * 8 + 10 + 1 <= d.length) {
    const rounds: number[] = [];
    for (let i = 0; i < 10; i++) {
      rounds.push(Number(d.readBigUInt64LE(o)));
      o += 8;
    }
    const winners: string[] = [];
    for (let i = 0; i < 10; i++) {
      winners.push(new PublicKey(d.slice(o, o + 32)).toBase58());
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

  // t2/t3 eligible counts
  let t2Eligible = 0;
  let t3Eligible = 0;
  if (o + 8 <= d.length) {
    t2Eligible = d.readUInt32LE(o);
    o += 4;
    t3Eligible = d.readUInt32LE(o);
    o += 4;
  }

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
    protocolRevenue,
    stakerRewardPool,
    totalAurStaked,
    lpFund,
    totalLpDeployed,
    t2Eligible,
    t3Eligible,
    jackpotHistory,
  };
}

export function deserializeAgent(d: Buffer): AgentState {
  let o = 1; // is_initialized
  const authority = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const totalWins = d.readUInt32LE(o);
  o += 4;
  const totalLosses = d.readUInt32LE(o);
  o += 4;
  const totalPushes = d.readUInt32LE(o);
  o += 4;
  o += 100; // last_100 ring buffer
  o += 1; // last_100_idx
  const registeredAt = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 1; // bump
  const totalAurEarned = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalSolEarned = Number(d.readBigUInt64LE(o));
  o += 8;

  const total = totalWins + totalLosses + totalPushes;
  const winRate = total === 0 ? 50 : Math.round((totalWins / total) * 100);

  return {
    authority,
    totalWins,
    totalLosses,
    totalPushes,
    winRate,
    totalAurEarned,
    totalSolEarned,
    registeredAt,
  };
}

export function deserializeCommit(d: Buffer): CommitResult {
  let o = 1 + 32 + 8 + 32; // init, agent, round, commitment
  const revealed = d[o] === 1;
  o += 1;
  const strategy = Array.from(d.slice(o, o + 5));
  o += 5;
  const opponent = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const scored = d[o] === 1;
  o += 1;
  const result = d[o];
  o += 1;
  const solWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokensWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const claimed = d[o] === 1;
  o += 1;
  o += 1; // bump
  o += 8; // jackpot_sol_won
  o += 8; // jackpot_tokens_won
  const commitIndex = d.readUInt32LE(o);
  o += 4;
  const tier = d[o];
  o += 1;

  return {
    result,
    solWon,
    tokensWon,
    strategy,
    commitIndex,
    claimed,
    opponent,
    tier,
  };
}

// ═══════════════════════════════════════════════════
// State Readers
// ═══════════════════════════════════════════════════

export async function fetchArenaState(
  connection: Connection,
): Promise<ArenaState | null> {
  const [pda] = findArenaPDA();
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return deserializeArena(info.data as Buffer);
}

export async function fetchAgentState(
  connection: Connection,
  wallet: PublicKey,
): Promise<AgentState | null> {
  const [pda] = findAgentPDA(wallet);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return deserializeAgent(info.data as Buffer);
}

export async function fetchCommitResult(
  connection: Connection,
  round: number,
  wallet: PublicKey,
): Promise<CommitResult | null> {
  const [pda] = findCommitPDA(round, wallet);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  return deserializeCommit(info.data as Buffer);
}

export async function fetchTokenBalance(
  connection: Connection,
  wallet: PublicKey,
): Promise<number> {
  const [mint] = findMintPDA();
  const [ata] = findATA(wallet, mint);
  try {
    const info = await connection.getAccountInfo(ata);
    if (!info) return 0;
    return Number((info.data as Buffer).readBigUInt64LE(64));
  } catch {
    return 0;
  }
}
