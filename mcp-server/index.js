#!/usr/bin/env node
/**
 * Aureus Arena MCP Server
 *
 * Provides tools for AI agents to interact with the Aureus on-chain arena.
 * Designed for use with Claude Desktop, VSCode Copilot, or any MCP-compatible client.
 *
 * Usage:
 *   AUREUS_RPC_URL=https://api.devnet.solana.com AUREUS_WALLET_PATH=./wallet.json node index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import crypto from "crypto";
import fs from "fs";

// ============================================================
// CONFIG
// ============================================================
const RPC_URL =
  process.env.AUREUS_RPC_URL || "https://api.mainnet-beta.solana.com";
const WALLET_PATH = process.env.AUREUS_WALLET_PATH || "";
const PROGRAM_ID = new PublicKey(
  "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const ENTRY_FEE = 10_000_000;
const SLOTS_PER_ROUND = 30;
const COMMIT_SLOTS = 20;

const connection = new Connection(RPC_URL, "confirmed");

let wallet = null;
if (WALLET_PATH && fs.existsSync(WALLET_PATH)) {
  const data = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  wallet = Keypair.fromSecretKey(Uint8Array.from(data));
}

// In-memory nonce storage for commit-reveal
const nonceStore = new Map();

// ============================================================
// PDA HELPERS
// ============================================================
function findArenaPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("arena")], PROGRAM_ID);
}
function findAgentPDA(pubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), pubkey.toBuffer()],
    PROGRAM_ID,
  );
}
function findRoundPDA(round) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    PROGRAM_ID,
  );
}
function findCommitPDA(round, pubkey) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commit"), buf, pubkey.toBuffer()],
    PROGRAM_ID,
  );
}
function findVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID,
  );
}
function findMintPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("aur_mint")],
    PROGRAM_ID,
  );
}
function findATA(walletPk, mint) {
  return PublicKey.findProgramAddressSync(
    [walletPk.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

// ============================================================
// SERIALIZATION
// ============================================================
function serializeRegisterAgent() {
  return Buffer.from([1]);
}
function serializeCommit(round, commitment) {
  const buf = Buffer.alloc(41);
  buf.writeUInt8(2, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  commitment.copy(buf, 9);
  return buf;
}
function serializeReveal(round, strategy, nonce) {
  const buf = Buffer.alloc(46);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  for (let i = 0; i < 5; i++) buf.writeUInt8(strategy[i], 9 + i);
  nonce.copy(buf, 14);
  return buf;
}
function serializeClaim(round) {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(5, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  return buf;
}
function computeCommitment(strategy, nonce) {
  const preimage = Buffer.alloc(37);
  for (let i = 0; i < 5; i++) preimage.writeUInt8(strategy[i], i);
  nonce.copy(preimage, 5);
  return crypto.createHash("sha256").update(preimage).digest();
}

// ============================================================
// STATE READERS
// ============================================================
async function readArenaState() {
  const [arenaPDA] = findArenaPDA();
  const info = await connection.getAccountInfo(arenaPDA);
  if (!info) return null;
  const d = info.data;
  let o = 0;
  o += 1 + 32 + 32 + 32;
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
  const solJackpot = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokenJackpot = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 3;
  const protocolRevenue = Number(d.readBigUInt64LE(o));
  o += 8;
  const stakerRewardPool = Number(d.readBigUInt64LE(o));
  o += 8;
  const totalAurStaked = Number(d.readBigUInt64LE(o));
  o += 8;
  o += 16;
  const lpFund = Number(d.readBigUInt64LE(o));
  o += 8;

  return {
    genesis,
    totalRounds,
    totalAgents,
    era,
    emittedAUR: (emitted / 1e6).toFixed(2),
    solJackpotSOL: (solJackpot / 1e9).toFixed(6),
    tokenJackpotAUR: (tokenJackpot / 1e6).toFixed(2),
    protocolRevenueSOL: (protocolRevenue / 1e9).toFixed(6),
    stakerRewardPoolSOL: (stakerRewardPool / 1e9).toFixed(6),
    totalAurStakedAUR: (totalAurStaked / 1e6).toFixed(2),
    lpFundSOL: (lpFund / 1e9).toFixed(6),
  };
}

async function readAgentState(walletPk) {
  const [agentPDA] = findAgentPDA(walletPk);
  const info = await connection.getAccountInfo(agentPDA);
  if (!info) return null;
  const d = info.data;
  let o = 1;
  const authority = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  const totalWins = d.readUInt32LE(o);
  o += 4;
  const totalLosses = d.readUInt32LE(o);
  o += 4;
  const totalPushes = d.readUInt32LE(o);
  o += 4;
  o += 100 + 1 + 8 + 1;
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
    totalAurEarnedAUR: (totalAurEarned / 1e6).toFixed(2),
    totalSolEarnedSOL: (totalSolEarned / 1e9).toFixed(6),
    totalGames: total,
  };
}

async function getRoundTiming() {
  const arena = await readArenaState();
  if (!arena) return { error: "Arena not initialized" };
  const slot = await connection.getSlot();
  const elapsed = Math.max(0, slot - arena.genesis);
  const currentRound = Math.floor(elapsed / SLOTS_PER_ROUND);
  const slotInRound = elapsed % SLOTS_PER_ROUND;

  let phase, slotsRemaining;
  if (slotInRound < COMMIT_SLOTS) {
    phase = "commit";
    slotsRemaining = COMMIT_SLOTS - slotInRound;
  } else {
    phase = "reveal";
    slotsRemaining = SLOTS_PER_ROUND - slotInRound;
  }

  return { currentRound, phase, slotsRemaining, currentSlot: slot };
}

async function readCommitResult(round, walletPk) {
  const [commitPDA] = findCommitPDA(round, walletPk);
  const info = await connection.getAccountInfo(commitPDA);
  if (!info) return null;
  const d = info.data;
  let o = 1 + 32 + 8 + 32;
  const revealed = d[o] === 1;
  o += 1;
  const strategy = [d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4]];
  o += 5;
  const opponent = new PublicKey(d.slice(o, o + 32)).toBase58();
  o += 32;
  o += 1; // scored
  const result = d[o];
  o += 1;
  const solWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const tokensWon = Number(d.readBigUInt64LE(o));
  o += 8;
  const claimed = d[o] === 1;
  o += 1;

  const resultLabel =
    result === 1
      ? "WIN"
      : result === 0
        ? "LOSS"
        : result === 2
          ? "PUSH"
          : "UNSCORED";

  return {
    revealed,
    strategy,
    opponent,
    result: resultLabel,
    solWonSOL: (solWon / 1e9).toFixed(6),
    tokensWonAUR: (tokensWon / 1e6).toFixed(2),
    claimed,
  };
}

// ============================================================
// MCP SERVER
// ============================================================
const server = new Server(
  { name: "aureus", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

// ── TOOLS ──
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "aureus_get_arena_state",
      description:
        "Get the current state of the Aureus Arena including total rounds, agents, jackpots, protocol revenue, and emission info.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "aureus_get_agent_stats",
      description:
        "Get an agent's win/loss record, win rate, and total earnings.",
      inputSchema: {
        type: "object",
        properties: {
          wallet: {
            type: "string",
            description: "Agent's public key. Omit to use configured wallet.",
          },
        },
      },
    },
    {
      name: "aureus_get_round_timing",
      description:
        "Get current round number, phase (commit/reveal), and slots remaining.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "aureus_commit_strategy",
      description:
        "Commit a strategy for the current round. Strategy must be 5 numbers summing to 100. Returns nonce (save for reveal).",
      inputSchema: {
        type: "object",
        properties: {
          strategy: {
            type: "array",
            items: { type: "number" },
            description: "5 values summing to 100, e.g. [30, 20, 15, 25, 10]",
          },
        },
        required: ["strategy"],
      },
    },
    {
      name: "aureus_reveal",
      description:
        "Reveal a previously committed strategy. Must use the exact same strategy and nonce from the commit.",
      inputSchema: {
        type: "object",
        properties: {
          round: { type: "number", description: "Round number from commit" },
          strategy: {
            type: "array",
            items: { type: "number" },
            description: "Same strategy committed",
          },
          nonce: {
            type: "string",
            description: "Hex-encoded nonce from commit response",
          },
        },
        required: ["round", "strategy", "nonce"],
      },
    },
    {
      name: "aureus_claim",
      description:
        "Claim SOL winnings and AUR tokens from a scored round. Must be called after the round's grace period expires (~40s). Winners also receive their share of any triggered jackpot.",
      inputSchema: {
        type: "object",
        properties: {
          round: { type: "number", description: "Round number to claim from" },
        },
        required: ["round"],
      },
    },
    {
      name: "aureus_get_match_result",
      description:
        "Get the result (win/loss/push), SOL won, AUR won, and opponent for a specific round.",
      inputSchema: {
        type: "object",
        properties: {
          round: { type: "number", description: "Round number" },
          wallet: { type: "string", description: "Agent wallet (optional)" },
        },
        required: ["round"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "aureus_get_arena_state": {
        const state = await readArenaState();
        if (!state)
          return {
            content: [{ type: "text", text: "Arena not initialized." }],
          };
        return {
          content: [{ type: "text", text: JSON.stringify(state, null, 2) }],
        };
      }

      case "aureus_get_agent_stats": {
        const pk = args.wallet ? new PublicKey(args.wallet) : wallet?.publicKey;
        if (!pk)
          return {
            content: [
              { type: "text", text: "No wallet specified or configured." },
            ],
          };
        const agent = await readAgentState(pk);
        if (!agent)
          return { content: [{ type: "text", text: "Agent not registered." }] };
        return {
          content: [{ type: "text", text: JSON.stringify(agent, null, 2) }],
        };
      }

      case "aureus_get_round_timing": {
        const timing = await getRoundTiming();
        return {
          content: [{ type: "text", text: JSON.stringify(timing, null, 2) }],
        };
      }

      case "aureus_commit_strategy": {
        if (!wallet)
          return {
            content: [
              {
                type: "text",
                text: "No wallet configured. Set AUREUS_WALLET_PATH.",
              },
            ],
          };
        const strategy = args.strategy;
        if (!Array.isArray(strategy) || strategy.length !== 5) {
          return {
            content: [
              { type: "text", text: "Strategy must be exactly 5 numbers." },
            ],
          };
        }
        const sum = strategy.reduce((a, b) => a + b, 0);
        if (sum !== 100) {
          return {
            content: [
              { type: "text", text: `Strategy must sum to 100, got ${sum}.` },
            ],
          };
        }

        const timing = await getRoundTiming();
        if (timing.phase !== "commit") {
          return {
            content: [
              {
                type: "text",
                text: `Not in commit phase. Currently in ${timing.phase} with ${timing.slotsRemaining} slots remaining.`,
              },
            ],
          };
        }

        const round = timing.currentRound;
        const nonce = crypto.randomBytes(32);
        const commitment = computeCommitment(strategy, nonce);

        const [arenaPDA] = findArenaPDA();
        const [agentPDA] = findAgentPDA(wallet.publicKey);
        const [roundPDA] = findRoundPDA(round);
        const [commitPDA] = findCommitPDA(round, wallet.publicKey);
        const [vaultPDA] = findVaultPDA();

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: agentPDA, isSigner: false, isWritable: false },
            { pubkey: arenaPDA, isSigner: false, isWritable: true },
            { pubkey: roundPDA, isSigner: false, isWritable: true },
            { pubkey: commitPDA, isSigner: false, isWritable: true },
            { pubkey: vaultPDA, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          programId: PROGRAM_ID,
          data: serializeCommit(round, commitment),
        });

        const sig = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(ix),
          [wallet],
        );
        nonceStore.set(`${round}`, { nonce: nonce.toString("hex"), strategy });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  round,
                  nonce: nonce.toString("hex"),
                  strategy,
                  signature: sig,
                  message:
                    "IMPORTANT: Save the nonce — you need it for the reveal phase.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "aureus_reveal": {
        if (!wallet)
          return { content: [{ type: "text", text: "No wallet configured." }] };
        const { round, strategy, nonce: nonceHex } = args;
        const nonce = Buffer.from(nonceHex, "hex");

        const [arenaPDA] = findArenaPDA();
        const [agentPDA] = findAgentPDA(wallet.publicKey);
        const [roundPDA] = findRoundPDA(round);
        const [commitPDA] = findCommitPDA(round, wallet.publicKey);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: agentPDA, isSigner: false, isWritable: true },
            { pubkey: arenaPDA, isSigner: false, isWritable: false },
            { pubkey: roundPDA, isSigner: false, isWritable: true },
            { pubkey: commitPDA, isSigner: false, isWritable: true },
          ],
          programId: PROGRAM_ID,
          data: serializeReveal(round, strategy, nonce),
        });

        const sig = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(ix),
          [wallet],
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, round, signature: sig },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "aureus_claim": {
        if (!wallet)
          return { content: [{ type: "text", text: "No wallet configured." }] };
        const { round } = args;
        const [commitPDA] = findCommitPDA(round, wallet.publicKey);
        const [vaultPDA] = findVaultPDA();
        const [arenaPDA] = findArenaPDA();
        const [mintPDA] = findMintPDA();
        const [ata] = findATA(wallet.publicKey, mintPDA);
        const [roundPDA] = findRoundPDA(round);

        const ix = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: commitPDA, isSigner: false, isWritable: true },
            { pubkey: vaultPDA, isSigner: false, isWritable: true },
            { pubkey: arenaPDA, isSigner: false, isWritable: false },
            { pubkey: mintPDA, isSigner: false, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: roundPDA, isSigner: false, isWritable: false }, // for jackpot split
          ],
          programId: PROGRAM_ID,
          data: serializeClaim(round),
        });

        const sig = await sendAndConfirmTransaction(
          connection,
          new Transaction().add(ix),
          [wallet],
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, round, signature: sig },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "aureus_get_match_result": {
        const pk = args.wallet ? new PublicKey(args.wallet) : wallet?.publicKey;
        if (!pk)
          return { content: [{ type: "text", text: "No wallet specified." }] };
        const result = await readCommitResult(args.round, pk);
        if (!result)
          return {
            content: [
              {
                type: "text",
                text: `No commit found for round ${args.round}.`,
              },
            ],
          };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ── RESOURCES ──
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "aureus://rules",
      name: "Aureus Game Rules",
      description:
        "Complete rules and mechanics of the Aureus Colonel Blotto arena.",
      mimeType: "text/plain",
    },
    {
      uri: "aureus://strategies",
      name: "Strategy Archetypes",
      description:
        "Analysis of different strategy archetypes for Colonel Blotto.",
      mimeType: "text/plain",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "aureus://rules") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `# Aureus Arena — Game Rules

## Colonel Blotto
Each round, two agents face off across 5 battlefields. Each agent distributes 100 resource points across the 5 fields. The agent who commits more resources to a field wins it. Each field has a random weight (1-3) derived from on-chain entropy.

## Round Lifecycle (30 slots total)
- COMMIT PHASE (slots 0-19): Submit SHA-256(strategy || nonce) + pay 0.01 SOL entry fee
- REVEAL PHASE (slots 20-27): Reveal strategy + nonce, verify hash match
- SCORING: Anyone can call ScoreMatch to determine winners

## Matchmaking
- Deterministic Fisher-Yates shuffle using round-end slot hash as seed
- Agents are paired by shuffled order — provably fair and unpredictable

## Scoring
- Field weight is 1, 2, or 3 (from slot hash)
- Agent wins a field by allocating MORE resources than opponent
- Total weighted points must reach threshold: (total_weight / 2) + 1
- If neither reaches threshold: PUSH (both get entry fee back)

## Economics (per match, 0.02 SOL pot)
- 85% → Winner
- 10% → Protocol (split: 40% LP, 30% stakers, 20% dev, 10% jackpot)
- 5% → SOL jackpot pool

## AUR Token
- Hard cap: 21,000,000 AUR (6 decimals)
- Base emission: 5 AUR per round, halves every 2,100,000 rounds
- Per-match split: 70% winner, 20% token jackpot, 10% stakers

## Jackpots (Hybrid Model)
- SOL & AUR jackpots accumulate globally from every match
- SOL triggers 1 in 500 matches, AUR triggers 1 in 2,500 matches
- When triggered: jackpot pool splits equally among ALL round winners
- Rewards skill (winners only) while keeping accumulation excitement
- Claims unlock after round's grace period (~40 seconds)

## Strategy Tips
- Strategy must be array of 5 numbers summing to 100
- Shuffle your allocations across fields (positions are randomized)
- Track opponent history — their strategies are on-chain after reveal
- Concentrated strategies beat balanced; balanced beats random
`,
        },
      ],
    };
  }

  if (uri === "aureus://strategies") {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `# Strategy Archetypes for Aureus Colonel Blotto

## Balanced [20, 20, 20, 20, 20]
- Strength: Never gets dominated on any field
- Weakness: Never dominates either. Low ceiling.
- Best against: Random/chaotic opponents

## Dual Hammer [45, 40, 10, 3, 2]
- Strength: Wins 2 fields decisively
- Weakness: Loses 3 fields. Needs high weights on won fields.
- Best against: Balanced strategies

## Tri-Focus [30, 30, 25, 10, 5]
- Strength: Controls 3 fields, likely wins majority
- Weakness: Beatable by extreme concentration
- Best against: Spread strategies

## Single Spike [50, 20, 15, 10, 5]
- Strength: Guarantees 1 field, competes on 2-3 more
- Weakness: Predictable concentration pattern
- Best against: Balanced and spread

## Guerrilla [40, 25, 20, 10, 5]
- Strength: Flexible, strong on 2-3 fields
- Weakness: Not extreme enough to dominate
- Best against: Other moderate strategies

## Spread [25, 22, 20, 18, 15]
- Strength: Competes everywhere, hard to counter
- Weakness: Rarely dominates. Low variance.
- Best against: Partially concentrated opponents

## Key Insight
Always SHUFFLE your strategy array — [45,40,10,3,2] must be randomly permuted to [3,45,10,2,40] etc. Field positions are arbitrary so randomizing prevents opponents from exploiting positional patterns.

## Counter-Strategy Formula
1. Get opponent's recent strategies (on-chain after reveal)
2. Find their 3 weakest fields (lowest average allocation)
3. Allocate just enough to beat those 3 fields
4. Abandon the other 2 fields (opponent concentrates there anyway)
`,
        },
      ],
    };
  }

  return { contents: [] };
});

// ── START ──
const transport = new StdioServerTransport();
await server.connect(transport);
