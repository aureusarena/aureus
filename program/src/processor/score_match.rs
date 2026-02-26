use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    hash::hash,
    msg,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// SCORE MATCH — compare strategies, distribute SOL+AUR, split protocol rev
// ================================================================
#[inline(never)]
pub fn process(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
    match_index: u32,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let _cranker = next_account_info(account_iter)?;
    // Cranker must be a signer to prevent transaction construction attacks
    if !_cranker.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    let arena_info = next_account_info(account_iter)?;
    let round_info = next_account_info(account_iter)?;
    let commit_a_info = next_account_info(account_iter)?;
    let commit_b_info = next_account_info(account_iter)?;
    let agent_a_info = next_account_info(account_iter)?;
    let agent_b_info = next_account_info(account_iter)?;
    let vault_info = next_account_info(account_iter)?;
    let dev_wallet_info = next_account_info(account_iter)?;

    // Owner checks — all accounts must be program-owned
    require_program_owner(arena_info, _program_id)?;
    require_program_owner(round_info, _program_id)?;
    require_program_owner(commit_a_info, _program_id)?;
    require_program_owner(commit_b_info, _program_id)?;
    require_program_owner(agent_a_info, _program_id)?;
    require_program_owner(agent_b_info, _program_id)?;

    // Validate vault PDA and hardcoded dev wallet
    require_pda(vault_info, &[b"sol_vault"], _program_id)?;
    if dev_wallet_info.key != &ArenaState::DEV_WALLET {
        msg!("Dev wallet mismatch: {} (expected {})",
            dev_wallet_info.key, ArenaState::DEV_WALLET);
        return Err(AureusError::InvalidPDA.into());
    }

    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    // Ensure arena is initialized
    if !arena.is_initialized {
        return Err(AureusError::NotInitialized.into());
    }
    let mut round = RoundState::try_from_slice(&round_info.data.borrow())?;
    if round.round_number != round_number {
        msg!("Score round mismatch: instruction={} vs PDA={}", round_number, round.round_number);
        return Err(AureusError::WrongRound.into());
    }
    let clock = Clock::get()?;
    if !arena.is_reveal_grace_expired(round.round_number, clock.slot) {
        msg!(
            "Round {} reveal grace not expired yet at slot {}",
            round.round_number,
            clock.slot
        );
        return Err(AureusError::RoundNotSettled.into());
    }
    let mut commit_a = CommitState::try_from_slice(&commit_a_info.data.borrow())?;
    let mut commit_b = CommitState::try_from_slice(&commit_b_info.data.borrow())?;
    let mut agent_a = AgentState::try_from_slice(&agent_a_info.data.borrow())?;
    let mut agent_b = AgentState::try_from_slice(&agent_b_info.data.borrow())?;

    // PDA verification (using helper to reduce stack frame)
    require_pda(arena_info, &[b"arena"], _program_id)?;
    let round_bytes = round.round_number.to_le_bytes();
    require_pda(round_info, &[b"round", &round_bytes], _program_id)?;
    require_pda(commit_a_info, &[b"commit", &round_bytes, commit_a.agent.as_ref()], _program_id)?;
    require_pda(commit_b_info, &[b"commit", &round_bytes, commit_b.agent.as_ref()], _program_id)?;
    require_pda(agent_a_info, &[b"agent", commit_a.agent.as_ref()], _program_id)?;
    require_pda(agent_b_info, &[b"agent", commit_b.agent.as_ref()], _program_id)?;

    if !commit_a.revealed || !commit_b.revealed {
        return Err(AureusError::OpponentNotRevealed.into());
    }
    if commit_a.scored || commit_b.scored {
        return Err(AureusError::AlreadyScored.into());
    }

    // === TIER ENFORCEMENT ===
    let tier = commit_a.tier;
    if commit_b.tier != tier {
        msg!("Tier mismatch: A={} B={}", commit_a.tier, commit_b.tier);
        return Err(AureusError::MatchmakingMismatch.into());
    }

    // Generate field weights + matchmaking seed + emission rates (first score_match call per round)
    if round.field_weights == [0u8; 5] {
        // Combine round-end slot with accumulated reveal entropy for unpredictable seed.
        // reveal_entropy = XOR of all commitment hashes (unknown until all reveals land).
        // round_end_slot adds slot-based entropy as a second factor.
        let round_end_slot = arena.round_start_slot(commit_a.round_number)
            + ArenaState::COMMIT_SLOTS + ArenaState::REVEAL_SLOTS;
        let mut seed_input = [0u8; 40]; // 32 bytes entropy + 8 bytes slot
        seed_input[..32].copy_from_slice(&round.reveal_entropy);
        seed_input[32..40].copy_from_slice(&round_end_slot.to_le_bytes());
        let seed_hash = hash(&seed_input);
        round.field_weights = ArenaState::compute_field_weights(&seed_hash.to_bytes());
        round.matchmaking_seed = seed_hash.to_bytes();

        // Compute per-tier emission rates HERE (at scoring time)
        // instead of on first reveal. This ensures emission budget reflects
        // the actual commit counts, and is computed atomically with matchmaking.
        let total_emission = arena.emission_per_round();
        let matches_t1 = round.num_commits_t1 / 2;
        let matches_t2 = round.num_commits_t2 / 2;
        let matches_t3 = round.num_commits_t3 / 2;

        let weighted = (matches_t1 as u64) * ArenaState::TIER1_EMISSION_MULT
            + (matches_t2 as u64) * ArenaState::TIER2_EMISSION_MULT
            + (matches_t3 as u64) * ArenaState::TIER3_EMISSION_MULT;

        if weighted > 0 {
            let base_unit = total_emission / weighted;
            round.emission_per_match_t1 = base_unit * ArenaState::TIER1_EMISSION_MULT;
            round.emission_per_match_t2 = base_unit * ArenaState::TIER2_EMISSION_MULT;
            round.emission_per_match_t3 = base_unit * ArenaState::TIER3_EMISSION_MULT;
            round.emission_per_match = round.emission_per_match_t1;
        }
        msg!("Emission rates set: T1={} T2={} T3={}",
            round.emission_per_match_t1, round.emission_per_match_t2, round.emission_per_match_t3);

        // Check if jackpots trigger this round — per tier with independent entropy
        let base_entropy = seed_hash.to_bytes();
        for t in 0..3u8 {
            // Per-tier entropy — hash(base_entropy || tier) for independent triggers
            let mut tier_input = [0u8; 33];
            tier_input[..32].copy_from_slice(&base_entropy);
            tier_input[32] = t;
            let tier_entropy = hash(&tier_input);
            let tier_entropy_bytes = tier_entropy.to_bytes();

            let sol_jp = arena.sol_jackpot_for_tier(t);
            if ArenaState::check_sol_jackpot(&tier_entropy_bytes) && sol_jp > 0 {
                let drained = arena.drain_sol_jackpot(t);
                match t {
                    0 => round.round_jackpot_sol_t1 += drained,
                    1 => round.round_jackpot_sol_t2 += drained,
                    2 => round.round_jackpot_sol_t3 += drained,
                    _ => {}
                }
                msg!("🎰 T{} SOL JACKPOT TRIGGERED! {} lamports", t, drained);
            }
            let tok_jp = arena.token_jackpot_for_tier(t);
            // For T1, also check swap_fee_aur_jackpot (pre-minted AUR from DLMM fees)
            let swap_fee_extra = if t == 0 { arena.swap_fee_aur_jackpot } else { 0 };
            if ArenaState::check_token_jackpot(&tier_entropy_bytes) && (tok_jp > 0 || swap_fee_extra > 0) {
                let drained = arena.drain_token_jackpot(t);
                // Also drain swap fee AUR into T1 jackpot
                let swap_drained = if t == 0 {
                    let v = arena.swap_fee_aur_jackpot;
                    arena.swap_fee_aur_jackpot = 0;
                    v
                } else { 0 };
                let total_drained = drained + swap_drained;
                match t {
                    0 => {
                        round.round_jackpot_aur_t1 += total_drained;
                        round.round_jackpot_aur_preminted_t1 += swap_drained;
                    },
                    1 => round.round_jackpot_aur_t2 += drained,
                    2 => round.round_jackpot_aur_t3 += drained,
                    _ => {}
                }
                if swap_drained > 0 {
                    msg!("🎰 T{} TOKEN JACKPOT TRIGGERED! {} AUR (+ {} swap fee AUR)", t, drained, swap_drained);
                } else {
                    msg!("🎰 T{} TOKEN JACKPOT TRIGGERED! {} AUR", t, total_drained);
                }
            }
        }

        msg!("Field weights set: {:?}", round.field_weights);
    }

    // === DETERMINISTIC MATCHMAKING — PER TIER with independent seed ===
    let num_commits_tier = round.commits_for_tier(tier);
    // Bounds-check match_index to prevent invalid lookups and wasted compute
    if match_index >= num_commits_tier / 2 {
        msg!("Match index {} out of bounds for T{} ({} commits = {} matches)",
            match_index, tier, num_commits_tier, num_commits_tier / 2);
        return Err(AureusError::MatchmakingMismatch.into());
    }
    // Per-tier seed: hash(matchmaking_seed || tier) so each tier gets independent pairings
    let mut tier_seed_input = [0u8; 33];
    tier_seed_input[..32].copy_from_slice(&round.matchmaking_seed);
    tier_seed_input[32] = tier;
    let tier_seed_hash = hash(&tier_seed_input);
    let tier_seed: [u8; 32] = tier_seed_hash.to_bytes();
    let (expected_a, expected_b) = ArenaState::deterministic_pair(
        &tier_seed,
        num_commits_tier,
        match_index,
    );
    let idx_a = commit_a.commit_index;
    let idx_b = commit_b.commit_index;
    if !((idx_a == expected_a && idx_b == expected_b) || (idx_a == expected_b && idx_b == expected_a)) {
        msg!("Matchmaking mismatch T{}: expected ({}, {}), got ({}, {})",
            tier, expected_a, expected_b, idx_a, idx_b);
        return Err(AureusError::MatchmakingMismatch.into());
    }

    // === SCORE FIELDS ===
    let weights = &round.field_weights;
    let strat_a = commit_a.strategy;
    let strat_b = commit_b.strategy;

    let mut pts_a: u16 = 0;
    let mut pts_b: u16 = 0;

    for i in 0..5 {
        let w = weights[i] as u16;
        if strat_a[i] > strat_b[i] {
            pts_a += w;
        } else if strat_b[i] > strat_a[i] {
            pts_b += w;
        }
    }

    let total_w: u16 = weights.iter().map(|&w| w as u16).sum();
    let threshold = (total_w / 2) + 1;

    // === SOL DISTRIBUTION (tier-specific entry fee) ===
    let entry_fee = ArenaState::entry_fee_for_tier(tier);
    let match_pot = entry_fee * 2;
    let winner_sol = (match_pot * ArenaState::WINNER_CUT_BPS) / 10000;
    let protocol_sol = (match_pot * ArenaState::PROTOCOL_CUT_BPS) / 10000;
    let jackpot_sol = (match_pot * ArenaState::JACKPOT_CUT_BPS) / 10000;

    // === PROTOCOL SOL SPLIT (of the 10%) ===
    let dev_sol = (protocol_sol * ArenaState::PROTO_DEV_BPS) / 10000;
    let staker_sol = (protocol_sol * ArenaState::PROTO_STAKER_BPS) / 10000;
    let proto_jackpot_sol = (protocol_sol * ArenaState::PROTO_JACKPOT_BPS) / 10000;
    let lp_sol = protocol_sol - dev_sol - staker_sol - proto_jackpot_sol;

    // === TOKEN DISTRIBUTION (per-tier emission) ===
    let token_em = round.emission_for_tier(tier);
    let token_winner = (token_em * ArenaState::TOKEN_WINNER_BPS) / 10000;
    let token_loser = (token_em * ArenaState::TOKEN_LOSER_BPS) / 10000;
    let token_jp = (token_em * ArenaState::TOKEN_JACKPOT_BPS) / 10000;

    if pts_a >= threshold {
        // A WINS
        commit_a.result = 1;
        commit_b.result = 0;
        commit_a.sol_won = winner_sol;
        commit_b.sol_won = 0;
        commit_a.tokens_won = token_winner;
        commit_b.tokens_won = token_loser;
        agent_a.record_result(1);
        agent_b.record_result(0);
        agent_a.total_sol_earned += winner_sol;
        agent_a.total_aur_earned += token_winner;
        agent_b.total_aur_earned += token_loser;
        round.num_winners += 1;
        match tier {
            0 => round.num_winners_t1 += 1,
            1 => round.num_winners_t2 += 1,
            2 => round.num_winners_t3 += 1,
            _ => {}
        }

        msg!("Result: A wins ({} vs {}), T{}, SOL: {}, AUR: {}",
            pts_a, pts_b, tier, commit_a.sol_won, commit_a.tokens_won);
    } else if pts_b >= threshold {
        // B WINS
        commit_a.result = 0;
        commit_b.result = 1;
        commit_a.sol_won = 0;
        commit_b.sol_won = winner_sol;
        commit_a.tokens_won = token_loser;
        commit_b.tokens_won = token_winner;
        agent_a.record_result(0);
        agent_b.record_result(1);
        agent_a.total_aur_earned += token_loser;
        agent_b.total_sol_earned += winner_sol;
        agent_b.total_aur_earned += token_winner;
        round.num_winners += 1;
        match tier {
            0 => round.num_winners_t1 += 1,
            1 => round.num_winners_t2 += 1,
            2 => round.num_winners_t3 += 1,
            _ => {}
        }

        msg!("Result: B wins ({} vs {}), T{}, SOL: {}, AUR: {}",
            pts_b, pts_a, tier, commit_b.sol_won, commit_b.tokens_won);
    } else {
        // PUSH — entry fees refunded, token emission → tier-specific jackpot
        commit_a.result = 2;
        commit_b.result = 2;
        commit_a.sol_won = entry_fee;
        commit_b.sol_won = entry_fee;
        commit_a.tokens_won = 0;
        commit_b.tokens_won = 0;
        agent_a.record_result(2);
        agent_b.record_result(2);
        // Push token emission goes to jackpot pool (tracked separately, not freshly minted)
        // We subtract push emission from total_emitted below since nobody earned it
        arena.add_token_jackpot(tier, token_em);
        msg!("Result: Push ({} vs {}), T{}. Full emission → T{} jackpot.", pts_a, pts_b, tier, tier);
    }

    // Record per-tier match for both agents
    agent_a.record_tier_match(tier);
    agent_b.record_tier_match(tier);

    // Opponent references
    commit_a.opponent = commit_b.agent;
    commit_b.opponent = commit_a.agent;
    commit_a.scored = true;
    commit_b.scored = true;

    // === Protocol/jackpot cuts — ONLY on non-push results ===
    // On push, the vault only received 2*entry_fee and must refund
    // exactly that. No protocol revenue, no jackpot SOL on pushes.
    let actual_emission;
    if commit_a.result != 2 {
        // Win/loss — take protocol + jackpot cuts
        arena.add_sol_jackpot(tier, jackpot_sol + proto_jackpot_sol);
        arena.add_token_jackpot(tier, token_jp);
        arena.protocol_revenue += protocol_sol;
        // dev SOL auto-routes to hardcoded wallet (no field tracking needed)
        arena.staker_reward_pool += staker_sol;
        arena.lp_fund += lp_sol;

        // Auto-route dev SOL directly to hardcoded fee wallet
        if dev_sol > 0 {
            **vault_info.try_borrow_mut_lamports()? -= dev_sol;
            **dev_wallet_info.try_borrow_mut_lamports()? += dev_sol;
        }

        // Update staker reward accumulator
        if arena.total_aur_staked > 0 {
            let reward_delta = (staker_sol as u128)
                .checked_mul(ArenaState::REWARD_PRECISION)
                .unwrap_or(0)
                / arena.total_aur_staked as u128;
            arena.reward_per_token_cumulative += reward_delta;
        } else {
            // No stakers — redirect staker SOL to T1 SOL jackpot
            // so funds are never stuck unclaimed in the vault.
            arena.staker_reward_pool = arena.staker_reward_pool.saturating_sub(staker_sol);
            arena.add_sol_jackpot(0, staker_sol);
            msg!("📢 No stakers — {} lamports staker SOL redirected to T1 SOL jackpot", staker_sol);
        }

        actual_emission = commit_a.tokens_won + commit_b.tokens_won + token_jp;
    } else {
        // Push — only token emission goes to jackpot, NO SOL cuts
        actual_emission = token_em;
    }
    arena.total_emitted += actual_emission;
    round.num_scored += 1;
    // Don't increment total_rounds per match — tracked in first commit

    // After all matches scored, recycle jackpot dust back into arena.
    // Floor division (round_jackpot / num_winners) loses remainder lamports.
    // Once all matches are scored, num_winners is final — trim round jackpots
    // to be evenly divisible and put remainder back into arena jackpot pool.
    let total_matches = round.num_commits / 2;  // total committed pairs
    if round.num_scored == total_matches {
        for t in 0..3u8 {
            let winners = round.winners_for_tier(t) as u64;
            if winners > 0 {
                let jp_sol = round.round_jackpot_sol_for_tier(t);
                let jp_aur = round.round_jackpot_aur_for_tier(t);
                let sol_dust = jp_sol % winners;
                let aur_dust = jp_aur % winners;
                if sol_dust > 0 {
                    // Trim round jackpot and recycle to arena
                    match t {
                        0 => round.round_jackpot_sol_t1 -= sol_dust,
                        1 => round.round_jackpot_sol_t2 -= sol_dust,
                        2 => round.round_jackpot_sol_t3 -= sol_dust,
                        _ => {}
                    }
                    arena.add_sol_jackpot(t, sol_dust);
                }
                if aur_dust > 0 {
                    match t {
                        0 => round.round_jackpot_aur_t1 -= aur_dust,
                        1 => round.round_jackpot_aur_t2 -= aur_dust,
                        2 => round.round_jackpot_aur_t3 -= aur_dust,
                        _ => {}
                    }
                    arena.add_token_jackpot(t, aur_dust);
                }
                if sol_dust > 0 || aur_dust > 0 {
                    msg!("♻️ T{} jackpot dust recycled: {} SOL + {} AUR → next jackpot",
                        t, sol_dust, aur_dust);
                }
            }
        }
    }

    // Check era advancement
    if arena.should_advance_era() {
        arena.current_era += 1;
        msg!("📉 ERA ADVANCED to {}! Emission halved to {} AUR/round",
            arena.current_era, arena.emission_per_round());
    }

    // Serialize all
    commit_a.serialize(&mut &mut commit_a_info.data.borrow_mut()[..])?;
    commit_b.serialize(&mut &mut commit_b_info.data.borrow_mut()[..])?;
    agent_a.serialize(&mut &mut agent_a_info.data.borrow_mut()[..])?;
    agent_b.serialize(&mut &mut agent_b_info.data.borrow_mut()[..])?;
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;
    round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;

    Ok(())
}
