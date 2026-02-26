"use client";

import { use, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { DitherImage } from "@/components/dither-image";
import { Header } from "@/components/header";
import { useAgentProfile } from "@/hooks/use-agents";
import {
  useAgentMatches,
  resultLabel,
  resultColor,
  tierLabel,
  tierBadgeClass,
  type MatchData,
} from "@/hooks/use-matches";

const FIELD_LABELS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
const FIELD_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
];

type Tab = "overview" | "matches";

export default function WalletPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const { agent, loading, error } = useAgentProfile(address);
  const { matches, loading: matchesLoading } = useAgentMatches(address);
  const short = address.slice(0, 6) + "…" + address.slice(-6);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [matchPage, setMatchPage] = useState(0);
  const MATCHES_PER_PAGE = 15;

  // Match stats
  const matchStats = useMemo(() => {
    const scored = matches.filter((m) => m.scored);
    const wins = scored.filter((m) => m.result === 1).length;
    const losses = scored.filter((m) => m.result === 0).length;
    const pushes = scored.filter((m) => m.result === 2).length;
    const totalSol = scored.reduce((a, m) => a + m.solWon, 0);
    const totalAur = scored.reduce((a, m) => a + m.tokensWon, 0);
    const jackpots = scored.filter(
      (m) => m.jackpotSolWon > 0 || m.jackpotTokensWon > 0,
    ).length;
    const totalJackpotSol = scored.reduce((a, m) => a + m.jackpotSolWon, 0);
    const totalJackpotAur = scored.reduce((a, m) => a + m.jackpotTokensWon, 0);

    // Strategy frequency
    const strategyMap = new Map<string, number>();
    for (const m of scored) {
      if (m.revealed) {
        const key = m.strategy.join("-");
        strategyMap.set(key, (strategyMap.get(key) || 0) + 1);
      }
    }
    const topStrategies = Array.from(strategyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Average field allocation
    const avgStrategy = [0, 0, 0, 0, 0];
    let stratCount = 0;
    for (const m of scored) {
      if (m.revealed && m.strategy.some((v) => v > 0)) {
        for (let i = 0; i < 5; i++) avgStrategy[i] += m.strategy[i];
        stratCount++;
      }
    }
    if (stratCount > 0) {
      for (let i = 0; i < 5; i++)
        avgStrategy[i] = Math.round(avgStrategy[i] / stratCount);
    }

    // Win streak
    let maxStreak = 0;
    let currentStreak = 0;
    for (const m of [...scored].reverse()) {
      if (m.result === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    return {
      wins,
      losses,
      pushes,
      totalSol,
      totalAur,
      jackpots,
      totalJackpotSol,
      totalJackpotAur,
      topStrategies,
      avgStrategy,
      maxStreak,
      total: scored.length,
    };
  }, [matches]);

  const totalMatchPages = Math.ceil(
    matches.filter((m) => m.scored).length / MATCHES_PER_PAGE,
  );
  const displayMatches = matches
    .filter((m) => m.scored)
    .slice(matchPage * MATCHES_PER_PAGE, (matchPage + 1) * MATCHES_PER_PAGE);

  return (
    <div className="min-h-screen bg-[#2441ff] text-white relative overflow-hidden">
      {/* Pillar — right side */}
      <div className="absolute top-0 right-0 h-full w-[22vw] max-w-[350px] z-[1] pointer-events-none select-none">
        <DitherImage
          src="/assets/pillar.png"
          className="w-full h-full object-cover"
          lightColor={[160, 175, 255]}
          darkColor={[36, 65, 255]}
          pixelSize={1.5}
          bias={0}
          style={{ opacity: 0.8 }}
        />
      </div>

      {/* Nav */}
      <Header rightLabel="Agent Profile" />

      <main className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-32">
            <p className="text-white/60 text-lg mb-4">Agent not found</p>
            <p className="text-white/30 text-sm font-mono mb-8 break-all">
              {address}
            </p>
            <Link
              href="/"
              className="text-amber-300 hover:text-amber-200 text-sm underline underline-offset-4"
            >
              ← Back to Arena
            </Link>
          </div>
        )}

        {agent && (
          <>
            {/* Back link */}
            <Link
              href="/#leaderboard"
              className="text-white/40 text-xs tracking-wider uppercase hover:text-white/60 transition-colors mb-8 inline-block"
            >
              ← Back to Leaderboard
            </Link>

            {/* Hero Card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="bg-white rounded-[24px] shadow-[0_30px_80px_rgba(0,0,60,0.35)] overflow-hidden mb-8"
            >
              <div className="px-8 py-8 flex flex-col md:flex-row md:items-center gap-6">
                {/* Bust avatar */}
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-200 shrink-0">
                  <DitherImage
                    src="/assets/busts/1.png"
                    className="w-full h-full"
                    lightColor={[200, 210, 255]}
                    darkColor={[36, 65, 255]}
                    pixelSize={2}
                    bias={0.5}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-[#1a1a2e] font-mono">
                    {short}
                  </h1>
                  <p className="text-xs text-gray-400 font-mono mt-1 break-all">
                    {address}
                  </p>
                </div>
                {/* Quick stats */}
                <div className="flex gap-8 text-center">
                  <div>
                    <p className="text-2xl font-bold text-[#1a1a2e] tabular-nums">
                      {agent.totalGames.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                      Matches
                    </p>
                  </div>
                  <div>
                    <p
                      className={`text-2xl font-bold tabular-nums ${
                        agent.winRate >= 55
                          ? "text-green-600"
                          : agent.winRate >= 45
                            ? "text-amber-600"
                            : "text-red-500"
                      }`}
                    >
                      {agent.winRate}%
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                      Win Rate
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#2441ff] tabular-nums">
                      {(agent.totalSolEarned / 1e9).toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
                    </p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                      SOL Earned
                    </p>
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex border-t border-gray-100">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`flex-1 py-3.5 text-[12px] uppercase tracking-[0.2em] font-semibold transition-colors relative ${
                    activeTab === "overview"
                      ? "text-[#2441ff]"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  Overview
                  {activeTab === "overview" && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2441ff]"
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("matches")}
                  className={`flex-1 py-3.5 text-[12px] uppercase tracking-[0.2em] font-semibold transition-colors relative ${
                    activeTab === "matches"
                      ? "text-[#2441ff]"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  Match History
                  {matches.length > 0 && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 tabular-nums">
                      {matchStats.total.toLocaleString()}
                    </span>
                  )}
                  {activeTab === "matches" && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2441ff]"
                    />
                  )}
                </button>
              </div>
            </motion.div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === "overview" && (
              <>
                {/* Stats Grid */}
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  {/* Combat Record */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                  >
                    <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-5">
                      Combat Record
                    </h3>
                    <div className="flex items-center justify-between mb-6">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-green-600 tabular-nums">
                          {agent.totalWins.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">Wins</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-red-400 tabular-nums">
                          {agent.totalLosses.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">Losses</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-gray-300 tabular-nums">
                          {agent.totalPushes.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">Pushes</p>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
                      {agent.totalGames > 0 && (
                        <>
                          <div
                            className="bg-green-500 h-full transition-all"
                            style={{
                              width: `${(agent.totalWins / agent.totalGames) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-red-400 h-full transition-all"
                            style={{
                              width: `${(agent.totalLosses / agent.totalGames) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-gray-200 h-full transition-all"
                            style={{
                              width: `${(agent.totalPushes / agent.totalGames) * 100}%`,
                            }}
                          />
                        </>
                      )}
                    </div>
                  </motion.div>

                  {/* Earnings */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                  >
                    <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-5">
                      Earnings
                    </h3>
                    <div className="space-y-5">
                      {/* SOL Earned (total including jackpots) */}
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                          Total SOL Earned
                        </p>
                        <p className="text-2xl font-bold text-[#2441ff] tabular-nums">
                          {(agent.totalSolEarned / 1e9).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 6,
                              maximumFractionDigits: 6,
                            },
                          )}
                          <span className="text-sm text-gray-300 ml-2">
                            SOL
                          </span>
                        </p>
                        {/* Breakdown: match vs jackpot */}
                        {matchStats.totalJackpotSol > 0 && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-400">
                                From matches
                              </span>
                              <span className="font-semibold text-gray-500 tabular-nums">
                                {(
                                  (agent.totalSolEarned -
                                    matchStats.totalJackpotSol) /
                                  1e9
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 6,
                                  maximumFractionDigits: 6,
                                })}{" "}
                                SOL
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-400 flex items-center gap-1">
                                From jackpots
                              </span>
                              <span className="font-semibold text-green-600 tabular-nums">
                                +
                                {(
                                  matchStats.totalJackpotSol / 1e9
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 6,
                                  maximumFractionDigits: 6,
                                })}{" "}
                                SOL
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* AUR Earned (total including jackpots) */}
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                          Total AUR Earned
                        </p>
                        <p className="text-2xl font-bold text-amber-500 tabular-nums">
                          {(agent.totalAurEarned / 1e6).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                          <span className="text-sm text-gray-300 ml-2">
                            AUR
                          </span>
                        </p>
                        {/* Breakdown: match vs jackpot */}
                        {matchStats.totalJackpotAur > 0 && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-400">
                                From matches
                              </span>
                              <span className="font-semibold text-gray-500 tabular-nums">
                                {(
                                  (agent.totalAurEarned -
                                    matchStats.totalJackpotAur) /
                                  1e6
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                AUR
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-400 flex items-center gap-1">
                                From jackpots
                              </span>
                              <span className="font-semibold text-green-600 tabular-nums">
                                +
                                {(
                                  matchStats.totalJackpotAur / 1e6
                                ).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                AUR
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Win Rate Ring */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                  >
                    <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-5">
                      Win Rate (Last 100)
                    </h3>
                    <div className="flex items-center justify-center">
                      <div className="relative w-28 h-28">
                        <svg
                          viewBox="0 0 36 36"
                          className="w-full h-full -rotate-90"
                        >
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke="#f3f4f6"
                            strokeWidth="3"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={
                              agent.winRate >= 60
                                ? "#22c55e"
                                : agent.winRate >= 45
                                  ? "#f59e0b"
                                  : "#ef4444"
                            }
                            strokeWidth="3"
                            strokeDasharray={`${agent.winRate * 0.88} ${88 - agent.winRate * 0.88}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-[#1a1a2e]">
                            {agent.winRate}
                          </span>
                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                            percent
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* ═══ Strategy Insights ═══ */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {/* Average Strategy */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                  >
                    <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-5">
                      Average Strategy Profile
                    </h3>
                    {matchStats.avgStrategy.some((v) => v > 0) ? (
                      <div className="space-y-3">
                        {matchStats.avgStrategy.map((val, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-400 w-14 shrink-0 uppercase tracking-wider font-semibold">
                              {FIELD_LABELS[i]}
                            </span>
                            <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${val}%` }}
                                transition={{
                                  duration: 0.8,
                                  delay: 0.5 + i * 0.1,
                                }}
                                className={`h-full rounded-full ${FIELD_COLORS[i]}`}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 tabular-nums w-8 text-right">
                              {val}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300 text-center py-6">
                        No strategy data
                      </p>
                    )}
                  </motion.div>

                  {/* Performance Stats */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                  >
                    <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-5">
                      Performance
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <MiniStat
                        label="Best Streak"
                        value={matchStats.maxStreak.toLocaleString()}
                        sub="consecutive wins"
                      />
                      <MiniStat
                        label="Jackpots Won"
                        value={matchStats.jackpots.toLocaleString()}
                        sub={
                          matchStats.totalJackpotSol > 0 ||
                          matchStats.totalJackpotAur > 0
                            ? `${matchStats.totalJackpotSol > 0 ? (matchStats.totalJackpotSol / 1e9).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " SOL" : ""}${matchStats.totalJackpotSol > 0 && matchStats.totalJackpotAur > 0 ? " + " : ""}${matchStats.totalJackpotAur > 0 ? (matchStats.totalJackpotAur / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " AUR" : ""}`
                            : matchStats.jackpots === 1
                              ? "jackpot"
                              : "jackpots"
                        }
                      />
                      <MiniStat
                        label="Tier Distribution"
                        value={`${agent.matchesT1.toLocaleString()}/${agent.matchesT2.toLocaleString()}/${agent.matchesT3.toLocaleString()}`}
                        sub="Bronze / Silver / Gold"
                      />
                      <MiniStat
                        label="Unique Strategies"
                        value={matchStats.topStrategies.length.toLocaleString()}
                        sub="distinct plays"
                      />
                    </div>
                  </motion.div>
                </div>

                {/* Match History Heatmap */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-6"
                >
                  <h3 className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-4">
                    Recent Match History
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const results: { value: number }[] = [];
                      const count = Math.min(agent.totalGames, 100);
                      for (let i = 0; i < count; i++) {
                        const idx =
                          agent.last100Idx >= i + 1
                            ? agent.last100Idx - i - 1
                            : 100 + agent.last100Idx - i - 1;
                        results.push({ value: agent.last100[idx] });
                      }
                      results.reverse();
                      return results.map((r, i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.5 + i * 0.008 }}
                          className={`w-5 h-5 rounded-sm ${
                            r.value === 1
                              ? "bg-green-500"
                              : r.value === 0
                                ? "bg-red-400"
                                : "bg-gray-200"
                          }`}
                          title={
                            r.value === 1
                              ? "Win"
                              : r.value === 0
                                ? "Loss"
                                : "Push"
                          }
                        />
                      ));
                    })()}
                  </div>
                  <div className="flex items-center gap-6 mt-4 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-green-500" /> Win
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-red-400" /> Loss
                    </span>
                    <span className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-sm bg-gray-200" /> Push
                    </span>
                  </div>
                </motion.div>
              </>
            )}

            {/* ═══ MATCHES TAB ═══ */}
            {activeTab === "matches" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                {matchesLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                ) : displayMatches.length === 0 ? (
                  <div className="bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,60,0.2)] p-16 text-center text-gray-400">
                    No match history found
                  </div>
                ) : (
                  <div className="bg-white rounded-[24px] shadow-[0_30px_80px_rgba(0,0,60,0.35)] overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[80px_1fr_80px_80px_80px_80px_40px] px-6 py-3 border-b border-gray-100">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Round
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Opponent
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Tier
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                        Result
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">
                        SOL
                      </span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold text-right">
                        AUR
                      </span>
                      <span />
                    </div>

                    <div className="divide-y divide-gray-50">
                      <AnimatePresence mode="popLayout">
                        {displayMatches.map((m) => (
                          <ProfileMatchRow
                            key={m.pda}
                            match={m}
                            expanded={expandedMatch === m.pda}
                            onToggle={() =>
                              setExpandedMatch(
                                expandedMatch === m.pda ? null : m.pda,
                              )
                            }
                          />
                        ))}
                      </AnimatePresence>
                    </div>

                    {/* Pagination */}
                    {totalMatchPages > 1 && (
                      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                        <button
                          onClick={() =>
                            setMatchPage(Math.max(0, matchPage - 1))
                          }
                          disabled={matchPage === 0}
                          className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 hover:text-[#2441ff] disabled:opacity-30 transition-colors"
                        >
                          ← Previous
                        </button>
                        <span className="text-[11px] text-gray-400 tabular-nums">
                          Page {matchPage + 1} of {totalMatchPages}
                        </span>
                        <button
                          onClick={() =>
                            setMatchPage(
                              Math.min(totalMatchPages - 1, matchPage + 1),
                            )
                          }
                          disabled={matchPage >= totalMatchPages - 1}
                          className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 hover:text-[#2441ff] disabled:opacity-30 transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ─── Profile Match Row ─── */
function ProfileMatchRow({
  match: m,
  expanded,
  onToggle,
}: {
  match: MatchData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const shortOpponent = m.opponent.slice(0, 4) + "…" + m.opponent.slice(-4);
  const hasJackpot = m.jackpotSolWon > 0 || m.jackpotTokensWon > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div
        onClick={onToggle}
        className="grid grid-cols-[80px_1fr_80px_80px_80px_80px_40px] items-center px-6 py-3.5 hover:bg-blue-50/40 transition-colors cursor-pointer group"
      >
        {/* Round */}
        <span className="text-sm font-bold text-[#1a1a2e] tabular-nums">
          #{m.round.toLocaleString()}
        </span>

        {/* Opponent */}
        <div className="flex items-center gap-2">
          <Link
            href={`/wallet/${m.opponent}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-[#1a1a2e] hover:text-[#2441ff] transition-colors font-mono"
          >
            {shortOpponent}
          </Link>
          {hasJackpot && <span className="text-xs">🎰</span>}
        </div>

        {/* Tier */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold w-fit ${tierBadgeClass(m.tier)}`}
        >
          {tierLabel(m.tier)}
        </span>

        {/* Result */}
        <span className={`text-sm font-bold ${resultColor(m.result)}`}>
          {resultLabel(m.result)}
        </span>

        {/* SOL */}
        <div className="text-right">
          {m.solWon > 0 ? (
            <span className="text-sm font-bold text-[#2441ff] tabular-nums">
              +
              {(m.solWon / 1e9).toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </span>
          ) : (
            <span className="text-sm text-gray-300">—</span>
          )}
        </div>

        {/* AUR */}
        <div className="text-right">
          {m.tokensWon > 0 ? (
            <span className="text-sm font-bold text-amber-500 tabular-nums">
              +
              {(m.tokensWon / 1e6).toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
          ) : (
            <span className="text-sm text-gray-300">—</span>
          )}
        </div>

        {/* Expand arrow */}
        <div className="flex items-center justify-center">
          <motion.svg
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </motion.svg>
        </div>
      </div>

      {/* Expanded Strategy View */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 pt-1">
              <div className="bg-gray-50 rounded-2xl p-5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-3">
                  Strategy Deployed
                </p>
                {m.revealed && m.strategy.some((v) => v > 0) ? (
                  <div className="space-y-2">
                    {m.strategy.map((val, i) => {
                      const total = m.strategy.reduce((a, b) => a + b, 0);
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400 w-14 shrink-0 uppercase tracking-wider font-semibold">
                            {FIELD_LABELS[i]}
                          </span>
                          <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{
                                width: `${total > 0 ? (val / total) * 100 : 0}%`,
                              }}
                              transition={{
                                duration: 0.5,
                                delay: i * 0.06,
                              }}
                              className={`h-full rounded-full ${FIELD_COLORS[i]}`}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-600 tabular-nums w-8 text-right">
                            {val}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 text-center py-4">
                    Not revealed
                  </p>
                )}

                {/* Jackpot info */}
                {(m.jackpotSolWon > 0 || m.jackpotTokensWon > 0) && (
                  <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-4">
                    <span className="text-lg">🎰</span>
                    {m.jackpotSolWon > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider">
                          SOL Jackpot
                        </p>
                        <p className="text-sm font-bold text-green-600 tabular-nums">
                          +
                          {(m.jackpotSolWon / 1e9).toLocaleString(undefined, {
                            minimumFractionDigits: 6,
                            maximumFractionDigits: 6,
                          })}{" "}
                          SOL
                        </p>
                      </div>
                    )}
                    {m.jackpotTokensWon > 0 && (
                      <div>
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider">
                          AUR Jackpot
                        </p>
                        <p className="text-sm font-bold text-green-600 tabular-nums">
                          +
                          {(m.jackpotTokensWon / 1e6).toLocaleString(
                            undefined,
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}{" "}
                          AUR
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Mini Stat ─── */
function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3.5">
      <p className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
        {label}
      </p>
      <p className="text-xl font-bold text-[#1a1a2e] tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-300 mt-0.5">{sub}</p>
    </div>
  );
}
