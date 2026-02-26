"use client";

import { useEffect, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const DLMM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOC_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const AUR_MINT = new PublicKey("AUREUSnYXx3sWsS8gLcDJaMr8Nijwftcww1zbKHiDhF");

// Token X is the "smaller" pubkey in Meteora ordering
const aurIsX = AUR_MINT.toBuffer().compare(WSOL_MINT.toBuffer()) < 0;
const TOKEN_X_MINT = aurIsX ? AUR_MINT : WSOL_MINT;
const TOKEN_Y_MINT = aurIsX ? WSOL_MINT : AUR_MINT;
// X = wSOL, Y = AUR in our case (wSOL < AUR is false, so wSOL is X)
const SOL_DECIMALS = 9;
const AUR_DECIMALS = 6;

function findVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID,
  );
}

function findATA(wallet: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOC_TOKEN_PROGRAM,
  );
}

function findReserve(tokenMint: PublicKey, lbPair: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [lbPair.toBuffer(), tokenMint.toBuffer()],
    DLMM_ID,
  );
}

export interface PoolData {
  // Price
  aurPriceInSol: number;
  aurPerSol: number;
  activeId: number;
  binStep: number;
  // Pool reserves (in real units)
  reserveSol: number; // SOL in pool reserve
  reserveAur: number; // AUR in pool reserve
  // Vault fee ATAs (claimed fees sitting in vault)
  vaultWsolBalance: number; // lamports
  vaultAurBalance: number; // raw token units
  // Pending (unclaimed) fees accruing in the position
  pendingFeeSol: number; // lamports — will go to staker reward pool
  pendingFeeAur: number; // raw token units — will be held in vault
  // Pool TVL
  tvlSol: number; // total value locked in SOL terms
}

/**
 * Read Meteora DLMM pool data directly from on-chain bytes.
 *
 * LbPair layout (V2):
 *   - [0..8]    discriminator
 *   - [8..40]   static parameters (StaticParameters struct)
 *   - [40..72]  variable parameters (VariableParameters struct)
 *   - [72..73]  bump_seed [u8;1]
 *   - [73..75]  bin_step_seed [u8;2]  (little-endian u16)
 *   - [75..76]  pair_type u8
 *   - [76..80]  active_id i32 LE
 *   - [80..82]  bin_step u16 LE (from StaticParameters, but also derivable)
 *
 * The bin_step is in StaticParameters at the very start:
 *   static_params.base_factor: u16 [8..10]
 *   static_params.filter_period: u16 [10..12]
 *   ...
 *   Actually StaticParameters is 32 bytes total, and bin_step
 *   is encoded in bin_step_seed at [73..75].
 */
async function readPoolState(
  conn: Connection,
  lbPair: PublicKey,
): Promise<{ activeId: number; binStep: number } | null> {
  const info = await conn.getAccountInfo(lbPair);
  if (!info) return null;
  const d = info.data;

  // active_id is i32 at offset 76
  const activeId = d.readInt32LE(76);

  // bin_step_seed is at [73..75] as u16 LE — this IS the bin step
  const binStep = d.readUInt16LE(73);

  return { activeId, binStep };
}

/**
 * Read SPL token account balance from raw bytes.
 * SPL Token Account layout: amount is a u64 at offset 64.
 */
function readTokenBalance(data: Buffer): number {
  if (data.length < 72) return 0;
  return Number(data.readBigUInt64LE(64));
}

export function usePoolData(lbPairAddress: string | null, pollMs = 10000) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPoolData = useCallback(async () => {
    if (!lbPairAddress || lbPairAddress === PublicKey.default.toBase58()) {
      setPoolData(null);
      setLoading(false);
      return;
    }

    try {
      const conn = new Connection(RPC_URL, "confirmed");
      const lbPair = new PublicKey(lbPairAddress);
      const [vaultPDA] = findVaultPDA();

      // Read pool state
      const poolState = await readPoolState(conn, lbPair);
      if (!poolState) {
        setError("Pool not found on-chain");
        setLoading(false);
        return;
      }

      const { activeId, binStep } = poolState;

      // Compute price: price_raw = (1 + binStep/10000) ^ activeId
      // This gives Y per X in smallest units
      // X = wSOL (9 dec), Y = AUR (6 dec) in our pool
      const priceRaw = Math.pow(1 + binStep / 10000, activeId);
      // pricePerToken = priceRaw * 10^(decX - decY)
      //   = priceRaw * 10^(9 - 6) = priceRaw * 1000
      // This means 1 SOL = pricePerToken AUR
      const decX = aurIsX ? AUR_DECIMALS : SOL_DECIMALS;
      const decY = aurIsX ? SOL_DECIMALS : AUR_DECIMALS;
      const aurPerSol = priceRaw * Math.pow(10, decX - decY);
      const aurPriceInSol = 1 / aurPerSol;

      // Read pool reserves
      const [reserveXPDA] = findReserve(TOKEN_X_MINT, lbPair);
      const [reserveYPDA] = findReserve(TOKEN_Y_MINT, lbPair);

      // Read vault fee ATAs (wSOL and AUR held by vault from claimed fees)
      const [vaultWsolATA] = findATA(vaultPDA, WSOL_MINT);
      const [vaultAurATA] = findATA(vaultPDA, AUR_MINT);

      const accounts = await conn.getMultipleAccountsInfo([
        reserveXPDA,
        reserveYPDA,
        vaultWsolATA,
        vaultAurATA,
      ]);

      const reserveXBalance = accounts[0]
        ? readTokenBalance(accounts[0].data as Buffer)
        : 0;
      const reserveYBalance = accounts[1]
        ? readTokenBalance(accounts[1].data as Buffer)
        : 0;
      const vaultWsolRaw = accounts[2]
        ? readTokenBalance(accounts[2].data as Buffer)
        : 0;
      const vaultAurRaw = accounts[3]
        ? readTokenBalance(accounts[3].data as Buffer)
        : 0;

      // Map to SOL and AUR based on token ordering
      const reserveSol = aurIsX ? reserveYBalance : reserveXBalance;
      const reserveAur = aurIsX ? reserveXBalance : reserveYBalance;

      // TVL = SOL reserve + AUR reserve * AUR price in SOL
      const tvlSol = reserveSol / 1e9 + (reserveAur / 1e6) * aurPriceInSol;

      // Fetch pending (unclaimed) fees from server-side API
      let pendingFeeSol = 0;
      let pendingFeeAur = 0;
      try {
        const feeRes = await fetch(`/api/pool-fees?pool=${lbPairAddress}`);
        if (feeRes.ok) {
          const feeData = await feeRes.json();
          pendingFeeSol = feeData.pendingFeeSol || 0;
          pendingFeeAur = feeData.pendingFeeAur || 0;
        }
      } catch {
        // Non-critical — fees just won't show
      }

      setPoolData({
        aurPriceInSol,
        aurPerSol,
        activeId,
        binStep,
        reserveSol,
        reserveAur,
        vaultWsolBalance: vaultWsolRaw,
        vaultAurBalance: vaultAurRaw,
        pendingFeeSol,
        pendingFeeAur,
        tvlSol,
      });
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [lbPairAddress]);

  useEffect(() => {
    fetchPoolData();
    const id = setInterval(fetchPoolData, pollMs);
    return () => clearInterval(id);
  }, [fetchPoolData, pollMs]);

  return { poolData, loading, error, refetch: fetchPoolData };
}
