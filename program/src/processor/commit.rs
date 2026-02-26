use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// COMMIT — SOL entry fee + strategy hash (tier-aware)
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
    commitment: [u8; 32],
    tier: u8,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let agent_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let round_info = next_account_info(account_iter)?;
    let commit_info = next_account_info(account_iter)?;
    let vault_info = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;
    let stake_info = next_account_info(account_iter)?; // StakePDA for tier validation

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    // Validate tier value
    if tier > 2 {
        return Err(AureusError::InvalidTier.into());
    }

    // Verify agent (owner check)
    require_program_owner(agent_info, program_id)?;
    let agent = AgentState::try_from_slice(&agent_info.data.borrow())?;
    if !agent.is_initialized || agent.authority != *authority.key {
        return Err(AureusError::NotInitialized.into());
    }

    // Verify timing (owner check)
    require_program_owner(arena_info, program_id)?;
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    let clock = Clock::get()?;
    let expected_round = arena.round_for_slot(clock.slot);
    if round_number != expected_round {
        return Err(AureusError::WrongRound.into());
    }
    if !arena.is_commit_phase(clock.slot) {
        return Err(AureusError::NotCommitPhase.into());
    }

    // Validate vault PDA to ensure entry fees go to correct destination
    require_pda(vault_info, &[b"sol_vault"], program_id)?;

    // === TIER VALIDATION ===
    // Check tier is unlocked (enough eligible stakers)
    if !arena.is_tier_unlocked(tier) {
        msg!("Tier {} not unlocked. T2 eligible: {}, T3 eligible: {}",
            tier, arena.total_stakers_t2_eligible, arena.total_stakers_t3_eligible);
        return Err(AureusError::TierNotUnlocked.into());
    }

    // Check staking requirement for tier > 0
    let stake_min = ArenaState::stake_min_for_tier(tier);
    if stake_min > 0 {
        // Verify stake PDA
        let (stake_pda, _) = Pubkey::find_program_address(
            &[b"stake", authority.key.as_ref()],
            program_id,
        );
        if stake_info.key != &stake_pda {
            return Err(AureusError::InvalidPDA.into());
        }
        if stake_info.data_len() == 0 {
            msg!("No stake account — cannot play tier {}", tier);
            return Err(AureusError::InsufficientStakeForTier.into());
        }
        require_program_owner(stake_info, program_id)?;
        let stake = StakeState::try_from_slice(&stake_info.data.borrow())?;
        if stake.aur_staked < stake_min {
            msg!("Staked {} < required {} for tier {}",
                stake.aur_staked, stake_min, tier);
            return Err(AureusError::InsufficientStakeForTier.into());
        }
    }

    // Check match requirements
    if tier == 1 {
        // Tier 2 requires 50+ matches at T1
        if agent.matches_t1 < ArenaState::TIER2_MATCHES_MIN {
            msg!("Only {} T1 matches, need {} for tier 2",
                agent.matches_t1, ArenaState::TIER2_MATCHES_MIN);
            return Err(AureusError::InsufficientMatchesForTier.into());
        }
    } else if tier == 2 {
        // Tier 3 requires proven win rate at T2
        if agent.win_rate() < ArenaState::TIER3_WIN_RATE_MIN {
            msg!("Win rate {} < required {} for tier 3",
                agent.win_rate(), ArenaState::TIER3_WIN_RATE_MIN);
            return Err(AureusError::InsufficientWinRate.into());
        }
    }

    // Get tier-specific entry fee
    let entry_fee = ArenaState::entry_fee_for_tier(tier);

    // Create commit PDA (fails if exists = double commit prevention)
    let round_bytes = round_number.to_le_bytes();
    let (commit_pda, commit_bump) = Pubkey::find_program_address(
        &[b"commit", &round_bytes, authority.key.as_ref()],
        program_id,
    );
    if commit_info.key != &commit_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    let rent = Rent::get()?;
    let space = CommitState::LEN;
    invoke_signed(
        &system_instruction::create_account(
            authority.key,
            commit_info.key,
            rent.minimum_balance(space),
            space as u64,
            program_id,
        ),
        &[authority.clone(), commit_info.clone(), system_program.clone()],
        &[&[b"commit", &round_bytes, authority.key.as_ref(), &[commit_bump]]],
    )?;

    // Use invoke (not invoke_signed) — authority is a normal signer
    invoke(
        &system_instruction::transfer(authority.key, vault_info.key, entry_fee),
        &[authority.clone(), vault_info.clone(), system_program.clone()],
    )?;

    // Read current round to get per-tier commit count for index assignment
    let current_commit_index = if round_info.data_len() > 0 {
        let rd = RoundState::try_from_slice(&round_info.data.borrow())?;
        rd.commits_for_tier(tier) // per-tier 0-based index
    } else {
        0u32
    };

    // Initialize commit with tier
    let commit = CommitState {
        is_initialized: true,
        agent: *authority.key,
        round_number,
        commitment,
        revealed: false,
        strategy: [0u8; 5],
        opponent: Pubkey::default(),
        scored: false,
        result: 255,
        sol_won: 0,
        tokens_won: 0,
        claimed: false,
        bump: commit_bump,
        jackpot_sol_won: 0,
        jackpot_tokens_won: 0,
        commit_index: current_commit_index,
        tier,
    };
    commit.serialize(&mut &mut commit_info.data.borrow_mut()[..])?;

    // Init or update round state
    let (round_pda, round_bump) = Pubkey::find_program_address(
        &[b"round", &round_bytes],
        program_id,
    );
    if round_info.key != &round_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    if round_info.data_len() == 0 {
        let round_space = RoundState::LEN;
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                round_info.key,
                rent.minimum_balance(round_space),
                round_space as u64,
                program_id,
            ),
            &[authority.clone(), round_info.clone(), system_program.clone()],
            &[&[b"round", &round_bytes, &[round_bump]]],
        )?;

        let mut round = RoundState {
            is_initialized: true,
            round_number,
            num_commits: 1,
            num_reveals: 0,
            num_scored: 0,
            matchmaking_done: false,
            matchmaking_seed: [0u8; 32],
            field_weights: [0u8; 5],
            total_pot: entry_fee,
            emission_per_match: 0,
            bump: round_bump,
            num_winners: 0,
            round_jackpot_sol: 0,
            round_jackpot_aur: 0,
            num_commits_t1: 0,
            num_commits_t2: 0,
            num_commits_t3: 0,
            total_pot_t1: 0,
            total_pot_t2: 0,
            total_pot_t3: 0,
            emission_per_match_t1: 0,
            emission_per_match_t2: 0,
            emission_per_match_t3: 0,
            round_jackpot_sol_t1: 0,
            round_jackpot_sol_t2: 0,
            round_jackpot_sol_t3: 0,
            round_jackpot_aur_t1: 0,
            round_jackpot_aur_t2: 0,
            round_jackpot_aur_t3: 0,
            num_winners_t1: 0,
            num_winners_t2: 0,
            num_winners_t3: 0,
            reveal_entropy: [0u8; 32],
            round_jackpot_aur_preminted_t1: 0,
        };
        // Set the per-tier counts for this first commit
        match tier {
            0 => { round.num_commits_t1 = 1; round.total_pot_t1 = entry_fee; }
            1 => { round.num_commits_t2 = 1; round.total_pot_t2 = entry_fee; }
            2 => { round.num_commits_t3 = 1; round.total_pot_t3 = entry_fee; }
            _ => {}
        }
        round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;

        // Increment total_rounds once per round (first commit creates round)
        let mut arena_mut = ArenaState::try_from_slice(&arena_info.data.borrow())?;
        arena_mut.total_rounds += 1;
        arena_mut.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;
    } else {
        let mut round = RoundState::try_from_slice(&round_info.data.borrow())?;
        round.num_commits += 1;
        round.total_pot += entry_fee;
        // Update per-tier counts
        match tier {
            0 => { round.num_commits_t1 += 1; round.total_pot_t1 += entry_fee; }
            1 => { round.num_commits_t2 += 1; round.total_pot_t2 += entry_fee; }
            2 => { round.num_commits_t3 += 1; round.total_pot_t3 += entry_fee; }
            _ => {}
        }
        round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;
    }

    msg!("Commit: agent={}, round={}, tier={}", authority.key, round_number, tier);
    Ok(())
}
