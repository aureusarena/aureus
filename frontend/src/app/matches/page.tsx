"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Header } from "@/components/header";
import {
  useAllMatches,
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

type FilterResult = "all" | "win" | "loss" | "push";
type FilterTier = "all" | 0 | 1 | 2;

export default function MatchesPage() {
  const { matches, loading } = useAllMatches(8000);
  const [filterResult, setFilterResult] = useState<FilterResult>("all");
  const [filterTier, setFilterTier] = useState<FilterTier>("all");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  // Pair matches: group two commits from same round with matching opponents
  const pairedMatches = useMemo(() => {
    const scored = matches.filter((m) => m.scored);
    const map = new Map<string, MatchData[]>();

    for (const m of scored) {
      const key = `${m.round}-${[m.agent, m.opponent].sort().join("-")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }

    return Array.from(map.values()).sort((a, b) => b[0].round - a[0].round);
  }, [matches]);

  // Filter
  const filtered = useMemo(() => {
    return pairedMatches.filter(([m]) => {
      if (filterResult !== "all") {
        const resultMap: Record<string, number> = {
          win: 1,
          loss: 0,
          push: 2,
        };
        // Show pair if either side matches
        if (!m || m.result !== resultMap[filterResult]) return false;
      }
      if (filterTier !== "all" && m.tier !== filterTier) return false;
      return true;
    });
  }, [pairedMatches, filterResult, filterTier]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageMatches = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const totalScored = matches.filter((m) => m.scored).length;
  const totalWins = matches.filter((m) => m.result === 1).length;
  const totalSolWon = matches.reduce(
    (acc, m) => acc + (m.scored ? m.solWon : 0),
    0,
  );

  return (
    <div className="min-h-screen bg-[#2441ff] text-white">
      <Header />

      <div className="max-w-6xl mx-auto px-6 pt-4 pb-24">
        {/* Page Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Link
            href="/"
            className="text-white/40 text-xs tracking-wider uppercase hover:text-white/60 transition-colors mb-4 inline-block"
          >
            ← Back to Arena
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2">
            Match Explorer
          </h1>
          <p className="text-white/40 text-sm">
            Browse every match played on-chain — strategies revealed, outcomes
            decided
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
        >
          <StatCard
            label="Total Matches"
            value={(totalScored / 2).toLocaleString()}
          />
          <StatCard
            label="Commits Recorded"
            value={matches.length.toLocaleString()}
          />
          <StatCard label="Total Wins" value={totalWins.toLocaleString()} />
          <StatCard
            label="SOL Distributed"
            value={(totalSolWon / 1e9).toLocaleString(undefined, {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            })}
            unit="SOL"
          />
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-wrap items-center gap-3 mb-6"
        >
          <span className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mr-1">
            Result
          </span>
          {(["all", "win", "loss", "push"] as FilterResult[]).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilterResult(f);
                setPage(0);
              }}
              className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold transition-all ${
                filterResult === f
                  ? "bg-white text-[#2441ff]"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}

          <div className="w-px h-5 bg-white/20 mx-2" />

          <span className="text-[11px] text-white/40 uppercase tracking-wider font-semibold mr-1">
            Tier
          </span>
          {(
            [
              { v: "all" as FilterTier, l: "All" },
              { v: 0 as FilterTier, l: "Bronze" },
              { v: 1 as FilterTier, l: "Silver" },
              { v: 2 as FilterTier, l: "Gold" },
            ] as const
          ).map(({ v, l }) => (
            <button
              key={String(v)}
              onClick={() => {
                setFilterTier(v);
                setPage(0);
              }}
              className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider font-semibold transition-all ${
                filterTier === v
                  ? "bg-white text-[#2441ff]"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {l}
            </button>
          ))}

          <span className="ml-auto text-[11px] text-white/30 tabular-nums">
            {filtered.length.toLocaleString()} match
            {filtered.length !== 1 ? "es" : ""}
          </span>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Match List */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-[24px] shadow-[0_30px_80px_rgba(0,0,60,0.35)] overflow-hidden"
          >
            {pageMatches.length === 0 ? (
              <div className="p-16 text-center text-gray-400">
                No matches found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                  <div className="divide-y divide-gray-50">
                    <AnimatePresence mode="popLayout">
                      {pageMatches.map((pair) => (
                        <MatchRow
                          key={pair[0].pda}
                          pair={pair}
                          expanded={expandedMatch === pair[0].pda}
                          onToggle={() =>
                            setExpandedMatch(
                              expandedMatch === pair[0].pda
                                ? null
                                : pair[0].pda,
                            )
                          }
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 hover:text-[#2441ff] disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 hover:text-[#2441ff] disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ─── Match Row ─── */
function MatchRow({
  pair,
  expanded,
  onToggle,
}: {
  pair: MatchData[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const m = pair[0];
  const opponent = pair.find((p) => p.agent !== m.agent) || null;
  const shortAgent = m.agent.slice(0, 4) + "…" + m.agent.slice(-4);
  const shortOpponent = m.opponent
    ? m.opponent.slice(0, 4) + "…" + m.opponent.slice(-4)
    : "—";

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Summary Row */}
      <div
        onClick={onToggle}
        className="grid grid-cols-[1fr_80px_100px_80px_100px_40px] items-center px-6 py-4 hover:bg-blue-50/40 transition-colors cursor-pointer group"
      >
        {/* Round + Agents */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col items-center shrink-0">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              Round
            </span>
            <span className="text-sm font-bold text-[#1a1a2e] tabular-nums">
              #{m.round.toLocaleString()}
            </span>
          </div>
          <div className="h-8 w-px bg-gray-100 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/wallet/${m.agent}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-[#1a1a2e] hover:text-[#2441ff] transition-colors font-mono"
              >
                {shortAgent}
              </Link>
              <span className="text-[10px] text-gray-300 font-bold">vs</span>
              <Link
                href={`/wallet/${m.opponent}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-[#1a1a2e] hover:text-[#2441ff] transition-colors font-mono"
              >
                {shortOpponent}
              </Link>
            </div>
          </div>
        </div>

        {/* Tier */}
        <div>
          <span
            className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${tierBadgeClass(m.tier)}`}
          >
            {tierLabel(m.tier)}
          </span>
        </div>

        {/* Result */}
        <div>
          <span className={`text-sm font-bold ${resultColor(m.result)}`}>
            {resultLabel(m.result)}
          </span>
        </div>

        {/* SOL Won */}
        <div className="text-right">
          {m.solWon > 0 && (
            <span className="text-sm font-bold text-[#2441ff] tabular-nums">
              +
              {(m.solWon / 1e9).toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </span>
          )}
        </div>

        {/* AUR Won */}
        <div className="text-right">
          {m.tokensWon > 0 && (
            <span className="text-sm font-bold text-amber-500 tabular-nums">
              +
              {(m.tokensWon / 1e6).toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
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

      {/* Expanded Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 pt-2">
              <div className="bg-gray-50 rounded-2xl p-6 grid md:grid-cols-2 gap-6">
                {/* Agent A Strategy */}
                <StrategyPanel
                  label={shortAgent}
                  wallet={m.agent}
                  strategy={m.strategy}
                  result={m.result}
                  solWon={m.solWon}
                  tokensWon={m.tokensWon}
                  jackpotSol={m.jackpotSolWon}
                  jackpotAur={m.jackpotTokensWon}
                />
                {/* Agent B Strategy (if available) */}
                {opponent ? (
                  <StrategyPanel
                    label={
                      opponent.agent.slice(0, 4) +
                      "…" +
                      opponent.agent.slice(-4)
                    }
                    wallet={opponent.agent}
                    strategy={opponent.strategy}
                    result={opponent.result}
                    solWon={opponent.solWon}
                    tokensWon={opponent.tokensWon}
                    jackpotSol={opponent.jackpotSolWon}
                    jackpotAur={opponent.jackpotTokensWon}
                  />
                ) : (
                  <StrategyPanel
                    label={shortOpponent}
                    wallet={m.opponent}
                    strategy={null}
                    result={m.result === 1 ? 0 : m.result === 0 ? 1 : 2}
                    solWon={0}
                    tokensWon={0}
                    jackpotSol={0}
                    jackpotAur={0}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Strategy Panel ─── */
function StrategyPanel({
  label,
  wallet,
  strategy,
  result,
  solWon,
  tokensWon,
  jackpotSol,
  jackpotAur,
}: {
  label: string;
  wallet: string;
  strategy: number[] | null;
  result: number;
  solWon: number;
  tokensWon: number;
  jackpotSol: number;
  jackpotAur: number;
}) {
  const total = strategy ? strategy.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/wallet/${wallet}`}
          className="text-sm font-bold text-[#1a1a2e] hover:text-[#2441ff] transition-colors font-mono"
        >
          {label}
        </Link>
        <span className={`text-xs font-bold ${resultColor(result)}`}>
          {resultLabel(result)}
        </span>
      </div>

      {/* Strategy Bars */}
      {strategy ? (
        <div className="space-y-2 mb-4">
          {strategy.map((val, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400 w-14 shrink-0 uppercase tracking-wider font-semibold">
                {FIELD_LABELS[i]}
              </span>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${total > 0 ? (val / total) * 100 : 0}%`,
                  }}
                  transition={{ duration: 0.6, delay: i * 0.08 }}
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
        <div className="flex items-center justify-center py-8 text-gray-300 text-sm">
          Strategy not available
        </div>
      )}

      {/* Earnings */}
      <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
        {solWon > 0 && (
          <div>
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
              SOL Won
            </span>
            <p className="text-sm font-bold text-[#2441ff] tabular-nums">
              {(solWon / 1e9).toLocaleString(undefined, {
                minimumFractionDigits: 6,
                maximumFractionDigits: 6,
              })}
            </p>
          </div>
        )}
        {tokensWon > 0 && (
          <div>
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
              AUR Won
            </span>
            <p className="text-sm font-bold text-amber-500 tabular-nums">
              {(tokensWon / 1e6).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        )}
        {jackpotSol > 0 && (
          <div>
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
              🎰 SOL Jackpot
            </span>
            <p className="text-sm font-bold text-green-600 tabular-nums">
              {(jackpotSol / 1e9).toLocaleString(undefined, {
                minimumFractionDigits: 6,
                maximumFractionDigits: 6,
              })}
            </p>
          </div>
        )}
        {jackpotAur > 0 && (
          <div>
            <span className="text-[9px] text-gray-400 uppercase tracking-wider">
              🎰 AUR Jackpot
            </span>
            <p className="text-sm font-bold text-green-600 tabular-nums">
              {(jackpotAur / 1e6).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        )}
        {solWon === 0 &&
          tokensWon === 0 &&
          jackpotSol === 0 &&
          jackpotAur === 0 && (
            <span className="text-[11px] text-gray-300">No earnings</span>
          )}
      </div>
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_10px_40px_rgba(0,0,60,0.15)]">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-1">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-[#1a1a2e]">
        {value}
        {unit && (
          <span className="text-sm font-medium text-gray-400 ml-1">{unit}</span>
        )}
      </p>
    </div>
  );
}
