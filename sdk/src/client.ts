import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { randomBytes } from "crypto";
import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SLOTS_PER_ROUND,
  COMMIT_SLOTS,
} from "./constants";
import {
  findArenaPDA,
  findAgentPDA,
  findRoundPDA,
  findCommitPDA,
  findVaultPDA,
  findMintPDA,
  findStakePDA,
  findATA,
} from "./pda";
import {
  serializeRegisterAgent,
  serializeCommit,
  serializeReveal,
  serializeClaim,
  serializeStakeAUR,
  serializeUnstakeAUR,
  serializeClaimStakeRewards,
  computeCommitment,
} from "./instructions";
import {
  fetchArenaState,
  fetchAgentState,
  fetchCommitResult,
  fetchTokenBalance,
  ArenaState,
  AgentState,
  CommitResult,
} from "./state";

export interface RoundTiming {
  currentRound: number;
  phase: "commit" | "reveal" | "scoring";
  slotsRemaining: number;
  nextCommitSlot: number;
}

/**
 * High-level client for interacting with the Aureus on-chain arena.
 *
 * @example
 * ```ts
 * import { AureusClient } from "@aureus-arena/sdk";
 * import { Keypair, Connection } from "@solana/web3.js";
 *
 * const conn = new Connection("http://localhost:8899");
 * const wallet = Keypair.generate();
 * const client = new AureusClient(conn, wallet);
 *
 * await client.register();
 * const { round, nonce } = await client.commit([30, 20, 15, 25, 10]);
 * await client.reveal(round, [30, 20, 15, 25, 10], nonce);
 * await client.claim(round);
 * ```
 */
export class AureusClient {
  connection: Connection;
  wallet: Keypair;

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
  }

  // ═══════════════════════════════════════════════════
  // Account Addresses
  // ═══════════════════════════════════════════════════

  get arenaPDA(): PublicKey {
    return findArenaPDA()[0];
  }
  get agentPDA(): PublicKey {
    return findAgentPDA(this.wallet.publicKey)[0];
  }
  get vaultPDA(): PublicKey {
    return findVaultPDA()[0];
  }
  get mintPDA(): PublicKey {
    return findMintPDA()[0];
  }
  get tokenAccount(): PublicKey {
    return findATA(this.wallet.publicKey, this.mintPDA)[0];
  }

  // ═══════════════════════════════════════════════════
  // Round Timing
  // ═══════════════════════════════════════════════════

  /** Get current round info and timing */
  async getRoundTiming(): Promise<RoundTiming> {
    const arena = await fetchArenaState(this.connection);
    if (!arena) throw new Error("Arena not initialized");
    const slot = await this.connection.getSlot();
    const elapsed = Math.max(0, slot - arena.genesis);
    const currentRound = Math.floor(elapsed / SLOTS_PER_ROUND);
    const slotInRound = elapsed % SLOTS_PER_ROUND;

    let phase: "commit" | "reveal" | "scoring";
    let slotsRemaining: number;
    if (slotInRound < COMMIT_SLOTS) {
      phase = "commit";
      slotsRemaining = COMMIT_SLOTS - slotInRound;
    } else {
      phase = "reveal";
      slotsRemaining = SLOTS_PER_ROUND - slotInRound;
    }

    const nextCommitSlot = arena.genesis + (currentRound + 1) * SLOTS_PER_ROUND;

    return { currentRound, phase, slotsRemaining, nextCommitSlot };
  }

  /** Wait for the next commit phase, returns round number */
  async waitForCommitPhase(): Promise<number> {
    const timing = await this.getRoundTiming();
    if (timing.phase === "commit" && timing.slotsRemaining > 2) {
      return timing.currentRound;
    }
    // Wait for next round
    let slot = await this.connection.getSlot();
    while (slot < timing.nextCommitSlot) {
      await new Promise((r) => setTimeout(r, 400));
      slot = await this.connection.getSlot();
    }
    return timing.currentRound + 1;
  }

  // ═══════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════

  /** Register this wallet as an agent. Idempotent — succeeds if already registered. */
  async register(): Promise<string> {
    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.agentPDA, isSigner: false, isWritable: true },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: serializeRegisterAgent(),
    });
    return sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
  }

  /**
   * Commit a strategy for the given round.
   * Strategy is [f1, f2, f3, f4, f5] where each is 0-100 and sum = 100.
   * Returns the nonce (save this — you need it for reveal).
   */
  async commit(
    strategy: number[],
    round?: number,
    tier: number = 0,
  ): Promise<{ round: number; nonce: Buffer; signature: string }> {
    if (!round) {
      round = await this.waitForCommitPhase();
    }
    const nonce = randomBytes(32);
    const commitment = computeCommitment(strategy, nonce);

    const [roundPDA] = findRoundPDA(round);
    const [commitPDA] = findCommitPDA(round, this.wallet.publicKey);
    const [stakePDA] = findStakePDA(this.wallet.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.agentPDA, isSigner: false, isWritable: false },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
        { pubkey: roundPDA, isSigner: false, isWritable: true },
        { pubkey: commitPDA, isSigner: false, isWritable: true },
        { pubkey: this.vaultPDA, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: stakePDA, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: serializeCommit(round, commitment, tier),
    });

    const signature = await sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
    return { round, nonce, signature };
  }

  /** Reveal a previously committed strategy */
  async reveal(
    round: number,
    strategy: number[],
    nonce: Buffer,
  ): Promise<string> {
    const [roundPDA] = findRoundPDA(round);
    const [commitPDA] = findCommitPDA(round, this.wallet.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: this.agentPDA, isSigner: false, isWritable: true },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: false },
        { pubkey: roundPDA, isSigner: false, isWritable: true },
        { pubkey: commitPDA, isSigner: false, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: serializeReveal(round, strategy, nonce),
    });

    return sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
  }

  /** Claim SOL winnings + mint AUR tokens for a scored round.
   *  Must be called after the round's grace period expires (~40s). */
  async claim(round: number): Promise<string> {
    const [commitPDA] = findCommitPDA(round, this.wallet.publicKey);
    const [roundPDA] = findRoundPDA(round);

    // Ensure ATA exists
    await this.ensureTokenAccount();

    // Vault's AUR fee ATA — for transferring preminted jackpot AUR from swap fees
    const [vaultFeeAurAta] = findATA(this.vaultPDA, this.mintPDA);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: commitPDA, isSigner: false, isWritable: true },
        { pubkey: this.vaultPDA, isSigner: false, isWritable: true },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
        { pubkey: this.mintPDA, isSigner: false, isWritable: true },
        { pubkey: this.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: roundPDA, isSigner: false, isWritable: false }, // for jackpot split calc
        { pubkey: this.agentPDA, isSigner: false, isWritable: true }, // for jackpot totals
        { pubkey: vaultFeeAurAta, isSigner: false, isWritable: true }, // preminted jackpot AUR
      ],
      programId: PROGRAM_ID,
      data: serializeClaim(round),
    });

    return sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
  }

  /** Create ATA if it doesn't exist */
  async ensureTokenAccount(): Promise<PublicKey> {
    const ata = this.tokenAccount;
    const info = await this.connection.getAccountInfo(ata);
    if (!info) {
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: this.wallet.publicKey, isSigner: false, isWritable: false },
          { pubkey: this.mintPDA, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.alloc(0),
      });
      await sendAndConfirmTransaction(
        this.connection,
        new Transaction().add(ix),
        [this.wallet],
      );
    }
    return ata;
  }

  // ═══════════════════════════════════════════════════
  // State Readers
  // ═══════════════════════════════════════════════════

  async getArena(): Promise<ArenaState | null> {
    return fetchArenaState(this.connection);
  }

  async getAgent(wallet?: PublicKey): Promise<AgentState | null> {
    return fetchAgentState(this.connection, wallet || this.wallet.publicKey);
  }

  async getCommitResult(
    round: number,
    wallet?: PublicKey,
  ): Promise<CommitResult | null> {
    return fetchCommitResult(
      this.connection,
      round,
      wallet || this.wallet.publicKey,
    );
  }

  async getTokenBalance(wallet?: PublicKey): Promise<number> {
    return fetchTokenBalance(this.connection, wallet || this.wallet.publicKey);
  }

  // ═══════════════════════════════════════════════════
  // Staking
  // ═══════════════════════════════════════════════════

  /** Stake AUR tokens. Amount is in raw token units (1 AUR = 1_000_000). */
  async stake(amount: number): Promise<string> {
    await this.ensureTokenAccount();

    const [stakePDA] = findStakePDA(this.wallet.publicKey);
    const [vaultATA] = findATA(this.arenaPDA, this.mintPDA);

    // Create vault ATA if needed
    const tx = new Transaction();
    const vaultInfo = await this.connection.getAccountInfo(vaultATA);
    if (!vaultInfo) {
      tx.add(
        new TransactionInstruction({
          keys: [
            { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultATA, isSigner: false, isWritable: true },
            { pubkey: this.arenaPDA, isSigner: false, isWritable: false },
            { pubkey: this.mintPDA, isSigner: false, isWritable: false },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          data: Buffer.alloc(0),
        }),
      );
    }

    tx.add(
      new TransactionInstruction({
        keys: [
          { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: stakePDA, isSigner: false, isWritable: true },
          { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
          { pubkey: this.tokenAccount, isSigner: false, isWritable: true },
          { pubkey: vaultATA, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        programId: PROGRAM_ID,
        data: serializeStakeAUR(amount),
      }),
    );

    return sendAndConfirmTransaction(this.connection, tx, [this.wallet]);
  }

  /** Unstake AUR tokens. Amount is in raw token units (1 AUR = 1_000_000). */
  async unstake(amount: number): Promise<string> {
    const [stakePDA] = findStakePDA(this.wallet.publicKey);
    const [vaultATA] = findATA(this.arenaPDA, this.mintPDA);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: stakePDA, isSigner: false, isWritable: true },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
        { pubkey: this.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultATA, isSigner: false, isWritable: true },
        { pubkey: this.vaultPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: serializeUnstakeAUR(amount),
    });

    return sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
  }

  /** Claim accumulated SOL staking rewards. */
  async claimStakeRewards(): Promise<string> {
    const [stakePDA] = findStakePDA(this.wallet.publicKey);

    const ix = new TransactionInstruction({
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: stakePDA, isSigner: false, isWritable: true },
        { pubkey: this.arenaPDA, isSigner: false, isWritable: true },
        { pubkey: this.vaultPDA, isSigner: false, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: serializeClaimStakeRewards(),
    });

    return sendAndConfirmTransaction(
      this.connection,
      new Transaction().add(ix),
      [this.wallet],
    );
  }

  /** Read stake state for a wallet. Returns null if not staked. */
  async getStakeState(wallet?: PublicKey): Promise<{
    aurStaked: number;
    pendingRewards: number;
    stakedAt: number;
  } | null> {
    const key = wallet || this.wallet.publicKey;
    const [stakePDA] = findStakePDA(key);
    const info = await this.connection.getAccountInfo(stakePDA);
    if (!info || info.data.length < 74 || info.data[0] !== 1) return null;
    const d = info.data;
    return {
      aurStaked: Number(d.readBigUInt64LE(33)),
      pendingRewards: Number(d.readBigUInt64LE(57)),
      stakedAt: Number(d.readBigUInt64LE(65)),
    };
  }
}
