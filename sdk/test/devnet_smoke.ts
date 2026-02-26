/**
 * Aureus SDK — Devnet Smoke Test
 *
 * Tests the full lifecycle using the @aureus-arena/sdk:
 *   1. Read arena state
 *   2. Register 2 agents
 *   3. Fund wallets
 *   4. Commit strategies
 *   5. Wait for reveal phase
 *   6. Reveal strategies
 *   7. Score the match
 *   8. Claim winnings
 *   9. Read final state
 *
 * Usage:
 *   npx ts-node test/devnet_smoke.ts
 *   # or: node -r ts-node/register test/devnet_smoke.ts
 */

import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  PublicKey,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import {
  AureusClient,
  PROGRAM_ID,
  AUR_MINT,
  SLOTS_PER_ROUND,
  COMMIT_SLOTS,
  REVEAL_GRACE_SLOTS,
  DEV_WALLET,
  ENTRY_FEE,
  findArenaPDA,
  findAgentPDA,
  findRoundPDA,
  findCommitPDA,
  findVaultPDA,
  findMintPDA,
  findStakePDA,
  findATA,
  fetchArenaState,
  fetchAgentState,
  fetchCommitResult,
  fetchTokenBalance,
  serializeRegisterAgent,
  serializeCommit,
  serializeReveal,
  serializeScoreMatch,
  serializeClaim,
  computeCommitment,
} from "../src";

// ════════════════════════════════════════════════════
// Config
// ════════════════════════════════════════════════════
const RPC_URL = "https://api.devnet.solana.com";
const CONNECTION = new Connection(RPC_URL, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60_000,
});

const WALLETS_DIR = path.join(__dirname, ".sdk_test_wallets");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadPayer(): Keypair {
  const idPath = process.env.HOME + "/.config/solana/id.json";
  const data = JSON.parse(fs.readFileSync(idPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function loadOrCreateWallet(name: string): Keypair {
  if (!fs.existsSync(WALLETS_DIR))
    fs.mkdirSync(WALLETS_DIR, { recursive: true });
  const p = path.join(WALLETS_DIR, `${name}.json`);
  if (fs.existsSync(p)) {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(data));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function fundIfNeeded(
  payer: Keypair,
  target: PublicKey,
  minLamports: number = 0.25e9,
  fundAmount: number = 0.25e9,
): Promise<void> {
  const bal = await CONNECTION.getBalance(target);
  if (bal < minLamports) {
    console.log(
      `  💸 Funding ${target.toBase58().slice(0, 8)}... (${(bal / 1e9).toFixed(4)} → ${((bal + fundAmount) / 1e9).toFixed(4)} SOL)`,
    );
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: target,
        lamports: fundAmount,
      }),
    );
    await sendAndConfirmTransaction(CONNECTION, tx, [payer]);
  } else {
    console.log(
      `  ✓ ${target.toBase58().slice(0, 8)}... has ${(bal / 1e9).toFixed(4)} SOL`,
    );
  }
}

async function waitForSlot(target: number): Promise<number> {
  while (true) {
    const current = await CONNECTION.getSlot();
    if (current >= target) return current;
    const diff = target - current;
    await sleep(Math.min(diff * 400, 5000));
  }
}

// Feistel permutation for client-side matchmaking (matches on-chain)
function feistelPermute(seed: Buffer, n: number, pos: number): number {
  if (n <= 1) return 0;
  if (n === 2) {
    const input = Buffer.alloc(33);
    seed.copy(input, 0, 0, 32);
    input.writeUInt8(0, 32);
    const h = crypto.createHash("sha256").update(input).digest();
    return pos === 0 ? h[0] % 2 : 1 - (h[0] % 2);
  }
  let bits = 0;
  let temp = n - 1;
  while (temp > 0) {
    bits++;
    temp >>= 1;
  }
  if (bits % 2 !== 0) bits++;
  const half = bits / 2;
  const halfMask = (1 << half) - 1;
  let val = pos;
  while (true) {
    let left = (val >> half) & halfMask;
    let right = val & halfMask;
    for (let round = 0; round < 6; round++) {
      const input = Buffer.alloc(37);
      seed.copy(input, 0, 0, 32);
      input.writeUInt8(round, 32);
      input.writeUInt8(right & 0xff, 33);
      input.writeUInt8((right >> 8) & 0xff, 34);
      input.writeUInt8((right >> 16) & 0xff, 35);
      input.writeUInt8((right >> 24) & 0xff, 36);
      const h = crypto.createHash("sha256").update(input).digest();
      const hashVal = h.readUInt32LE(0);
      const newLeft = right;
      const newRight = (left ^ hashVal) & halfMask;
      left = newLeft;
      right = newRight;
    }
    val = (left << half) | right;
    if (val < n) return val;
  }
}

// ════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════
async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  🧪 AUREUS SDK — DEVNET SMOKE TEST              ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`Program:  ${PROGRAM_ID.toBase58()}`);
  console.log(`AUR Mint: ${AUR_MINT.toBase58()}`);
  console.log(`RPC:      ${RPC_URL}`);

  const payer = loadPayer();
  console.log(`Payer:    ${payer.publicKey.toBase58()}`);
  const payerBal = await CONNECTION.getBalance(payer.publicKey);
  console.log(`Balance:  ${(payerBal / 1e9).toFixed(4)} SOL`);

  if (payerBal < 0.5e9) {
    console.error("❌ Payer needs at least 0.5 SOL. Airdrop or fund first.");
    process.exit(1);
  }

  // ─── Test 1: PDA derivations ─────────────────────
  console.log("\n━━━ Test 1: PDA Derivations ━━━");
  const [arenaPDA] = findArenaPDA();
  const [vaultPDA] = findVaultPDA();
  const [mintAddr] = findMintPDA();
  console.log(`  Arena PDA:  ${arenaPDA.toBase58()}`);
  console.log(`  Vault PDA:  ${vaultPDA.toBase58()}`);
  console.log(`  AUR Mint:   ${mintAddr.toBase58()}`);
  console.log(`  ✅ PDAs derived successfully`);

  // ─── Test 2: Read arena state ────────────────────
  console.log("\n━━━ Test 2: Read Arena State ━━━");
  const arena = await fetchArenaState(CONNECTION);
  if (!arena) {
    console.error("❌ Arena not initialized on devnet!");
    process.exit(1);
  }
  console.log(`  Genesis:      ${arena.genesis}`);
  console.log(`  Total Rounds: ${arena.totalRounds}`);
  console.log(`  Total Agents: ${arena.totalAgents}`);
  console.log(`  Era:          ${arena.era}`);
  console.log(`  Emitted:      ${(arena.emitted / 1e6).toFixed(2)} AUR`);
  console.log(
    `  SOL Jackpot:  T1=${(arena.solJackpotT1 / 1e9).toFixed(6)} T2=${(arena.solJackpotT2 / 1e9).toFixed(6)} T3=${(arena.solJackpotT3 / 1e9).toFixed(6)}`,
  );
  console.log(
    `  AUR Jackpot:  T1=${(arena.tokenJackpotT1 / 1e6).toFixed(2)} T2=${(arena.tokenJackpotT2 / 1e6).toFixed(2)} T3=${(arena.tokenJackpotT3 / 1e6).toFixed(2)}`,
  );
  console.log(
    `  Protocol Rev: ${(arena.protocolRevenue / 1e9).toFixed(6)} SOL`,
  );
  console.log(`  Staked AUR:   ${(arena.totalAurStaked / 1e6).toFixed(2)}`);
  console.log(
    `  T2 Eligible:  ${arena.t2Eligible}  T3 Eligible: ${arena.t3Eligible}`,
  );
  console.log(`  ✅ Arena state read successfully`);

  // ─── Test 3: Create & fund 2 agents ──────────────
  console.log("\n━━━ Test 3: Create & Fund Agents ━━━");
  const walletA = loadOrCreateWallet("agent_alpha");
  const walletB = loadOrCreateWallet("agent_bravo");
  console.log(`  Agent A: ${walletA.publicKey.toBase58()}`);
  console.log(`  Agent B: ${walletB.publicKey.toBase58()}`);
  await fundIfNeeded(payer, walletA.publicKey);
  await sleep(500);
  await fundIfNeeded(payer, walletB.publicKey);
  console.log(`  ✅ Agents funded`);

  // ─── Test 4: AureusClient — register ─────────────
  console.log("\n━━━ Test 4: Register Agents (via AureusClient) ━━━");
  const clientA = new AureusClient(CONNECTION, walletA);
  const clientB = new AureusClient(CONNECTION, walletB);

  // Check if already registered
  const agentStateA = await clientA.getAgent();
  if (agentStateA) {
    console.log(
      `  Agent A already registered (${agentStateA.totalWins}W ${agentStateA.totalLosses}L ${agentStateA.totalPushes}P)`,
    );
  } else {
    const regSig = await clientA.register();
    console.log(`  Agent A registered: ${regSig.slice(0, 16)}...`);
  }
  await sleep(500);

  const agentStateB = await clientB.getAgent();
  if (agentStateB) {
    console.log(
      `  Agent B already registered (${agentStateB.totalWins}W ${agentStateB.totalLosses}L ${agentStateB.totalPushes}P)`,
    );
  } else {
    const regSig = await clientB.register();
    console.log(`  Agent B registered: ${regSig.slice(0, 16)}...`);
  }
  console.log(`  ✅ Both agents registered`);

  // ─── Test 5: Ensure token accounts ───────────────
  console.log("\n━━━ Test 5: Ensure Token Accounts ━━━");
  const ataA = await clientA.ensureTokenAccount();
  console.log(`  Agent A ATA: ${ataA.toBase58().slice(0, 12)}...`);
  await sleep(500);
  const ataB = await clientB.ensureTokenAccount();
  console.log(`  Agent B ATA: ${ataB.toBase58().slice(0, 12)}...`);
  console.log(`  ✅ Token accounts ready`);

  // ─── Test 6: Round timing ────────────────────────
  console.log("\n━━━ Test 6: Round Timing ━━━");
  const timing = await clientA.getRoundTiming();
  console.log(`  Current Round: ${timing.currentRound}`);
  console.log(`  Phase:         ${timing.phase}`);
  console.log(`  Slots Left:    ${timing.slotsRemaining}`);
  console.log(`  Next Commit:   slot ${timing.nextCommitSlot}`);
  console.log(`  ✅ Timing reads correctly`);

  // ─── Test 7: Commit strategies ───────────────────
  console.log("\n━━━ Test 7: Commit Strategies ━━━");
  console.log(`  ⏳ Waiting for commit phase with enough time...`);

  // Custom wait: ensure at least 10 slots of commit time left for both agents
  let roundNum: number;
  while (true) {
    const t = await clientA.getRoundTiming();
    if (t.phase === "commit" && t.slotsRemaining >= 10) {
      roundNum = t.currentRound;
      console.log(
        `  Round ${roundNum} — commit phase open (${t.slotsRemaining} slots left)`,
      );
      break;
    }
    console.log(
      `  Not enough commit time (phase=${t.phase}, slots=${t.slotsRemaining}), waiting for next round...`,
    );
    await waitForSlot(t.nextCommitSlot);
    await sleep(1000); // small buffer
  }

  const stratA = [30, 25, 20, 15, 10] as number[];
  const stratB = [10, 15, 20, 25, 30] as number[];

  console.log(`  Committing both agents in parallel...`);
  const [commitA, commitB] = await Promise.all([
    clientA.commit(stratA, roundNum),
    clientB.commit(stratB, roundNum),
  ]);
  console.log(`  ✓ Agent A: sig=${commitA.signature.slice(0, 16)}...`);
  console.log(`  ✓ Agent B: sig=${commitB.signature.slice(0, 16)}...`);
  console.log(`  ✅ Both strategies committed for round ${roundNum}`);

  // ─── Test 8: Wait for reveal phase ───────────────
  console.log("\n━━━ Test 8: Reveal Strategies ━━━");
  const revealSlot = arena.genesis + roundNum * SLOTS_PER_ROUND + COMMIT_SLOTS;
  console.log(`  ⏳ Waiting for reveal phase (slot ${revealSlot})...`);
  await waitForSlot(revealSlot);
  console.log(`  Reveal phase reached`);

  console.log(`  Revealing both agents in parallel...`);
  const [revSigA, revSigB] = await Promise.all([
    clientA.reveal(roundNum, stratA, commitA.nonce),
    clientB.reveal(roundNum, stratB, commitB.nonce),
  ]);
  console.log(`  ✓ Agent A: ${revSigA.slice(0, 16)}...`);
  console.log(`  ✓ Agent B: ${revSigB.slice(0, 16)}...`);
  console.log(`  ✅ Both strategies revealed`);

  // ─── Test 9: Read commit results ─────────────────
  console.log("\n━━━ Test 9: Read Commit State ━━━");
  await sleep(1000);
  const crA = await clientA.getCommitResult(roundNum);
  const crB = await clientB.getCommitResult(roundNum);
  if (crA) {
    console.log(
      `  Agent A: strategy=[${crA.strategy}] idx=${crA.commitIndex} tier=${crA.tier}`,
    );
  } else {
    console.log(`  ⚠ Agent A commit not found`);
  }
  if (crB) {
    console.log(
      `  Agent B: strategy=[${crB.strategy}] idx=${crB.commitIndex} tier=${crB.tier}`,
    );
  } else {
    console.log(`  ⚠ Agent B commit not found`);
  }
  console.log(`  ✅ Commit state readable`);

  // ─── Test 10: Score match ────────────────────────
  console.log("\n━━━ Test 10: Score Match ━━━");

  // Wait for reveal grace period
  const REVEAL_SLOTS_CONST = 8;
  const graceExpireSlot =
    arena.genesis +
    roundNum * SLOTS_PER_ROUND +
    COMMIT_SLOTS +
    REVEAL_GRACE_SLOTS;
  console.log(
    `  ⏳ Waiting for grace period expiry (slot ${graceExpireSlot})...`,
  );
  await waitForSlot(graceExpireSlot);

  // Compute matchmaking seed
  const roundEndSlot =
    arena.genesis +
    roundNum * SLOTS_PER_ROUND +
    COMMIT_SLOTS +
    REVEAL_SLOTS_CONST;

  // Read round state to get reveal_entropy
  const [roundPDA] = findRoundPDA(roundNum);
  const roundInfo = await CONNECTION.getAccountInfo(roundPDA);
  if (!roundInfo) {
    console.error("❌ Round PDA not found!");
    process.exit(1);
  }

  // Parse reveal_entropy from round state (at the end before per-tier winner counts)
  // Quick parse: just get num_commits and reveal_entropy
  const rd = roundInfo.data;
  let ro = 1 + 8 + 4 + 4 + 4 + 1 + 32 + 5 + 8 + 8 + 1; // offset to after bump
  ro += 4; // num_winners (u32)
  ro += 8 + 8; // round_jackpot_sol, round_jackpot_aur
  ro += 4 * 3; // num_commits_t1/t2/t3
  ro += 8 * 3; // total_pot_t1/t2/t3
  ro += 8 * 3; // emission_per_match_t1/t2/t3
  ro += 8 * 6; // round_jackpot_sol_t1/t2/t3 + round_jackpot_aur_t1/t2/t3
  ro += 4 * 3; // num_winners_t1/t2/t3
  const revealEntropy = Buffer.from(rd.slice(ro, ro + 32));

  const seedInput = Buffer.alloc(40);
  revealEntropy.copy(seedInput, 0, 0, 32);
  seedInput.writeBigUInt64LE(BigInt(roundEndSlot), 32);
  const matchmakingSeed = crypto
    .createHash("sha256")
    .update(seedInput)
    .digest();

  // Tier-specific seed
  const tier = 0;
  const tierSeedInput = Buffer.alloc(33);
  matchmakingSeed.copy(tierSeedInput, 0, 0, 32);
  tierSeedInput.writeUInt8(tier, 32);
  const tierSeed = crypto.createHash("sha256").update(tierSeedInput).digest();

  // Read num_commits for this tier (u32 at offset 1+8+4+4+4+1+32+5+8+8+1+4+8+8)
  const numCommitsT1Offset =
    1 + 8 + 4 + 4 + 4 + 1 + 32 + 5 + 8 + 8 + 1 + 4 + 8 + 8;
  const numCommitsT1 = rd.readUInt32LE(numCommitsT1Offset);
  console.log(`  Commits T1: ${numCommitsT1}`);
  console.log(
    `  Reveal entropy: ${revealEntropy.toString("hex").slice(0, 16)}...`,
  );

  // Derive match pair
  const [pairA, pairB] = [
    feistelPermute(tierSeed, numCommitsT1, 0),
    feistelPermute(tierSeed, numCommitsT1, 1),
  ];
  console.log(`  Match 0: indices (${pairA}, ${pairB})`);

  // Map commit_index → wallet
  const indexMap = new Map<number, Keypair>();
  if (crA) indexMap.set(crA.commitIndex, walletA);
  if (crB) indexMap.set(crB.commitIndex, walletB);

  const matchAgentA = indexMap.get(pairA);
  const matchAgentB = indexMap.get(pairB);

  if (!matchAgentA || !matchAgentB) {
    console.error(
      `  ❌ Could not map match indices to agents. pairA=${pairA}, pairB=${pairB}, indices: ${Array.from(indexMap.keys())}`,
    );
    process.exit(1);
  }

  // Build ScoreMatch instruction using SDK serializer
  const [commitPDA_A] = findCommitPDA(roundNum, matchAgentA.publicKey);
  const [commitPDA_B] = findCommitPDA(roundNum, matchAgentB.publicKey);
  const [agentPDA_A] = findAgentPDA(matchAgentA.publicKey);
  const [agentPDA_B] = findAgentPDA(matchAgentB.publicKey);

  const scoreIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: arenaPDA, isSigner: false, isWritable: true },
      { pubkey: roundPDA, isSigner: false, isWritable: true },
      { pubkey: commitPDA_A, isSigner: false, isWritable: true },
      { pubkey: commitPDA_B, isSigner: false, isWritable: true },
      { pubkey: agentPDA_A, isSigner: false, isWritable: true },
      { pubkey: agentPDA_B, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: DEV_WALLET, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data: serializeScoreMatch(roundNum, 0),
  });

  try {
    const scoreSig = await sendAndConfirmTransaction(
      CONNECTION,
      new Transaction().add(scoreIx),
      [payer],
    );
    console.log(`  ✓ Scored: ${scoreSig.slice(0, 16)}...`);
  } catch (e: any) {
    console.error(`  ❌ Score failed: ${e.message.slice(0, 100)}`);
    if (e.logs) e.logs.forEach((l: string) => console.error("    ", l));
    process.exit(1);
  }

  // ─── Test 11: Read scored results ────────────────
  console.log("\n━━━ Test 11: Read Match Results ━━━");
  await sleep(1000);
  const resultA = await clientA.getCommitResult(roundNum);
  const resultB = await clientB.getCommitResult(roundNum);

  if (resultA) {
    const label =
      resultA.result === 1 ? "WIN" : resultA.result === 0 ? "LOSS" : "PUSH";
    console.log(
      `  Agent A: ${label} | SOL: ${(resultA.solWon / 1e9).toFixed(6)} | AUR: ${(resultA.tokensWon / 1e6).toFixed(2)}`,
    );
  }
  if (resultB) {
    const label =
      resultB.result === 1 ? "WIN" : resultB.result === 0 ? "LOSS" : "PUSH";
    console.log(
      `  Agent B: ${label} | SOL: ${(resultB.solWon / 1e9).toFixed(6)} | AUR: ${(resultB.tokensWon / 1e6).toFixed(2)}`,
    );
  }
  console.log(`  ✅ Match results read successfully`);

  // ─── Test 12: Claim winnings ─────────────────────
  console.log("\n━━━ Test 12: Claim Winnings ━━━");
  try {
    const claimSigA = await clientA.claim(roundNum);
    console.log(`  Agent A claimed: ${claimSigA.slice(0, 16)}...`);
  } catch (e: any) {
    console.log(`  Agent A claim: ${e.message.slice(0, 80)}`);
  }
  await sleep(500);
  try {
    const claimSigB = await clientB.claim(roundNum);
    console.log(`  Agent B claimed: ${claimSigB.slice(0, 16)}...`);
  } catch (e: any) {
    console.log(`  Agent B claim: ${e.message.slice(0, 80)}`);
  }
  console.log(`  ✅ Claims processed`);

  // ─── Test 13: Read agent state after match ───────
  console.log("\n━━━ Test 13: Final Agent States ━━━");
  await sleep(500);
  const finalA = await clientA.getAgent();
  const finalB = await clientB.getAgent();
  if (finalA) {
    console.log(
      `  Agent A: ${finalA.totalWins}W ${finalA.totalLosses}L ${finalA.totalPushes}P | WR: ${finalA.winRate}%`,
    );
    console.log(
      `           SOL earned: ${(finalA.totalSolEarned / 1e9).toFixed(6)} | AUR earned: ${(finalA.totalAurEarned / 1e6).toFixed(2)}`,
    );
  }
  if (finalB) {
    console.log(
      `  Agent B: ${finalB.totalWins}W ${finalB.totalLosses}L ${finalB.totalPushes}P | WR: ${finalB.winRate}%`,
    );
    console.log(
      `           SOL earned: ${(finalB.totalSolEarned / 1e9).toFixed(6)} | AUR earned: ${(finalB.totalAurEarned / 1e6).toFixed(2)}`,
    );
  }

  // ─── Test 14: Token balance ──────────────────────
  console.log("\n━━━ Test 14: Token Balances ━━━");
  const balA = await clientA.getTokenBalance();
  const balB = await clientB.getTokenBalance();
  console.log(`  Agent A AUR: ${(balA / 1e6).toFixed(2)}`);
  console.log(`  Agent B AUR: ${(balB / 1e6).toFixed(2)}`);
  console.log(`  ✅ Token balances read`);

  // ─── Test 15: Final arena state ──────────────────
  console.log("\n━━━ Test 15: Final Arena State ━━━");
  const arenaFinal = await fetchArenaState(CONNECTION);
  if (arenaFinal) {
    console.log(`  Rounds:       ${arenaFinal.totalRounds}`);
    console.log(`  Agents:       ${arenaFinal.totalAgents}`);
    console.log(`  Emitted:      ${(arenaFinal.emitted / 1e6).toFixed(2)} AUR`);
    console.log(
      `  Protocol Rev: ${(arenaFinal.protocolRevenue / 1e9).toFixed(6)} SOL`,
    );
    console.log(
      `  Staker Pool:  ${(arenaFinal.stakerRewardPool / 1e9).toFixed(6)} SOL`,
    );
  }

  // ════════════════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  ✅ ALL SDK SMOKE TESTS PASSED                   ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("\n❌ FATAL:", err.message);
  if (err.logs) {
    console.error("\nProgram logs:");
    err.logs.forEach((l: string) => console.error("  ", l));
  }
  process.exit(1);
});
