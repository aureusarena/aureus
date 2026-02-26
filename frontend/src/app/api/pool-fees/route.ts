import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const AUR_MINT = new PublicKey("AUREUSnYXx3sWsS8gLcDJaMr8Nijwftcww1zbKHiDhF");
const aurIsX = AUR_MINT.toBuffer().compare(WSOL_MINT.toBuffer()) < 0;

function findVaultPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault")],
    PROGRAM_ID,
  );
}

/**
 * GET /api/pool-fees?pool=<pubkey>
 *
 * Returns pending (unclaimed) swap fees from the Meteora DLMM position
 * owned by the vault PDA. Uses the heavy Meteora SDK server-side only.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const poolAddress = searchParams.get("pool");

  if (!poolAddress) {
    return NextResponse.json({ error: "Missing pool param" }, { status: 400 });
  }

  try {
    // Dynamic import — keeps the SDK out of client bundles
    const DLMM = await import("@meteora-ag/dlmm");
    const DLMMClass = DLMM.default || DLMM;

    const conn = new Connection(RPC_URL, "confirmed");
    const lbPair = new PublicKey(poolAddress);
    const [vaultPDA] = findVaultPDA();

    const dlmmPool = await DLMMClass.create(conn, lbPair);
    const { userPositions } =
      await dlmmPool.getPositionsByUserAndLbPair(vaultPDA);

    if (!userPositions || userPositions.length === 0) {
      return NextResponse.json({
        pendingFeeSol: 0,
        pendingFeeAur: 0,
        positions: [],
      });
    }

    let totalFeeX = 0;
    let totalFeeY = 0;
    const positions: {
      address: string;
      feeX: number;
      feeY: number;
      lowerBinId: number;
      upperBinId: number;
      totalXAmount: number;
      totalYAmount: number;
    }[] = [];

    for (const pos of userPositions) {
      const feeX = pos.positionData.feeX
        ? Number(pos.positionData.feeX.toString())
        : 0;
      const feeY = pos.positionData.feeY
        ? Number(pos.positionData.feeY.toString())
        : 0;

      totalFeeX += feeX;
      totalFeeY += feeY;

      positions.push({
        address: pos.publicKey.toBase58(),
        feeX,
        feeY,
        lowerBinId: pos.positionData.lowerBinId,
        upperBinId: pos.positionData.upperBinId,
        totalXAmount: Number((pos.positionData.totalXAmount || 0).toString()),
        totalYAmount: Number((pos.positionData.totalYAmount || 0).toString()),
      });
    }

    // Map X/Y → SOL/AUR based on mint ordering
    const pendingFeeSol = aurIsX ? totalFeeY : totalFeeX;
    const pendingFeeAur = aurIsX ? totalFeeX : totalFeeY;

    return NextResponse.json(
      {
        pendingFeeSol,
        pendingFeeAur,
        positions,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("Pool fees API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
