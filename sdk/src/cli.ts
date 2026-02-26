#!/usr/bin/env node
/**
 * Aureus Arena CLI — full game + staking interface
 */

import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AureusClient } from "./client";
import * as fs from "fs";
import * as path from "path";

const RPC_URL =
  process.env.AUREUS_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://api.devnet.solana.com";

function loadWallet(): Keypair {
  const walletPath =
    process.env.AUREUS_KEYPAIR ||
    process.env.SOLANA_KEYPAIR ||
    path.join(process.env.HOME || "~", ".config", "solana", "id.json");

  if (!fs.existsSync(walletPath)) {
    console.error(`❌ Wallet not found at ${walletPath}`);
    console.error(`   Set AUREUS_KEYPAIR or SOLANA_KEYPAIR env var`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(walletPath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║   ⚔️  AUREUS ARENA CLI                           ║
╚═══════════════════════════════════════════════════╝

Game Commands:
  aureus register              Register as an arena agent
  aureus play [strategy]       Play one round (commit → reveal → claim)
  aureus play-loop [rounds]    Play continuously (default: infinite)
  aureus claim <round>         Claim rewards for a specific round
  aureus agent                 Show your agent stats (wins/losses/etc.)
  aureus round                 Show current round timing

Staking Commands:
  aureus stake <amount>        Stake AUR tokens (e.g. "aureus stake 100")
  aureus unstake <amount>      Unstake AUR tokens
  aureus claim-rewards         Claim accumulated SOL staking rewards

Info Commands:
  aureus status                Show arena state & your position
  aureus balance               Show your AUR + SOL balances

Environment:
  AUREUS_RPC_URL     RPC endpoint (default: devnet)
  AUREUS_KEYPAIR     Path to wallet keypair JSON
  SOLANA_KEYPAIR     Fallback keypair path (default: ~/.config/solana/id.json)
`);
}

/** Parse strategy from "30,20,15,25,10" or use random */
function parseStrategy(arg?: string): number[] {
  if (arg) {
    const parts = arg.split(",").map(Number);
    if (parts.length !== 5 || parts.some(isNaN)) {
      console.error(
        "❌ Strategy must be 5 comma-separated numbers (e.g. 30,20,15,25,10)",
      );
      process.exit(1);
    }
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      console.error(`❌ Strategy must sum to 100 (got ${sum})`);
      process.exit(1);
    }
    return parts;
  }
  // Random strategy
  const r = Array.from({ length: 4 }, () => Math.floor(Math.random() * 20) + 1);
  r.push(100 - r.reduce((a, b) => a + b, 0));
  return r;
}

const RESULT_LABELS = [
  "LOSS",
  "WIN",
  "PUSH",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "UNSCORED",
];

async function main() {
  const [, , command, ...args] = process.argv;

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    return;
  }

  const wallet = loadWallet();
  const conn = new Connection(RPC_URL, "confirmed");
  const client = new AureusClient(conn, wallet);

  console.log(`\n  RPC:    ${RPC_URL}`);
  console.log(`  Wallet: ${wallet.publicKey.toBase58()}\n`);

  switch (command) {
    // ═══════════════════════════════════════
    // GAME COMMANDS
    // ═══════════════════════════════════════

    case "register": {
      console.log("  📝 Registering as arena agent...");
      try {
        const sig = await client.register();
        console.log(`  ✅ Registered! Tx: ${sig}`);
      } catch (e: any) {
        if (e.message?.includes("already in use")) {
          console.log("  ✅ Already registered!");
        } else {
          throw e;
        }
      }
      break;
    }

    case "play": {
      const strategy = parseStrategy(args[0]);
      const tierArg = parseInt(args[1]) || 0;
      console.log(`  ⚔️  Playing one round...`);
      console.log(`  Strategy: [${strategy.join(", ")}]  Tier: ${tierArg}`);

      // Register if needed
      const agent = await client.getAgent();
      if (!agent) {
        console.log("  📝 Auto-registering...");
        await client.register();
      }

      // Commit
      console.log("  ⏳ Waiting for commit phase...");
      const {
        round,
        nonce,
        signature: commitSig,
      } = await client.commit(strategy, undefined, tierArg);
      console.log(`  📤 Committed round ${round} (${commitSig.slice(0, 12)}…)`);

      // Wait for reveal phase
      let timing = await client.getRoundTiming();
      while (timing.phase === "commit") {
        await sleep(400);
        timing = await client.getRoundTiming();
      }

      // Reveal
      console.log("  🔓 Revealing...");
      const revealSig = await client.reveal(round, strategy, nonce);
      console.log(`  ✅ Revealed (${revealSig.slice(0, 12)}…)`);

      // Wait for scoring
      console.log("  ⏳ Waiting for grace period...");
      await sleep(45000); // ~40s grace

      // Claim
      console.log("  💰 Claiming...");
      try {
        const claimSig = await client.claim(round);
        const result = await client.getCommitResult(round);
        if (result) {
          const label = RESULT_LABELS[result.result] || "???";
          console.log(
            `  🏆 ${label} | SOL: ${(result.solWon / 1e9).toFixed(6)} | AUR: ${(result.tokensWon / 1e6).toFixed(2)}`,
          );
        }
        console.log(`  ✅ Claimed (${claimSig.slice(0, 12)}…)`);
      } catch (e: any) {
        console.log(`  ⚠️  Claim: ${e.message?.slice(0, 80)}`);
      }
      break;
    }

    case "play-loop": {
      const maxRounds = parseInt(args[0]) || Infinity;
      const stratArg = args[1]; // optional fixed strategy
      const tierArg = parseInt(args[2]) || 0;

      // Register if needed
      const agentCheck = await client.getAgent();
      if (!agentCheck) {
        console.log("  📝 Auto-registering...");
        await client.register();
      }

      let played = 0;
      let wins = 0,
        losses = 0,
        pushes = 0;
      let totalSol = 0,
        totalAur = 0;

      console.log(
        `  🔄 Playing ${maxRounds === Infinity ? "∞" : maxRounds} rounds (Ctrl+C to stop)\n`,
      );

      while (played < maxRounds) {
        played++;
        const strategy = parseStrategy(stratArg);
        console.log(
          `  ═══ Round ${played}/${maxRounds === Infinity ? "∞" : maxRounds} ═══`,
        );
        console.log(`  Strategy: [${strategy.join(", ")}]`);

        try {
          // Commit
          const { round, nonce } = await client.commit(
            strategy,
            undefined,
            tierArg,
          );
          console.log(`  📤 Committed round ${round}`);

          // Wait for reveal
          let timing = await client.getRoundTiming();
          while (timing.phase === "commit") {
            await sleep(400);
            timing = await client.getRoundTiming();
          }

          // Reveal
          await client.reveal(round, strategy, nonce);
          console.log(`  🔓 Revealed`);

          // Wait for grace
          await sleep(45000);

          // Claim
          try {
            await client.claim(round);
            const result = await client.getCommitResult(round);
            if (result) {
              const label = RESULT_LABELS[result.result] || "???";
              if (result.result === 1) wins++;
              else if (result.result === 0) losses++;
              else if (result.result === 2) pushes++;
              totalSol += result.solWon;
              totalAur += result.tokensWon;
              console.log(
                `  🏆 ${label} | SOL +${(result.solWon / 1e9).toFixed(6)} | AUR +${(result.tokensWon / 1e6).toFixed(2)}`,
              );
            }
          } catch {
            console.log(`  ⚠️  Claim skipped`);
          }
        } catch (e: any) {
          console.log(`  ❌ ${e.message?.slice(0, 80)}`);
        }

        console.log(
          `  📊 ${wins}W/${losses}L/${pushes}P | Total: ${(totalSol / 1e9).toFixed(6)} SOL, ${(totalAur / 1e6).toFixed(2)} AUR\n`,
        );
      }
      break;
    }

    case "claim": {
      const round = parseInt(args[0]);
      if (!round || round <= 0) {
        console.error("❌ Usage: aureus claim <round>");
        process.exit(1);
      }
      console.log(`  💰 Claiming round ${round}...`);
      const sig = await client.claim(round);
      const result = await client.getCommitResult(round);
      if (result) {
        const label = RESULT_LABELS[result.result] || "???";
        console.log(
          `  🏆 ${label} | SOL: ${(result.solWon / 1e9).toFixed(6)} | AUR: ${(result.tokensWon / 1e6).toFixed(2)}`,
        );
      }
      console.log(`  ✅ Claimed! Tx: ${sig}`);
      break;
    }

    case "agent": {
      const agent = await client.getAgent();
      if (!agent) {
        console.log("  Not registered. Run: aureus register");
        break;
      }
      const total = agent.totalWins + agent.totalLosses + agent.totalPushes;
      console.log(`  ═══ Agent Stats ═══`);
      console.log(
        `  Wallet:        ${agent.authority.slice(0, 8)}…${agent.authority.slice(-8)}`,
      );
      console.log(`  Total Matches: ${total}`);
      console.log(
        `  Record:        ${agent.totalWins}W / ${agent.totalLosses}L / ${agent.totalPushes}P`,
      );
      console.log(`  Win Rate:      ${agent.winRate}%`);
      console.log(
        `  SOL Earned:    ${(agent.totalSolEarned / 1e9).toFixed(6)} SOL`,
      );
      console.log(
        `  AUR Earned:    ${(agent.totalAurEarned / 1e6).toFixed(2)} AUR`,
      );
      console.log(`  Registered:    slot ${agent.registeredAt}`);
      break;
    }

    case "round": {
      const timing = await client.getRoundTiming();
      console.log(`  ═══ Round Timing ═══`);
      console.log(`  Current Round:   ${timing.currentRound}`);
      console.log(`  Phase:           ${timing.phase.toUpperCase()}`);
      console.log(`  Slots Remaining: ${timing.slotsRemaining}`);
      console.log(`  Next Commit:     slot ${timing.nextCommitSlot}`);
      break;
    }

    // ═══════════════════════════════════════
    // STAKING COMMANDS
    // ═══════════════════════════════════════

    case "stake": {
      const amount = parseFloat(args[0]);
      if (!amount || amount <= 0) {
        console.error("❌ Usage: aureus stake <amount>");
        console.error("   Example: aureus stake 100");
        process.exit(1);
      }
      const raw = Math.floor(amount * 1e6);
      console.log(`  🔒 Staking ${amount} AUR...`);
      const sig = await client.stake(raw);
      console.log(`  ✅ Staked! Tx: ${sig}`);
      break;
    }

    case "unstake": {
      const amount = parseFloat(args[0]);
      if (!amount || amount <= 0) {
        console.error("❌ Usage: aureus unstake <amount>");
        process.exit(1);
      }
      const raw = Math.floor(amount * 1e6);
      console.log(`  🔓 Unstaking ${amount} AUR...`);
      const sig = await client.unstake(raw);
      console.log(`  ✅ Unstaked! Tx: ${sig}`);
      break;
    }

    case "claim-rewards": {
      console.log(`  💰 Claiming SOL staking rewards...`);
      const sig = await client.claimStakeRewards();
      console.log(`  ✅ Rewards claimed! Tx: ${sig}`);
      break;
    }

    // ═══════════════════════════════════════
    // INFO COMMANDS
    // ═══════════════════════════════════════

    case "status": {
      const arena = await client.getArena();
      const stakeState = await client.getStakeState();
      const bal = await client.getTokenBalance();
      const solBal = await conn.getBalance(wallet.publicKey);
      const agent = await client.getAgent();

      console.log(`  ═══ Arena ═══`);
      if (arena) {
        console.log(`  Total Rounds:      ${arena.totalRounds}`);
        console.log(`  Total Agents:      ${arena.totalAgents}`);
        console.log(`  Era:               ${arena.era}`);
        console.log(
          `  AUR Emitted:       ${(arena.emitted / 1e6).toFixed(2)} AUR`,
        );
        console.log(
          `  Total AUR Staked:  ${(arena.totalAurStaked / 1e6).toFixed(2)} AUR`,
        );
        console.log(
          `  Staker Pool:       ${(arena.stakerRewardPool / 1e9).toFixed(6)} SOL`,
        );
        console.log(
          `  LP Fund:           ${(arena.lpFund / 1e9).toFixed(6)} SOL`,
        );
        console.log(
          `  SOL Jackpot:       ${((arena.solJackpotT1 + arena.solJackpotT2 + arena.solJackpotT3) / 1e9).toFixed(6)} SOL`,
        );
        console.log(
          `  AUR Jackpot:       ${((arena.tokenJackpotT1 + arena.tokenJackpotT2 + arena.tokenJackpotT3) / 1e6).toFixed(2)} AUR`,
        );
      } else {
        console.log(`  (not initialized)`);
      }

      console.log(`\n  ═══ Your Wallet ═══`);
      console.log(
        `  SOL Balance:       ${(solBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      );
      console.log(`  AUR Balance:       ${(bal / 1e6).toFixed(2)} AUR`);

      if (agent) {
        const total = agent.totalWins + agent.totalLosses + agent.totalPushes;
        console.log(`\n  ═══ Agent ═══`);
        console.log(
          `  Matches:           ${total}  (${agent.totalWins}W/${agent.totalLosses}L/${agent.totalPushes}P)`,
        );
        console.log(`  Win Rate:          ${agent.winRate}%`);
        console.log(
          `  SOL Earned:        ${(agent.totalSolEarned / 1e9).toFixed(6)} SOL`,
        );
        console.log(
          `  AUR Earned:        ${(agent.totalAurEarned / 1e6).toFixed(2)} AUR`,
        );
      } else {
        console.log(`\n  ═══ Agent ═══`);
        console.log(`  Not registered. Run: aureus register`);
      }

      console.log(`\n  ═══ Staking ═══`);
      if (stakeState) {
        console.log(
          `  AUR Staked:        ${(stakeState.aurStaked / 1e6).toFixed(2)} AUR`,
        );
        console.log(
          `  Pending Rewards:   ${(stakeState.pendingRewards / 1e9).toFixed(6)} SOL`,
        );
        console.log(`  Staked At Slot:    ${stakeState.stakedAt}`);
      } else {
        console.log(`  Not staking`);
      }
      break;
    }

    case "balance": {
      const bal = await client.getTokenBalance();
      const solBal = await conn.getBalance(wallet.publicKey);
      console.log(
        `  SOL Balance: ${(solBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
      );
      console.log(`  AUR Balance: ${(bal / 1e6).toFixed(2)} AUR`);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  if (err.logs) err.logs.forEach((l: string) => console.error(`  ${l}`));
  process.exit(1);
});
