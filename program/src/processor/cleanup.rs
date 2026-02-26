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
// CLEANUP — handle unrevealed commits after grace period expires
//
// Three cases:
//   1. Neither agent revealed → refund both (systemic issue / congestion)
//   2. One revealed, one didn't → revealer auto-wins, non-revealer slashed
//   3. Both revealed → error, should use ScoreMatch instead
//
// Accounts:
//   0: anyone (signer)
//   1: arena (writable)
//   2: round (readable)
//   3: commit_a (writable)
//   4: commit_b (writable)
//   5: agent_a (writable) — agent PDA for commit_a's owner
//   6: agent_b (writable) — agent PDA for commit_b's owner
//   7: vault (writable) — for refunds
// ================================================================
#[inline(never)]
pub fn process(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
    match_index: u32,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let _anyone = next_account_info(account_iter)?;
    if !_anyone.is_signer {
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

    // Owner checks
    require_program_owner(arena_info, _program_id)?;
    require_program_owner(round_info, _program_id)?;
    require_program_owner(commit_a_info, _program_id)?;
    require_program_owner(commit_b_info, _program_id)?;
    require_program_owner(agent_a_info, _program_id)?;
    require_program_owner(agent_b_info, _program_id)?;

    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    // Ensure arena is initialized
    if !arena.is_initialized {
        return Err(AureusError::NotInitialized.into());
    }
    let clock = Clock::get()?;

    // Must wait for reveal grace period to fully expire
    if !arena.is_reveal_grace_expired(round_number, clock.slot) {
        return Err(AureusError::RoundNotOver.into());
    }

    let mut commit_a = CommitState::try_from_slice(&commit_a_info.data.borrow())?;
    let mut commit_b = CommitState::try_from_slice(&commit_b_info.data.borrow())?;

    // PDA verification including round_info
    require_pda(arena_info, &[b"arena"], _program_id)?;
    let round_bytes = round_number.to_le_bytes();
    require_pda(round_info, &[b"round", &round_bytes], _program_id)?;
    require_pda(commit_a_info, &[b"commit", &round_bytes, commit_a.agent.as_ref()], _program_id)?;
    require_pda(commit_b_info, &[b"commit", &round_bytes, commit_b.agent.as_ref()], _program_id)?;
    require_pda(agent_a_info, &[b"agent", commit_a.agent.as_ref()], _program_id)?;
    require_pda(agent_b_info, &[b"agent", commit_b.agent.as_ref()], _program_id)?;
    // Validate vault PDA (previously unused and unvalidated)
    require_pda(vault_info, &[b"sol_vault"], _program_id)?;
    // Validate hardcoded dev wallet
    if dev_wallet_info.key != &ArenaState::DEV_WALLET {
        msg!("Dev wallet mismatch: {} (expected {})",
            dev_wallet_info.key, ArenaState::DEV_WALLET);
        return Err(AureusError::InvalidPDA.into());
    }

    // Both must be unscored
    if commit_a.scored || commit_b.scored {
        return Err(AureusError::AlreadyScored.into());
    }

    let mut agent_a = AgentState::try_from_slice(&agent_a_info.data.borrow())?;
    let mut agent_b = AgentState::try_from_slice(&agent_b_info.data.borrow())?;

    // Verify both commits are for the same tier
    let tier = commit_a.tier;
    if commit_a.tier != commit_b.tier {
        msg!("Cleanup tier mismatch: A={} B={}", commit_a.tier, commit_b.tier);
        return Err(AureusError::MatchmakingMismatch.into());
    }

    // === Verify commits are a valid matchmaking pair ===
    // Read round state to get the matchmaking seed and commit counts
    // Make round mutable so we can increment num_scored
    let mut round = RoundState::try_from_slice(&round_info.data.borrow())?;
    let num_commits_tier = round.commits_for_tier(tier);

    // Compute canonical seed exactly as process_score_match does.
    let matchmaking_seed = if round.matchmaking_seed != [0u8; 32] {
        round.matchmaking_seed
    } else {
        let round_end_slot = arena.round_start_slot(round.round_number)
            + ArenaState::COMMIT_SLOTS + ArenaState::REVEAL_SLOTS;
        let mut seed_input = [0u8; 40];
        seed_input[..32].copy_from_slice(&round.reveal_entropy);
        seed_input[32..40].copy_from_slice(&round_end_slot.to_le_bytes());
        let seed = hash(&seed_input).to_bytes();
        round.matchmaking_seed = seed;
        seed
    };

    // Compute tier-specific matchmaking seed (same as process_score_match)
    let mut tier_seed_input = [0u8; 33];
    tier_seed_input[..32].copy_from_slice(&matchmaking_seed);
    tier_seed_input[32] = tier;
    let tier_seed_hash = hash(&tier_seed_input);
    let tier_seed: [u8; 32] = tier_seed_hash.to_bytes();

    // O(1) matchmaking verification using match_index (same as ScoreMatch)
    let num_matches = num_commits_tier / 2;
    if match_index >= num_matches {
        msg!("Cleanup match_index {} out of bounds for T{} ({} commits = {} matches)",
            match_index, tier, num_commits_tier, num_matches);
        return Err(AureusError::MatchmakingMismatch.into());
    }
    let (expected_a, expected_b) = ArenaState::deterministic_pair(
        &tier_seed, num_commits_tier, match_index,
    );
    let idx_a = commit_a.commit_index;
    let idx_b = commit_b.commit_index;
    if !((idx_a == expected_a && idx_b == expected_b) || (idx_a == expected_b && idx_b == expected_a)) {
        msg!("Cleanup matchmaking mismatch T{}: expected ({}, {}), got ({}, {})",
            tier, expected_a, expected_b, idx_a, idx_b);
        return Err(AureusError::MatchmakingMismatch.into());
    }

    let entry_fee = ArenaState::entry_fee_for_tier(tier);

    if !commit_a.revealed && !commit_b.revealed {
        commit_a.scored = true;
        commit_a.result = 255; // void / no contest
        commit_a.sol_won = entry_fee; // full refund
        commit_a.tokens_won = 0;

        commit_b.scored = true;
        commit_b.result = 255; // void / no contest
        commit_b.sol_won = entry_fee; // full refund
        commit_b.tokens_won = 0;

        commit_a.serialize(&mut &mut commit_a_info.data.borrow_mut()[..])?;
        commit_b.serialize(&mut &mut commit_b_info.data.borrow_mut()[..])?;

        // Increment num_scored so jackpot dust recycling triggers correctly
        round.num_scored += 1;
        round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;

        msg!("🔄 REFUND: Neither {} nor {} revealed in round {} T{} — match voided",
            commit_a.agent, commit_b.agent, round_number, tier);
        return Ok(());
    }

    // === Compute AUR emission for cleanup auto-win ===
    // Winner gets 65% of match emission, remaining 35% → tier jackpot
    let token_em = {
        let em = round.emission_for_tier(tier);
        if em > 0 {
            em
        } else {
            // Emission rates not yet computed (no ScoreMatch in this round)
            // Compute inline using same formula as process_score_match
            let total_emission = arena.emission_per_round();
            let matches_t1 = round.num_commits_t1 / 2;
            let matches_t2 = round.num_commits_t2 / 2;
            let matches_t3 = round.num_commits_t3 / 2;
            let weighted = (matches_t1 as u64) * ArenaState::TIER1_EMISSION_MULT
                + (matches_t2 as u64) * ArenaState::TIER2_EMISSION_MULT
                + (matches_t3 as u64) * ArenaState::TIER3_EMISSION_MULT;
            if weighted > 0 {
                let base_unit = total_emission / weighted;
                base_unit * ArenaState::emission_mult_for_tier(tier)
            } else {
                0
            }
        }
    };
    let token_winner_amount = (token_em * ArenaState::TOKEN_WINNER_BPS) / 10000;
    let token_to_jackpot = token_em.saturating_sub(token_winner_amount);

    // === CASE 2: One revealed, one didn't → SLASH non-revealer ===
    if commit_a.revealed && !commit_b.revealed {
        // A is winner, B is loser
        // Full match pot (2× fee) — same distribution as normal ScoreMatch.
        // Prevents colluders from avoiding protocol cut by having one not reveal.
        let match_pot = entry_fee * 2;
        let winner_sol = (match_pot * ArenaState::WINNER_CUT_BPS) / 10000;
        let protocol_sol = (match_pot * ArenaState::PROTOCOL_CUT_BPS) / 10000;
        let jackpot_sol = (match_pot * ArenaState::JACKPOT_CUT_BPS) / 10000;
        let dev_sol = (protocol_sol * ArenaState::PROTO_DEV_BPS) / 10000;
        let staker_sol = (protocol_sol * ArenaState::PROTO_STAKER_BPS) / 10000;
        let proto_jp = (protocol_sol * ArenaState::PROTO_JACKPOT_BPS) / 10000;
        let lp_sol = protocol_sol - dev_sol - staker_sol - proto_jp;

        commit_a.scored = true;
        commit_a.result = 1;
        commit_a.sol_won = winner_sol;
        commit_a.tokens_won = token_winner_amount;  // 65% AUR emission
        agent_a.record_result(1);
        agent_a.total_sol_earned += commit_a.sol_won;
        agent_a.total_aur_earned += token_winner_amount;
        agent_a.record_tier_match(tier);

        commit_b.scored = true;
        commit_b.result = 0;
        commit_b.sol_won = 0;
        commit_b.tokens_won = 0;
        commit_b.claimed = true;
        agent_b.record_result(0);
        agent_b.record_tier_match(tier);

        // Track cleanup winner for jackpot distribution
        round.num_winners += 1;
        match tier {
            0 => round.num_winners_t1 += 1,
            1 => round.num_winners_t2 += 1,
            2 => round.num_winners_t3 += 1,
            _ => {}
        }

        commit_a.serialize(&mut &mut commit_a_info.data.borrow_mut()[..])?;
        commit_b.serialize(&mut &mut commit_b_info.data.borrow_mut()[..])?;
        agent_a.serialize(&mut &mut agent_a_info.data.borrow_mut()[..])?;
        agent_b.serialize(&mut &mut agent_b_info.data.borrow_mut()[..])?;

        arena.add_sol_jackpot(tier, jackpot_sol + proto_jp);
        arena.add_token_jackpot(tier, token_to_jackpot);  // 35% → jackpot
        arena.total_emitted += token_em;  // track emission
        arena.protocol_revenue += protocol_sol;
        // dev SOL auto-routes to hardcoded wallet (no field tracking needed)
        arena.staker_reward_pool += staker_sol;
        arena.lp_fund += lp_sol;

        // Auto-route dev SOL directly to hardcoded fee wallet
        if dev_sol > 0 {
            **vault_info.try_borrow_mut_lamports()? -= dev_sol;
            **dev_wallet_info.try_borrow_mut_lamports()? += dev_sol;
        }

        // Update staker reward accumulator so cleanup revenue is claimable
        if arena.total_aur_staked > 0 {
            let reward_delta = (staker_sol as u128)
                .checked_mul(ArenaState::REWARD_PRECISION)
                .unwrap_or(0)
                / arena.total_aur_staked as u128;
            arena.reward_per_token_cumulative += reward_delta;
        }

        msg!("⚡ CLEANUP: {} auto-wins (SOL:{} AUR:{}), {} slashed in round {} T{}",
            commit_a.agent, commit_a.sol_won, token_winner_amount,
            commit_b.agent, round_number, tier);
    } else if commit_b.revealed && !commit_a.revealed {
        // B is winner, A is loser
        // Full match pot (2× fee) — same distribution as normal ScoreMatch.
        let match_pot = entry_fee * 2;
        let winner_sol = (match_pot * ArenaState::WINNER_CUT_BPS) / 10000;
        let protocol_sol = (match_pot * ArenaState::PROTOCOL_CUT_BPS) / 10000;
        let jackpot_sol = (match_pot * ArenaState::JACKPOT_CUT_BPS) / 10000;
        let dev_sol = (protocol_sol * ArenaState::PROTO_DEV_BPS) / 10000;
        let staker_sol = (protocol_sol * ArenaState::PROTO_STAKER_BPS) / 10000;
        let proto_jp = (protocol_sol * ArenaState::PROTO_JACKPOT_BPS) / 10000;
        let lp_sol = protocol_sol - dev_sol - staker_sol - proto_jp;

        commit_b.scored = true;
        commit_b.result = 1;
        commit_b.sol_won = winner_sol;
        commit_b.tokens_won = token_winner_amount;  // 65% AUR emission
        agent_b.record_result(1);
        agent_b.total_sol_earned += commit_b.sol_won;
        agent_b.total_aur_earned += token_winner_amount;
        agent_b.record_tier_match(tier);

        commit_a.scored = true;
        commit_a.result = 0;
        commit_a.sol_won = 0;
        commit_a.tokens_won = 0;
        commit_a.claimed = true;
        agent_a.record_result(0);
        agent_a.record_tier_match(tier);

        // Track cleanup winner for jackpot distribution
        round.num_winners += 1;
        match tier {
            0 => round.num_winners_t1 += 1,
            1 => round.num_winners_t2 += 1,
            2 => round.num_winners_t3 += 1,
            _ => {}
        }

        commit_a.serialize(&mut &mut commit_a_info.data.borrow_mut()[..])?;
        commit_b.serialize(&mut &mut commit_b_info.data.borrow_mut()[..])?;
        agent_a.serialize(&mut &mut agent_a_info.data.borrow_mut()[..])?;
        agent_b.serialize(&mut &mut agent_b_info.data.borrow_mut()[..])?;

        arena.add_sol_jackpot(tier, jackpot_sol + proto_jp);
        arena.add_token_jackpot(tier, token_to_jackpot);  // 35% → jackpot
        arena.total_emitted += token_em;  // track emission
        arena.protocol_revenue += protocol_sol;
        // dev SOL auto-routes to hardcoded wallet (no field tracking needed)
        arena.staker_reward_pool += staker_sol;
        arena.lp_fund += lp_sol;

        // Auto-route dev SOL directly to hardcoded fee wallet
        if dev_sol > 0 {
            **vault_info.try_borrow_mut_lamports()? -= dev_sol;
            **dev_wallet_info.try_borrow_mut_lamports()? += dev_sol;
        }

        // Update staker reward accumulator so cleanup revenue is claimable
        if arena.total_aur_staked > 0 {
            let reward_delta = (staker_sol as u128)
                .checked_mul(ArenaState::REWARD_PRECISION)
                .unwrap_or(0)
                / arena.total_aur_staked as u128;
            arena.reward_per_token_cumulative += reward_delta;
        }

        msg!("⚡ CLEANUP: {} auto-wins (SOL:{} AUR:{}), {} slashed in round {} T{}",
            commit_b.agent, commit_b.sol_won, token_winner_amount,
            commit_a.agent, round_number, tier);
    } else {
        // Both revealed but unscored — should use ScoreMatch, not Cleanup
        msg!("Both agents revealed. Use ScoreMatch instruction instead.");
        return Err(AureusError::AlreadyRevealed.into());
    }

    // Check era advancement after emission
    if arena.should_advance_era() {
        arena.current_era += 1;
        msg!("📉 ERA ADVANCED to {}! Emission halved to {} AUR/round",
            arena.current_era, arena.emission_per_round());
    }
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    // Increment num_scored so jackpot dust recycling triggers correctly
    round.num_scored += 1;
    round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;

    Ok(())
}
