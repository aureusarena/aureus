import { createHash } from "crypto";

// ═══════════════════════════════════════════════════
// Instruction Serialization (Borsh enum variant indices)
// ═══════════════════════════════════════════════════

export function serializeRegisterAgent(): Buffer {
  return Buffer.from([1]);
}

export function serializeCommit(
  round: number,
  commitment: Buffer,
  tier: number = 0,
): Buffer {
  const buf = Buffer.alloc(42);
  buf.writeUInt8(2, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  commitment.copy(buf, 9);
  buf.writeUInt8(tier, 41);
  return buf;
}

export function serializeReveal(
  round: number,
  strategy: number[],
  nonce: Buffer,
): Buffer {
  const buf = Buffer.alloc(46);
  buf.writeUInt8(3, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  for (let i = 0; i < 5; i++) buf.writeUInt8(strategy[i], 9 + i);
  nonce.copy(buf, 14);
  return buf;
}

export function serializeScoreMatch(
  round: number,
  matchIndex: number = 0,
): Buffer {
  const buf = Buffer.alloc(13);
  buf.writeUInt8(4, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  buf.writeUInt32LE(matchIndex, 9);
  return buf;
}

export function serializeClaim(round: number): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(5, 0);
  buf.writeBigUInt64LE(BigInt(round), 1);
  return buf;
}

export function serializeStakeAUR(amount: number): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(7, 0);
  buf.writeBigUInt64LE(BigInt(amount), 1);
  return buf;
}

export function serializeUnstakeAUR(amount: number): Buffer {
  const buf = Buffer.alloc(9);
  buf.writeUInt8(8, 0);
  buf.writeBigUInt64LE(BigInt(amount), 1);
  return buf;
}

export function serializeClaimStakeRewards(): Buffer {
  return Buffer.from([9]);
}

// ═══════════════════════════════════════════════════
// Commitment Hash
// ═══════════════════════════════════════════════════

/** Compute SHA-256 commitment hash from strategy + nonce */
export function computeCommitment(strategy: number[], nonce: Buffer): Buffer {
  if (strategy.length !== 5)
    throw new Error("Strategy must have exactly 5 fields");
  const sum = strategy.reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`Strategy must sum to 100, got ${sum}`);

  const preimage = Buffer.alloc(37);
  for (let i = 0; i < 5; i++) preimage.writeUInt8(strategy[i], i);
  nonce.copy(preimage, 5);
  return createHash("sha256").update(preimage).digest();
}
