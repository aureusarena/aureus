import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AUR_MINT,
} from "./constants";

// ═══════════════════════════════════════════════════
// PDA Derivations
// ═══════════════════════════════════════════════════

export function findArenaPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("arena")], PROGRAM_ID);
}

export function findAgentPDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export function findRoundPDA(round: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    PROGRAM_ID,
  );
}

export function findCommitPDA(
  round: number,
  wallet: PublicKey,
): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(round));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("commit"), buf, wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export function findVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID,
  );
}

/** Returns the vanity AUR mint address (not a PDA — pre-created with createWithSeed) */
export function findMintPDA(): [PublicKey, number] {
  // Not actually a PDA — returns the vanity mint with bump 0 for API compat
  return [AUR_MINT, 0];
}

export function findStakePDA(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake"), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export function findATA(
  wallet: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}
