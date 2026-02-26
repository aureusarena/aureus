"use client";

import { motion } from "framer-motion";
import { Header } from "@/components/header";
import { useArenaState, lamportsToSol, tokenToAur } from "@/hooks/use-arena";

export default function DashboardPage() {
  const { arena, currentSlot, error, loading } = useArenaState(3000);

  return (
    <div className="min-h-screen bg-[#2441ff] text-white">
      <Header />

      <div className="max-w-6xl mx-auto px-6 pt-8 pb-24">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold tracking-tight mb-2"
        >
          Protocol Dashboard
        </motion.h1>
        <p className="text-white/40 text-sm mb-12">
          Real-time overview of the Aureus on-chain economy
        </p>

        {loading && (
          <div className="text-center py-20 text-white/40">Loading...</div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {arena && (
          <>
            {/* ═══ Treasury Cards ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
            >
              <TreasuryCard
                label="SOL Jackpot"
                value={lamportsToSol(arena.solJackpot)}
                unit="SOL"
                accentColor="#2441ff"
              />
              <TreasuryCard
                label="AUR Jackpot"
                value={tokenToAur(arena.tokenJackpot)}
                unit="AUR"
                accentColor="#d97706"
              />
              <TreasuryCard
                label="Protocol Revenue"
                value={lamportsToSol(arena.protocolRevenue)}
                unit="SOL"
                accentColor="#2441ff"
              />
              <TreasuryCard
                label="LP Deployed"
                value={lamportsToSol(arena.totalLpDeployed)}
                unit="SOL"
                accentColor="#7c3aed"
              />
            </motion.div>

            {/* ═══ Staking & LP Row ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
            >
              <TreasuryCard
                label="Staker Reward Pool"
                value={lamportsToSol(arena.stakerRewardPool)}
                unit="SOL"
                accentColor="#0ea5e9"
              />
              <TreasuryCard
                label="Total AUR Staked"
                value={tokenToAur(arena.totalAurStaked)}
                unit="AUR"
                accentColor="#10b981"
              />
              <TreasuryCard
                label="LP Fund"
                value={lamportsToSol(arena.lpFund)}
                unit="SOL"
                accentColor="#06b6d4"
              />
            </motion.div>

            {/* ═══ Tier Status ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6"
            >
              <TierCard
                tier={1}
                name="Bronze"
                entryFee="0.01"
                stakeReq="None"
                matchReq="None"
                unlocked={true}
                solJackpot={arena.solJackpotT1}
                aurJackpot={arena.tokenJackpotT1 + arena.swapFeeAurJackpot}
              />
              <TierCard
                tier={2}
                name="Silver"
                entryFee="0.05"
                stakeReq="1,000 AUR"
                matchReq="50+ T1 matches"
                unlocked={arena.totalStakersT2Eligible >= 10}
                eligible={arena.totalStakersT2Eligible}
                threshold={10}
                solJackpot={arena.solJackpotT2}
                aurJackpot={arena.tokenJackpotT2}
              />
              <TierCard
                tier={3}
                name="Gold"
                entryFee="0.1"
                stakeReq="10,000 AUR"
                matchReq=">55% win rate"
                unlocked={arena.totalStakersT3Eligible >= 6}
                eligible={arena.totalStakersT3Eligible}
                threshold={6}
                solJackpot={arena.solJackpotT3}
                aurJackpot={arena.tokenJackpotT3}
              />
            </motion.div>

            {/* ═══ Protocol Vitals ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8 mb-6"
            >
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
                Protocol Vitals
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                <Stat
                  label="Total Rounds"
                  value={arena.totalRounds.toLocaleString()}
                />
                <Stat
                  label="Total Agents"
                  value={arena.totalAgents.toLocaleString()}
                />
                <Stat label="Current Era" value={arena.era.toLocaleString()} />
                <Stat
                  label="AUR Emitted"
                  value={`${(arena.emitted / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  unit="AUR"
                />
                <Stat
                  label="Current Slot"
                  value={currentSlot.toLocaleString()}
                />
                <Stat
                  label="Genesis Slot"
                  value={arena.genesis.toLocaleString()}
                />
                <Stat
                  label="LP Deployed"
                  value={(arena.totalLpDeployed / 1e9).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 4, maximumFractionDigits: 4 },
                  )}
                  unit="SOL"
                />
                <Stat
                  label="Emission Rate"
                  value={`${[5, 2.5, 1.25, 0.625, 0.3125][arena.era] || "0"}`}
                  unit="AUR/round"
                />
              </div>
            </motion.div>

            {/* ═══ Jackpot History ═══ */}
            {arena.jackpotHistory.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] overflow-hidden mb-6"
              >
                <div className="px-8 pt-8 pb-4">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                    Recent Jackpot Winners
                  </p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[...arena.jackpotHistory].reverse().map((jp, i) => {
                    const short =
                      jp.winner.slice(0, 6) + "…" + jp.winner.slice(-4);
                    const isSol = jp.type === "SOL";
                    const displayAmt = isSol
                      ? (jp.amount / 1e9).toLocaleString(undefined, {
                          minimumFractionDigits: 6,
                          maximumFractionDigits: 6,
                        }) + " SOL"
                      : (jp.amount / 1e6).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }) + " AUR";

                    return (
                      <div
                        key={`${jp.round}-${jp.type}-${i}`}
                        className="flex items-center justify-between px-8 py-4 hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-amber-600"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#1a1a2e] font-mono">
                              {short}
                            </p>
                            <p className="text-[11px] text-gray-400">
                              Round #{jp.round.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              isSol ? "text-[#2441ff]" : "text-amber-500"
                            }`}
                          >
                            {displayAmt}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              isSol
                                ? "bg-blue-100 text-blue-600"
                                : "bg-amber-100 text-amber-600"
                            }`}
                          >
                            {jp.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ═══ Revenue Split ═══ */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-8"
            >
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-6">
                Entry Fee Distribution
              </p>
              <div className="space-y-4">
                <FeeBar label="Winner Prize" pct={85} color="bg-green-500" />
                <FeeBar label="SOL Jackpot" pct={5} color="bg-amber-400" />
                <FeeBar label="Protocol" pct={10} color="bg-[#2441ff]" />
              </div>
              <p className="text-[11px] text-gray-300 mt-4">
                Protocol 10% → 40% LP · 30% Stakers · 20% Dev · 10% Jackpot
                boost
              </p>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Treasury Card (white) ─── */
function TreasuryCard({
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

/* ─── Stat Cell ─── */
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

/* ─── Fee Distribution Bar ─── */
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

/* ─── Tier Card ─── */
const tierColors: Record<
  number,
  { gradient: string; badge: string; text: string }
> = {
  1: {
    gradient: "from-amber-600 to-amber-700",
    badge: "bg-amber-100 text-amber-700",
    text: "text-amber-600",
  },
  2: {
    gradient: "from-slate-400 to-slate-500",
    badge: "bg-slate-100 text-slate-600",
    text: "text-slate-500",
  },
  3: {
    gradient: "from-yellow-400 to-amber-500",
    badge: "bg-yellow-100 text-yellow-700",
    text: "text-yellow-600",
  },
};

function TierCard({
  tier,
  name,
  entryFee,
  stakeReq,
  matchReq,
  unlocked,
  eligible,
  threshold,
  solJackpot,
  aurJackpot,
}: {
  tier: number;
  name: string;
  entryFee: string;
  stakeReq: string;
  matchReq: string;
  unlocked: boolean;
  eligible?: number;
  threshold?: number;
  solJackpot: number;
  aurJackpot: number;
}) {
  const colors = tierColors[tier] || tierColors[1];
  const progress = threshold
    ? Math.min(100, ((eligible || 0) / threshold) * 100)
    : 100;

  return (
    <div
      className={`bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.25)] p-6 relative overflow-hidden ${!unlocked ? "opacity-75" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-white text-sm font-bold`}
          >
            T{tier}
          </div>
          <div>
            <p className="text-sm font-bold text-[#1a1a2e]">{name}</p>
            <p className="text-[10px] text-gray-400">{entryFee} SOL entry</p>
          </div>
        </div>
        <span
          className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${unlocked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
        >
          {unlocked ? "OPEN" : "LOCKED"}
        </span>
      </div>

      {/* Jackpots */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-blue-50/80 rounded-xl p-3">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">
            SOL Jackpot
          </p>
          <p className="text-sm font-bold text-[#2441ff] tabular-nums">
            {(solJackpot / 1e9).toLocaleString(undefined, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })}
          </p>
        </div>
        <div className="bg-amber-50/80 rounded-xl p-3">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">
            AUR Jackpot
          </p>
          <p className="text-sm font-bold text-amber-600 tabular-nums">
            {(aurJackpot / 1e6).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>
      </div>

      {/* Requirements */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between text-[11px]">
          <span className="text-gray-400">Stake Req</span>
          <span className="text-gray-600 font-medium">{stakeReq}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-gray-400">Match Req</span>
          <span className="text-gray-600 font-medium">{matchReq}</span>
        </div>
      </div>

      {/* Unlock progress (T2/T3 only) */}
      {threshold && (
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Eligible Stakers</span>
            <span className="font-bold">
              {(eligible || 0).toLocaleString()}/{threshold.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={`h-full rounded-full bg-gradient-to-r ${colors.gradient}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
