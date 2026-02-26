use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// CLAIM STAKE REWARDS — claim SOL without unstaking AUR
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let staker = next_account_info(account_iter)?;
    let stake_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let sol_vault = next_account_info(account_iter)?;

    if !staker.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    require_program_owner(arena_info, program_id)?;
    require_program_owner(stake_info, program_id)?;
    // Validate arena and stake PDAs
    require_pda(arena_info, &[b"arena"], program_id)?;
    require_pda(stake_info, &[b"stake", staker.key.as_ref()], program_id)?;
    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    let mut stake = StakeState::try_from_slice(&stake_info.data.borrow())?;

    if stake.owner != *staker.key {
        return Err(AureusError::InvalidOwner.into());
    }

    // Anti-sniping cooldown: cannot claim rewards until cooldown expires
    let clock = Clock::get()?;
    if clock.slot < stake.staked_at.saturating_add(ArenaState::STAKE_COOLDOWN_SLOTS) {
        let remaining = stake.staked_at.saturating_add(ArenaState::STAKE_COOLDOWN_SLOTS)
            .saturating_sub(clock.slot);
        msg!("Stake cooldown active: {} slots remaining", remaining);
        return Err(AureusError::StakeCooldownActive.into());
    }

    // Verify vault PDA
    let (vault_pda, _) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if sol_vault.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    // Use checked_sub for reward calc
    let cumulative_diff = arena.reward_per_token_cumulative
        .checked_sub(stake.reward_debt).unwrap_or(0);
    let pending = (cumulative_diff as u128)
        .checked_mul(stake.aur_staked as u128)
        .unwrap_or(0)
        / ArenaState::REWARD_PRECISION;
    let total_rewards = stake.pending_rewards + pending as u64;

    if total_rewards == 0 {
        msg!("No rewards to claim");
        return Ok(());
    }

    // Pay out SOL rewards with rent-exempt guard
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(sol_vault.data_len());
    let available = sol_vault.lamports().saturating_sub(min_balance);
    let actual_payout = total_rewards.min(available).min(arena.staker_reward_pool);
    if actual_payout > 0 {
        **sol_vault.try_borrow_mut_lamports()? -= actual_payout;
        **staker.try_borrow_mut_lamports()? += actual_payout;
        // Track staker reward pool outflow
        arena.staker_reward_pool = arena.staker_reward_pool.saturating_sub(actual_payout);
    }
    if actual_payout < total_rewards {
        stake.pending_rewards = total_rewards - actual_payout;
        msg!("⚠️ Partial staking payout: {} of {} (vault at rent minimum)",
            actual_payout, total_rewards);
    }

    // Update stake state — keep remainder if partial payout
    if actual_payout >= total_rewards {
        stake.pending_rewards = 0;
    }
    // else: pending_rewards was already set above in partial branch
    stake.reward_debt = arena.reward_per_token_cumulative;
    stake.serialize(&mut &mut stake_info.data.borrow_mut()[..])?;
    // Persist updated staker_reward_pool
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("💎 Claimed {} SOL staking rewards for {}", total_rewards, staker.key);
    Ok(())
}
