"use client";

import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useState } from "react";
import { Header } from "@/components/header";
import { DitherImage } from "@/components/dither-image";
import { useArenaState, lamportsToSol, tokenToAur } from "@/hooks/use-arena";
import { usePoolData } from "@/hooks/use-pool-data";
import {
  useStakerLeaderboard,
  calcPendingRewards,
  type StakerData,
} from "@/hooks/use-stakers";
import { PublicKey } from "@solana/web3.js";

/* ═══════════════════════════════════ */
/* PAGE                                */
/* ═══════════════════════════════════ */
export default function StakePage() {
  const { arena, loading } = useArenaState(5000);
  const { stakers } = useStakerLeaderboard(5000);
  const [tab, setTab] = useState<"stake" | "pool">("stake");

  const totalStaked = arena?.totalAurStaked || 0;
  const rewardPool = arena?.stakerRewardPool || 0;
  const lpFund = arena?.lpFund || 0;
  const totalLpDeployed = arena?.totalLpDeployed || 0;

  // Pool data from on-chain DLMM
  const lpPoolAddress =
    arena?.lpPool && arena.lpPool !== PublicKey.default.toBase58()
      ? arena.lpPool
      : null;
  const { poolData } = usePoolData(lpPoolAddress, 10000);

  return (
    <div className="min-h-screen bg-[#2441ff] text-white">
      <Header />

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-24">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold tracking-tight mb-2"
        >
          Stake &amp; Pool
        </motion.h1>
        <p className="text-white/40 text-sm mb-10">
          Stake AUR to earn protocol SOL. LP pool liquidity powered by match
          fees.
        </p>

        {/* ═══ Tab Switcher ═══ */}
        <div className="flex gap-1 bg-white/10 p-1 rounded-full w-fit mb-8">
          {(["stake", "pool"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-8 py-2.5 rounded-full text-[12px] tracking-[0.2em] uppercase font-semibold transition-all ${
                tab === t
                  ? "bg-white text-[#1a1a2e] shadow-sm"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {t === "stake" ? "Staking" : "LP Pool"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-white/40">Loading…</div>
        ) : tab === "stake" ? (
          <StakingPanel
            totalStaked={totalStaked}
            rewardPool={rewardPool}
            arena={arena}
            stakers={stakers}
          />
        ) : (
          <PoolPanel
            lpFund={lpFund}
            totalLpDeployed={totalLpDeployed}
            poolData={poolData}
            arena={arena}
          />
        )}
      </div>
    </div>
  );
}

/* ═══ STAKING PANEL ═══ */
function StakingPanel({
  totalStaked,
  rewardPool,
  arena,
  stakers,
}: {
  totalStaked: number;
  rewardPool: number;
  arena: any;
  stakers: StakerData[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Protocol Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card
          label="Total AUR Staked"
          value={tokenToAur(totalStaked)}
          unit="AUR"
          accentColor="#10b981"
        />
        <Card
          label="Staker Reward Pool"
          value={lamportsToSol(rewardPool)}
          unit="SOL"
          accentColor="#0ea5e9"
        />
        <Card
          label="Revenue per AUR"
          value={
            totalStaked > 0
              ? (rewardPool / 1e9 / (totalStaked / 1e6)).toLocaleString(
                  undefined,
                  { minimumFractionDigits: 8, maximumFractionDigits: 8 },
                )
              : "—"
          }
          unit="SOL / AUR"
          accentColor="#7c3aed"
        />
        <Card
          label="Total Stakers"
          value={stakers.length.toLocaleString()}
          unit=""
          accentColor="#f59e0b"
        />
      </div>

      {/* How It Works */}
      <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
          How Staking Works
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
          <Step
            n={1}
            title="Stake AUR"
            desc="Lock your AUR tokens to earn a share of protocol SOL revenue."
          />
          <Step
            n={2}
            title="Earn SOL"
            desc="Each match distributes SOL to stakers based on your share."
          />
          <Step
            n={3}
            title="Claim Rewards"
            desc="Claim SOL rewards after a ~40 min cooldown. No need to unstake."
          />
          <Step
            n={4}
            title="Unstake"
            desc="Withdraw AUR + remaining SOL after the ~40 min cooldown."
          />
        </div>
      </div>

      {/* CLI Instructions */}
      <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-4">
          How to Stake
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Staking is currently available via the Aureus SDK and CLI. Install the
          SDK and use the following commands:
        </p>
        <div className="bg-gray-900 rounded-xl p-5 font-mono text-sm text-green-400 space-y-2 overflow-x-auto">
          <p className="text-gray-500"># Install the SDK</p>
          <p>npm install @aureus-arena/sdk</p>
          <p className="text-gray-500 mt-3"># Check your staking status</p>
          <p>npx aureus status</p>
          <p className="text-gray-500 mt-3"># Stake AUR</p>
          <p>npx aureus stake 100</p>
          <p className="text-gray-500 mt-3"># Claim SOL rewards</p>
          <p>npx aureus claim-rewards</p>
          <p className="text-gray-500 mt-3"># Unstake AUR</p>
          <p>npx aureus unstake 100</p>
        </div>
        <p className="text-[11px] text-gray-400 mt-4">
          See the{" "}
          <a href="/docs" className="text-[#2441ff] hover:underline">
            documentation
          </a>{" "}
          for full details.
        </p>
      </div>

      {/* ═══ STAKER LEADERBOARD ═══ */}
      <div className="bg-white rounded-[24px] shadow-[0_30px_80px_rgba(0,0,60,0.35)] overflow-hidden">
        <div className="px-8 pt-7 pb-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
            Staker Leaderboard
          </p>
          <p className="text-[11px] text-gray-300 mt-1">
            Ranked by total AUR staked
          </p>
        </div>

        {stakers.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No stakers yet — be the first!
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[580px]">
                {/* Table Header */}
                <div className="grid grid-cols-[60px_1fr_140px_140px_120px] border-b border-gray-100 px-6 py-3">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                    #
                  </span>
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                    Staker
                  </span>
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold text-right">
                    Staked
                  </span>
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold text-right">
                    Pool Share
                  </span>
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold text-right">
                    Pending
                  </span>
                </div>

                {/* Rows */}
                <LayoutGroup>
                  <AnimatePresence>
                    {stakers.slice(0, 25).map((s, i) => (
                      <StakerRow
                        key={s.owner}
                        staker={s}
                        rank={i + 1}
                        totalStaked={totalStaked}
                        isYou={false}
                        rewardCumulative={
                          arena?.rewardPerTokenCumulative || BigInt(0)
                        }
                      />
                    ))}
                  </AnimatePresence>
                </LayoutGroup>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Staker Row ─── */
function StakerRow({
  staker,
  rank,
  totalStaked,
  isYou,
  rewardCumulative,
}: {
  staker: StakerData;
  rank: number;
  totalStaked: number;
  isYou: boolean;
  rewardCumulative: bigint;
}) {
  const short = staker.owner.slice(0, 4) + "…" + staker.owner.slice(-4);
  const bustIdx = ((rank - 1) % 25) + 1;
  const aurStr = (staker.aurStaked / 1e6).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const share =
    totalStaked > 0
      ? ((staker.aurStaked / totalStaked) * 100).toFixed(2)
      : "0.00";
  const dynamicRewards = calcPendingRewards(staker, rewardCumulative);
  const pendingStr = (dynamicRewards / 1e9).toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });

  const rankBg =
    rank === 1
      ? "from-amber-400 to-yellow-600 text-white shadow-amber-300/30 shadow-lg"
      : rank === 2
        ? "from-gray-300 to-gray-400 text-white"
        : rank === 3
          ? "from-orange-400 to-orange-600 text-white"
          : "from-gray-100 to-gray-100 text-gray-500";

  return (
    <motion.div
      layout
      layoutId={staker.owner}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className={`grid grid-cols-[60px_1fr_140px_140px_120px] items-center px-6 py-4 border-b border-gray-50 hover:bg-gradient-to-r hover:from-blue-50/60 hover:to-transparent transition-colors cursor-pointer group ${
        isYou ? "bg-blue-50/40" : ""
      }`}
      onClick={() => (window.location.href = `/wallet/${staker.owner}`)}
    >
      {/* Rank */}
      <div>
        <div
          className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rankBg} flex items-center justify-center text-xs font-bold`}
        >
          {rank}
        </div>
      </div>

      {/* Staker address */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 shrink-0">
          <DitherImage
            src={`/assets/busts/${bustIdx}.png`}
            className="w-full h-full"
            lightColor={[200, 210, 255]}
            darkColor={[36, 65, 255]}
            pixelSize={2}
            bias={0.5}
          />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[#1a1a2e] text-sm group-hover:text-[#2441ff] transition-colors truncate font-mono">
            {short}
            {isYou && (
              <span className="ml-2 text-[10px] text-[#2441ff] bg-blue-100 px-1.5 py-0.5 rounded-full font-semibold">
                YOU
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Staked */}
      <div className="text-right">
        <span className="text-sm font-bold text-[#1a1a2e] tabular-nums">
          {aurStr}
        </span>
        <span className="text-[10px] text-gray-400 ml-1">AUR</span>
      </div>

      {/* Share */}
      <div className="text-right flex items-center justify-end gap-2">
        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#2441ff]"
            style={{ width: `${Math.min(parseFloat(share), 100)}%` }}
          />
        </div>
        <span className="text-xs font-bold tabular-nums text-gray-600">
          {share}%
        </span>
      </div>

      {/* Pending */}
      <div className="text-right">
        <span className="text-sm font-bold text-emerald-600 tabular-nums">
          {pendingStr}
        </span>
        <span className="text-[10px] text-gray-400 ml-1">SOL</span>
      </div>
    </motion.div>
  );
}

/* ═══ LP POOL PANEL ═══ */
function PoolPanel({
  lpFund,
  totalLpDeployed,
  poolData,
  arena,
}: {
  lpFund: number;
  totalLpDeployed: number;
  poolData: import("@/hooks/use-pool-data").PoolData | null;
  arena: any;
}) {
  const totalEmittedAur = tokenToAur(arena?.emitted || 0);
  const lpPoolAddress = arena?.lpPool || null;
  const hasPool =
    lpPoolAddress && lpPoolAddress !== PublicKey.default.toBase58();

  const priceStr = poolData
    ? poolData.aurPriceInSol.toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      })
    : "—";

  const aurPerSolStr = poolData
    ? poolData.aurPerSol.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Pool Price + Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card
          label="AUR Price"
          value={priceStr}
          unit={poolData ? "SOL" : "Pre-launch"}
          accentColor="#2441ff"
        />
        <Card
          label="AUR per SOL"
          value={aurPerSolStr}
          unit={poolData ? "AUR" : "—"}
          accentColor="#7c3aed"
        />
        <Card
          label="LP Fund (Pending)"
          value={lamportsToSol(lpFund)}
          unit="SOL"
          accentColor="#06b6d4"
        />
        <Card
          label="LP Deployed"
          value={lamportsToSol(totalLpDeployed)}
          unit="SOL"
          accentColor="#10b981"
        />
      </div>

      {/* Pool Reserves + TVL */}
      {poolData && (
        <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
            Pool Reserves
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <Stat
              label="SOL in Pool"
              value={(poolData.reserveSol / 1e9).toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
              unit="SOL"
            />
            <Stat
              label="AUR in Pool"
              value={(poolData.reserveAur / 1e6).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              unit="AUR"
            />
            <Stat
              label="Pool TVL"
              value={poolData.tvlSol.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
              unit="SOL"
            />
            <Stat
              label="Active Bin"
              value={poolData.activeId.toString()}
              unit={`(step: ${poolData.binStep})`}
            />
          </div>
        </div>
      )}

      {/* Swap Fees — Pending + Claimed */}
      {poolData &&
        (poolData.pendingFeeSol > 0 ||
          poolData.pendingFeeAur > 0 ||
          poolData.vaultWsolBalance > 0 ||
          poolData.vaultAurBalance > 0) && (
          <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                Swap Fee Revenue
              </p>
              <span className="text-[10px] px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 font-semibold">
                SOL → Staker Pool · AUR → Token Jackpot
              </span>
            </div>

            {/* Pending (unclaimed) fees */}
            {(poolData.pendingFeeSol > 0 || poolData.pendingFeeAur > 0) && (
              <>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Pending — Accruing in Position
                </p>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-5 border border-amber-100">
                    <p className="text-[10px] text-amber-600/70 uppercase tracking-wider font-semibold mb-1">
                      SOL Fees Accruing
                    </p>
                    <p className="text-xl font-bold text-[#1a1a2e] tabular-nums">
                      {(poolData.pendingFeeSol / 1e9).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 6,
                          maximumFractionDigits: 6,
                        },
                      )}
                      <span className="text-xs text-gray-400 ml-1.5">SOL</span>
                    </p>
                    <p className="text-[10px] text-amber-600/50 mt-1">
                      → staker reward pool on claim
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-5 border border-amber-100">
                    <p className="text-[10px] text-amber-600/70 uppercase tracking-wider font-semibold mb-1">
                      AUR Fees Accruing
                    </p>
                    <p className="text-xl font-bold text-[#1a1a2e] tabular-nums">
                      {(poolData.pendingFeeAur / 1e6).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                      <span className="text-xs text-gray-400 ml-1.5">AUR</span>
                    </p>
                    <p className="text-[10px] text-amber-600/50 mt-1">
                      → token jackpot pool on claim
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Already claimed fees in vault */}
            {(poolData.vaultWsolBalance > 0 ||
              poolData.vaultAurBalance > 0) && (
              <>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Claimed — In Vault
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
                    <p className="text-[10px] text-blue-600/70 uppercase tracking-wider font-semibold mb-1">
                      wSOL Claimed
                    </p>
                    <p className="text-xl font-bold text-[#1a1a2e] tabular-nums">
                      {(poolData.vaultWsolBalance / 1e9).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 6,
                          maximumFractionDigits: 6,
                        },
                      )}
                      <span className="text-xs text-gray-400 ml-1.5">SOL</span>
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-2xl p-5 border border-violet-100">
                    <p className="text-[10px] text-violet-600/70 uppercase tracking-wider font-semibold mb-1">
                      AUR Claimed
                    </p>
                    <p className="text-xl font-bold text-[#1a1a2e] tabular-nums">
                      {(poolData.vaultAurBalance / 1e6).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                      <span className="text-xs text-gray-400 ml-1.5">AUR</span>
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      {/* Pool Details */}
      <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
          Pool Mechanics
        </p>
        <div className="space-y-4">
          <DetailRow label="Max Supply" value="21,000,000 AUR" />
          <DetailRow
            label="Total AUR Emitted"
            value={totalEmittedAur + " AUR"}
          />
          <DetailRow
            label="LP Funding Source"
            value="40% of protocol revenue"
          />
          <DetailRow label="Pool Type" value="Meteora DLMM (AUR / SOL)" />
          <DetailRow
            label="Deploy Threshold"
            value="0.05 SOL (permissionless)"
          />
          {hasPool && (
            <DetailRow
              label="Pool Address"
              value={lpPoolAddress.slice(0, 8) + "…" + lpPoolAddress.slice(-8)}
            />
          )}
        </div>
      </div>

      {/* AUR Token Distribution */}
      <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
          AUR Emission Split
        </p>
        <div className="space-y-4">
          <FeeBar label="Match Winner" pct={65} color="bg-green-500" />
          <FeeBar label="Jackpot Pool" pct={35} color="bg-amber-400" />
        </div>
      </div>

      {/* Entry Fee Distribution */}
      <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8">
        <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
          SOL Entry Fee Distribution
        </p>
        <div className="space-y-4">
          <FeeBar label="Winner Prize" pct={85} color="bg-green-500" />
          <FeeBar label="SOL Jackpot" pct={5} color="bg-amber-400" />
          <FeeBar label="Protocol" pct={10} color="bg-[#2441ff]" />
        </div>
        <p className="text-[11px] text-gray-300 mt-4">
          Protocol 10% is further split: 40% LP · 30% Stakers · 20% Dev · 10%
          Jackpot boost
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Shared Components ─── */

function Card({
  label,
  value,
  unit,
  accentColor,
}: {
  label: string;
  value: string;
  unit: string;
  accentColor: string;
}) {
  return (
    <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-6 flex flex-col gap-3">
      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
        {label}
      </p>
      <div>
        <span className="text-2xl font-bold text-[#1a1a2e] tabular-nums">
          {value}
        </span>
        <span className="text-sm text-gray-400 ml-2">{unit}</span>
      </div>
      <div
        className="h-1 rounded-full opacity-80"
        style={{ backgroundColor: accentColor, width: "40%" }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
        {label}
      </p>
      <p className="text-[#1a1a2e] text-xl font-bold tabular-nums">
        {value}
        {unit && (
          <span className="text-sm font-medium text-gray-400 ml-1">{unit}</span>
        )}
      </p>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="w-8 h-8 rounded-full bg-[#2441ff]/10 flex items-center justify-center text-sm font-bold text-[#2441ff]">
        {n}
      </div>
      <p className="font-semibold text-[#1a1a2e]">{title}</p>
      <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-sm font-bold text-[#1a1a2e] tabular-nums">{value}</p>
    </div>
  );
}

function FeeBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-500 w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}
