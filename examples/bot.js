#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 *  AUREUS — Example Bot (v2 — Background Claiming)
 *  A production-ready bot that plays the Aureus Arena.
 *
 *  Usage:
 *    node bot.js [rounds]
 *
 *  Architecture:
 *    - MAIN LOOP:  commit → reveal → score (non-blocking)
 *    - CLAIM LOOP: claims old rounds in background after grace period
 *    - No idle time — plays continuously while old rounds settle
 *
 *  Features:
 *    - Auto-registration
 *    - Multiple strategy archetypes with random selection
 *    - Adaptive strategy switching based on win rate
 *    - Background claiming (doesn't block main loop)
 *    - Jackpot-aware claiming (round PDA for winner split)
 *    - Graceful error handling with retries
 *
 *  Tips:
 *    - Fund your wallet with at least 0.1 SOL
 *    - The bot will auto-create an AUR token account
 *    - Run multiple instances with different wallets to A/B test
 *    - Claims happen automatically ~40s after each round
 * ═══════════════════════════════════════════════════════════
 */
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIG — Customize these for your setup
// ============================================================
const CONFIG = {
  rpcUrl: process.env.AUREUS_RPC || "https://api.devnet.solana.com",
  walletPath:
    process.env.AUREUS_WALLET ||
    path.join(process.env.HOME, ".config/solana/id.json"),
  programId: new PublicKey("AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn"),
  maxRounds: parseInt(process.argv[2]) || 0, // 0 = infinite
  minWinRate: 40, // Switch strategy when win rate drops below this
  reportEvery: 10, // Performance report interval
  claimDelay: 40_000, // ms to wait before claiming (grace period)
};

const ENTRY_FEE = 10_000_000;
const SLOTS_PER_ROUND = 30;
const COMMIT_SLOTS = 20;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

// ============================================================
// STRATEGY ARCHETYPES
// ============================================================
const ARCHETYPES = [
  { name: "Balanced", gen: () => [20, 20, 20, 20, 20] },
  { name: "NearEqual", gen: () => shuffle([22, 21, 20, 19, 18]) },
  { name: "TriFocus", gen: () => shuffle([30, 30, 25, 10, 5]) },
  { name: "DualHammer", gen: () => shuffle([45, 40, 10, 3, 2]) },
  { name: "SingleSpike", gen: () => shuffle([50, 20, 15, 10, 5]) },
  { name: "Guerrilla", gen: () => shuffle([40, 25, 20, 10, 5]) },
  { name: "Spread", gen: () => shuffle([25, 22, 20, 18, 15]) },
  { name: "AllIn", gen: () => shuffle([60, 20, 10, 5, 5]) },
];

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ============================================================
// PDA HELPERS
// ============================================================
function findArenaPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("arena")],
    CONFIG.programId,
  );
}
function findAgentPDA(pubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), pubkey.toBuffer()],
    CONFIG.programId,
  );
}
function findRoundPDA(round) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    CONFIG.programId,
  );
}
function findCommitPDA(round, pubkey) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commit"), buf, pubkey.toBuffer()],
    CONFIG.programId,
  );
}
function findVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    CONFIG.programId,
  );
}
function findMintPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("aur_mint")],
    CONFIG.programId,
  );
}
function findStakePDA(pubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), pubkey.toBuffer()],
    CONFIG.programId,
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
function serializeCommit(round, commitment, tier = 0) {
  const buf = Buffer.alloc(42);
  buf.writeUInt8(2, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  commitment.copy(buf, 9);
  buf.writeUInt8(tier, 41);
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
// HELPERS
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTx(conn, tx, signers, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await sendAndConfirmTransaction(conn, tx, signers, {
        skipPreflight: false,
        commitment: "confirmed",
      });
    } catch (e) {
      if (i === retries - 1) throw e;
      console.log(`    ⚠ Retry ${i + 1}/${retries}: ${e.message.slice(0, 60)}`);
      await sleep(2000);
    }
  }
}

async function waitForSlot(conn, target) {
  while (true) {
    const current = await conn.getSlot();
    if (current >= target) return current;
    await sleep(Math.min((target - current) * 400, 5000));
  }
}

async function readArena(conn) {
  const [pda] = findArenaPDA();
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  let o = 1 + 32 + 32 + 32;
  return { genesis: Number(d.readBigUInt64LE(o)) };
}

async function readCommitResult(conn, round, pubkey) {
  const [pda] = findCommitPDA(round, pubkey);
  const info = await conn.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  let o = 1 + 32 + 8 + 32;
  o += 1; // revealed
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
  const claimed = d[o];
  o += 1;
  return { strategy, opponent, result, solWon, tokensWon, claimed };
}

// ============================================================
// BACKGROUND CLAIM QUEUE
// ============================================================
/**
 * The claim queue manages deferred claiming:
 * - After each round is played, it's pushed to the queue with a timestamp
 * - A background worker processes claims once the grace period expires
 * - This prevents the main game loop from blocking on claim waits
 */
class ClaimQueue {
  constructor(conn, wallet, accounts) {
    this.conn = conn;
    this.wallet = wallet;
    this.accounts = accounts;
    this.queue = []; // { round, playedAt }
    this.claimed = 0;
    this.failedClaims = 0;
    this.totalSolClaimed = 0;
    this.totalAurClaimed = 0;
  }

  /** Add a round to the claim queue */
  push(round) {
    this.queue.push({ round, playedAt: Date.now() });
  }

  /** Process any rounds that are past the grace period */
  async processReady() {
    const now = Date.now();
    const ready = this.queue.filter(
      (item) => now - item.playedAt >= CONFIG.claimDelay,
    );

    for (const item of ready) {
      try {
        const result = await readCommitResult(
          this.conn,
          item.round,
          this.wallet.publicKey,
        );

        if (!result || result.claimed) {
          // Already claimed or no result — remove from queue
          this.queue = this.queue.filter((q) => q.round !== item.round);
          continue;
        }

        if (result.result === 255) {
          // Not scored yet — leave in queue, try again later
          continue;
        }

        // Build claim instruction with round PDA for jackpot split
        const [commitPDA] = findCommitPDA(item.round, this.wallet.publicKey);
        const [roundPDA] = findRoundPDA(item.round);
        const [agentPDA] = findAgentPDA(this.wallet.publicKey);

        const [vaultFeeAurAta] = findATA(
          this.accounts.vaultPDA,
          this.accounts.mintPDA,
        );
        const claimIx = new TransactionInstruction({
          keys: [
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: commitPDA, isSigner: false, isWritable: true },
            {
              pubkey: this.accounts.vaultPDA,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: this.accounts.arenaPDA,
              isSigner: false,
              isWritable: true,
            },
            {
              pubkey: this.accounts.mintPDA,
              isSigner: false,
              isWritable: true,
            },
            { pubkey: this.accounts.ata, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: roundPDA, isSigner: false, isWritable: false }, // jackpot split
            { pubkey: agentPDA, isSigner: false, isWritable: true }, // jackpot totals
            { pubkey: vaultFeeAurAta, isSigner: false, isWritable: true }, // preminted jackpot AUR
          ],
          programId: CONFIG.programId,
          data: serializeClaim(item.round),
        });

        await sendTx(this.conn, new Transaction().add(claimIx), [this.wallet]);

        const outcome =
          result.result === 1
            ? "WIN 🏆"
            : result.result === 0
              ? "LOSS ❌"
              : "PUSH ⚖️";
        const solStr = (result.solWon / 1e9).toFixed(6);
        const aurStr = (result.tokensWon / 1e6).toFixed(2);
        console.log(
          `   💰 Claimed R${item.round}: ${outcome} | SOL: ${solStr} | AUR: ${aurStr}`,
        );

        this.claimed++;
        this.totalSolClaimed += result.solWon;
        this.totalAurClaimed += result.tokensWon;
        this.queue = this.queue.filter((q) => q.round !== item.round);
      } catch (e) {
        this.failedClaims++;
        console.log(
          `   ⚠ Claim R${item.round} failed: ${e.message.slice(0, 50)}`,
        );
        // Don't remove — will retry next cycle
      }
    }
  }

  get pending() {
    return this.queue.length;
  }
}

// ============================================================
// MAIN BOT
// ============================================================
async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║     ⚔️  AUREUS ARENA — Bot v2 (Background Claim)  ║");
  console.log("╚═══════════════════════════════════════════════════╝");

  // Load wallet
  if (!fs.existsSync(CONFIG.walletPath)) {
    console.error(`❌ Wallet not found: ${CONFIG.walletPath}`);
    console.error(`   Create one: solana-keygen new -o ${CONFIG.walletPath}`);
    process.exit(1);
  }
  const walletData = JSON.parse(fs.readFileSync(CONFIG.walletPath, "utf8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));

  const conn = new Connection(CONFIG.rpcUrl, "confirmed");
  console.log(`Wallet:  ${wallet.publicKey.toBase58()}`);
  console.log(`RPC:     ${CONFIG.rpcUrl}`);
  console.log(`Rounds:  ${CONFIG.maxRounds || "∞"}`);

  const balance = await conn.getBalance(wallet.publicKey);
  console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);

  if (balance < ENTRY_FEE * 2) {
    console.error("❌ Insufficient balance. Need at least 0.02 SOL.");
    process.exit(1);
  }

  // Check arena
  const arena = await readArena(conn);
  if (!arena) {
    console.error("❌ Arena not initialized!");
    process.exit(1);
  }
  const genesis = arena.genesis;
  console.log(`Genesis: slot ${genesis}\n`);

  // Register if needed
  const [agentPDA] = findAgentPDA(wallet.publicKey);
  const agentInfo = await conn.getAccountInfo(agentPDA);
  if (!agentInfo) {
    console.log("📝 Registering agent...");
    const [arenaPDA] = findArenaPDA();
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: agentPDA, isSigner: false, isWritable: true },
        { pubkey: arenaPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: CONFIG.programId,
      data: serializeRegisterAgent(),
    });
    await sendTx(conn, new Transaction().add(ix), [wallet]);
    console.log("   ✅ Registered!\n");
  } else {
    console.log("✅ Agent already registered\n");
  }

  // Ensure ATA exists
  const [mintPDA] = findMintPDA();
  const [ata] = findATA(wallet.publicKey, mintPDA);
  const ataInfo = await conn.getAccountInfo(ata);
  if (!ataInfo) {
    console.log("💳 Creating token account...");
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: mintPDA, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.alloc(0),
    });
    await sendTx(conn, new Transaction().add(ix), [wallet]);
    console.log("   ✅ Token account created!\n");
  }

  // ═══════════════════════════════════════
  // CLAIM QUEUE + GAME LOOP
  // ═══════════════════════════════════════
  const [arenaPDA] = findArenaPDA();
  const [vaultPDA] = findVaultPDA();
  const claimQueue = new ClaimQueue(conn, wallet, {
    arenaPDA,
    vaultPDA,
    mintPDA,
    ata,
  });

  const results = [];
  let currentArchetypeIdx = Math.floor(Math.random() * ARCHETYPES.length);
  let roundsPlayed = 0;

  console.log("🎮 Starting game loop (background claiming enabled)...\n");

  while (CONFIG.maxRounds === 0 || roundsPlayed < CONFIG.maxRounds) {
    try {
      roundsPlayed++;

      // ── Process any pending claims while we wait ──
      await claimQueue.processReady();

      // Wait for next commit phase
      const slot = await conn.getSlot();
      const currentRound =
        slot < genesis ? 0 : Math.floor((slot - genesis) / SLOTS_PER_ROUND);
      const targetRound = currentRound + 1;
      const targetSlot = genesis + targetRound * SLOTS_PER_ROUND;

      process.stdout.write(`⚔️  Round ${targetRound} | Waiting...`);
      await waitForSlot(conn, targetSlot);
      process.stdout.write(" ✅\n");

      // Select strategy (adaptive)
      const archetype = ARCHETYPES[currentArchetypeIdx];
      const strategy = archetype.gen();
      console.log(`   📋 ${archetype.name}: [${strategy.join(",")}]`);

      // COMMIT
      const nonce = crypto.randomBytes(32);
      const commitment = computeCommitment(strategy, nonce);
      const [roundPDA] = findRoundPDA(targetRound);
      const [commitPDA] = findCommitPDA(targetRound, wallet.publicKey);

      const [stakePDA] = findStakePDA(wallet.publicKey);
      const commitIx = new TransactionInstruction({
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
          { pubkey: stakePDA, isSigner: false, isWritable: false },
        ],
        programId: CONFIG.programId,
        data: serializeCommit(targetRound, commitment, 0),
      });

      await sendTx(conn, new Transaction().add(commitIx), [wallet]);
      console.log("   ✅ Committed");

      // Wait for reveal phase
      const revealSlot = genesis + targetRound * SLOTS_PER_ROUND + COMMIT_SLOTS;
      await waitForSlot(conn, revealSlot);

      // REVEAL
      const revealIx = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: agentPDA, isSigner: false, isWritable: true },
          { pubkey: arenaPDA, isSigner: false, isWritable: false },
          { pubkey: roundPDA, isSigner: false, isWritable: true },
          { pubkey: commitPDA, isSigner: false, isWritable: true },
        ],
        programId: CONFIG.programId,
        data: serializeReveal(targetRound, strategy, nonce),
      });

      await sendTx(conn, new Transaction().add(revealIx), [wallet]);
      console.log("   ✅ Revealed");

      // ── Queue for background claiming (don't wait here!) ──
      claimQueue.push(targetRound);
      console.log(`   📥 Queued for claim (${claimQueue.pending} pending)`);

      // Track result for adaptive strategy
      await sleep(3000); // brief wait for scoring
      const result = await readCommitResult(
        conn,
        targetRound,
        wallet.publicKey,
      );
      if (result && result.result !== 255) {
        results.push(result.result);
      }

      // ── Adaptive strategy switching ──
      if (results.length >= 10) {
        const last10 = results.slice(-10);
        const wins = last10.filter((r) => r === 1).length;
        const wr = (wins / last10.length) * 100;

        if (wr < CONFIG.minWinRate) {
          const oldIdx = currentArchetypeIdx;
          currentArchetypeIdx = (currentArchetypeIdx + 1) % ARCHETYPES.length;
          console.log(
            `   📊 Win rate ${wr.toFixed(0)}% — switching ${ARCHETYPES[oldIdx].name} → ${ARCHETYPES[currentArchetypeIdx].name}`,
          );
        }
      }

      // ── Performance report ──
      if (roundsPlayed % CONFIG.reportEvery === 0) {
        const w = results.filter((r) => r === 1).length;
        const l = results.filter((r) => r === 0).length;
        const p = results.filter((r) => r === 2).length;
        const bal = await conn.getBalance(wallet.publicKey);
        console.log(
          `\n   📊 Report (${roundsPlayed} rounds): ${w}W ${l}L ${p}P | WR: ${results.length > 0 ? ((w / results.length) * 100).toFixed(0) : 0}% | Balance: ${(bal / 1e9).toFixed(4)} SOL`,
        );
        console.log(
          `   💰 Claims: ${claimQueue.claimed} done, ${claimQueue.pending} pending | SOL: ${(claimQueue.totalSolClaimed / 1e9).toFixed(4)} | AUR: ${(claimQueue.totalAurClaimed / 1e6).toFixed(2)}\n`,
        );
      }
    } catch (e) {
      console.error(`   ❌ Error: ${e.message.slice(0, 80)}`);
      await sleep(5000);
    }
  }

  // ── Drain remaining claims ──
  console.log("\n⏳ Draining claim queue...");
  await sleep(CONFIG.claimDelay);
  await claimQueue.processReady();

  // Final summary
  const w = results.filter((r) => r === 1).length;
  const l = results.filter((r) => r === 0).length;
  const p = results.filter((r) => r === 2).length;
  const finalBal = await conn.getBalance(wallet.publicKey);
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║     📊 FINAL RESULTS                              ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log(`  Rounds:  ${roundsPlayed}`);
  console.log(`  Record:  ${w}W ${l}L ${p}P`);
  console.log(
    `  Win Rate: ${results.length > 0 ? ((w / results.length) * 100).toFixed(1) : 0}%`,
  );
  console.log(`  Balance: ${(finalBal / 1e9).toFixed(4)} SOL`);
  console.log(
    `  Claims:  ${claimQueue.claimed} (${claimQueue.failedClaims} failed)`,
  );
  console.log(
    `  SOL Won: ${(claimQueue.totalSolClaimed / 1e9).toFixed(4)} SOL`,
  );
  console.log(
    `  AUR Won: ${(claimQueue.totalAurClaimed / 1e6).toFixed(2)} AUR`,
  );
  console.log("\n✅ Bot finished.");
}

main().catch((err) => {
  console.error("\n❌ FATAL:", err.message);
  if (err.logs) err.logs.forEach((l) => console.error("  ", l));
  process.exit(1);
});
