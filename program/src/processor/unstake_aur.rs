use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// UNSTAKE AUR — return AUR + claim pending SOL rewards
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let staker = next_account_info(account_iter)?;
    let stake_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let staker_ata = next_account_info(account_iter)?;      // dest for AUR
    let vault_ata = next_account_info(account_iter)?;        // source for AUR
    let sol_vault = next_account_info(account_iter)?;        // source for SOL rewards
    let token_program = next_account_info(account_iter)?;

    if !staker.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    // Validate token program
    if token_program.key != &spl_token::id() {
        return Err(AureusError::InvalidPDA.into());
    }

    require_program_owner(arena_info, program_id)?;
    require_program_owner(stake_info, program_id)?;
    // Validate sol_vault PDA — previously missing, allowing potential
    // lamport manipulation on unverified accounts
    require_pda(sol_vault, &[b"sol_vault"], program_id)?;
    // Validate arena and stake PDAs
    require_pda(arena_info, &[b"arena"], program_id)?;
    require_pda(stake_info, &[b"stake", staker.key.as_ref()], program_id)?;
    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    let mut stake = StakeState::try_from_slice(&stake_info.data.borrow())?;

    if stake.owner != *staker.key {
        return Err(AureusError::InvalidOwner.into());
    }
    if amount > stake.aur_staked {
        return Err(AureusError::Overflow.into());
    }

    // Anti-sniping cooldown: cannot unstake until cooldown expires
    let clock = Clock::get()?;
    if clock.slot < stake.staked_at.saturating_add(ArenaState::STAKE_COOLDOWN_SLOTS) {
        let remaining = stake.staked_at.saturating_add(ArenaState::STAKE_COOLDOWN_SLOTS)
            .saturating_sub(clock.slot);
        msg!("Stake cooldown active: {} slots remaining", remaining);
        return Err(AureusError::StakeCooldownActive.into());
    }

    // Use checked_sub for reward calc to prevent underflow
    let cumulative_diff = arena.reward_per_token_cumulative
        .checked_sub(stake.reward_debt).unwrap_or(0);
    let pending = (cumulative_diff as u128)
        .checked_mul(stake.aur_staked as u128)
        .unwrap_or(0)
        / ArenaState::REWARD_PRECISION;
    let total_rewards = stake.pending_rewards + pending as u64;
    let mut actual_payout = 0u64;

    // Pay out SOL rewards from vault with rent-exempt guard
    if total_rewards > 0 {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(sol_vault.data_len());
        let available = sol_vault.lamports().saturating_sub(min_balance);
        actual_payout = total_rewards.min(available).min(arena.staker_reward_pool);
        if actual_payout > 0 {
            **sol_vault.try_borrow_mut_lamports()? -= actual_payout;
            **staker.try_borrow_mut_lamports()? += actual_payout;
            // Track staker reward pool outflow
            arena.staker_reward_pool = arena.staker_reward_pool.saturating_sub(actual_payout);
        }
        if actual_payout < total_rewards {
            msg!("⚠️ Partial staking payout: {} of {} (vault at rent minimum)",
                actual_payout, total_rewards);
        } else {
            msg!("💎 Claimed {} SOL staking rewards", actual_payout);
        }
    }

    // Transfer AUR back from vault ATA to staker
    // The arena PDA is the authority over the vault ATA
    let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::id(),
            vault_ata.key,
            staker_ata.key,
            &arena_pda,
            &[],
            amount,
        )?,
        &[
            vault_ata.clone(),
            staker_ata.clone(),
            arena_info.clone(),
            token_program.clone(),
        ],
        &[&[b"arena", &[arena.bump]]],
    )?;

    // Update state
    let old_staked = stake.aur_staked;
    stake.aur_staked -= amount;
    let new_staked = stake.aur_staked;
    stake.pending_rewards = total_rewards.saturating_sub(actual_payout);
    stake.reward_debt = arena.reward_per_token_cumulative;
    stake.serialize(&mut &mut stake_info.data.borrow_mut()[..])?;

    // Update tier eligibility counters (decrement if dropped below threshold)
    if old_staked >= ArenaState::TIER2_STAKE_MIN && new_staked < ArenaState::TIER2_STAKE_MIN {
        arena.total_stakers_t2_eligible = arena.total_stakers_t2_eligible.saturating_sub(1);
    }
    if old_staked >= ArenaState::TIER3_STAKE_MIN && new_staked < ArenaState::TIER3_STAKE_MIN {
        arena.total_stakers_t3_eligible = arena.total_stakers_t3_eligible.saturating_sub(1);
    }

    arena.total_aur_staked -= amount;
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("🔓 Unstaked {} AUR, claimed {} SOL rewards for {}",
        amount, actual_payout, staker.key);
    Ok(())
}
