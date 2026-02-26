use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{derive_ata, require_program_owner, require_pda};

// ================================================================
// STAKE AUR — lock AUR tokens, start earning SOL yield
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
    let staker_ata = next_account_info(account_iter)?;      // source
    let vault_ata = next_account_info(account_iter)?;        // dest
    let token_program = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !staker.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    if amount == 0 {
        return Err(AureusError::InvalidStrategy.into()); // reusing error for zero amount
    }
    // Minimum stake to prevent dust-harvesting rounding exploits
    if amount < ArenaState::MIN_STAKE_AMOUNT {
        msg!("Stake amount {} below minimum {}", amount, ArenaState::MIN_STAKE_AMOUNT);
        return Err(AureusError::InvalidStrategy.into());
    }
    // Validate token program
    if token_program.key != &spl_token::id() {
        return Err(AureusError::InvalidPDA.into());
    }

    require_program_owner(arena_info, program_id)?;
    // Validate arena PDA
    require_pda(arena_info, &[b"arena"], program_id)?;
    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;

    // Derive stake PDA
    let (stake_pda, stake_bump) = Pubkey::find_program_address(
        &[b"stake", staker.key.as_ref()],
        program_id,
    );
    if stake_info.key != &stake_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    // Create or update stake account
    if stake_info.data_len() == 0 {
        // First time staking — create the PDA
        let rent = Rent::get()?;
        let space = StakeState::LEN;
        invoke_signed(
            &system_instruction::create_account(
                staker.key,
                stake_info.key,
                rent.minimum_balance(space),
                space as u64,
                program_id,
            ),
            &[staker.clone(), stake_info.clone(), system_program.clone()],
            &[&[b"stake", staker.key.as_ref(), &[stake_bump]]],
        )?;

        let clock = Clock::get()?;
        let new_staked = amount;
        let stake = StakeState {
            is_initialized: true,
            owner: *staker.key,
            aur_staked: new_staked,
            reward_debt: arena.reward_per_token_cumulative,
            pending_rewards: 0,
            staked_at: clock.slot,
            bump: stake_bump,
        };
        stake.serialize(&mut &mut stake_info.data.borrow_mut()[..])?;

        // Update tier eligibility counters (old_staked was 0)
        if new_staked >= ArenaState::TIER2_STAKE_MIN {
            arena.total_stakers_t2_eligible += 1;
        }
        if new_staked >= ArenaState::TIER3_STAKE_MIN {
            arena.total_stakers_t3_eligible += 1;
        }
    } else {
        // Already staking — accumulate pending rewards first, then add more
        require_program_owner(stake_info, program_id)?;
        let mut stake = StakeState::try_from_slice(&stake_info.data.borrow())?;
        if stake.owner != *staker.key {
            return Err(AureusError::InvalidOwner.into());
        }

        // Use checked_sub for reward calc
        let cumulative_diff = arena.reward_per_token_cumulative
            .checked_sub(stake.reward_debt).unwrap_or(0);
        let pending = (cumulative_diff as u128)
            .checked_mul(stake.aur_staked as u128)
            .unwrap_or(0)
            / ArenaState::REWARD_PRECISION;
        stake.pending_rewards += pending as u64;

        let old_staked = stake.aur_staked;
        stake.aur_staked += amount;
        let new_staked = stake.aur_staked;
        stake.reward_debt = arena.reward_per_token_cumulative;
        // Reset cooldown on every new stake to prevent pre-warming:
        // whale stakes 1 AUR, waits out cooldown, dumps 999K right before scoring
        let clock_restake = Clock::get()?;
        stake.staked_at = clock_restake.slot;
        stake.serialize(&mut &mut stake_info.data.borrow_mut()[..])?;

        // Update tier eligibility counters
        if old_staked < ArenaState::TIER2_STAKE_MIN && new_staked >= ArenaState::TIER2_STAKE_MIN {
            arena.total_stakers_t2_eligible += 1;
        }
        if old_staked < ArenaState::TIER3_STAKE_MIN && new_staked >= ArenaState::TIER3_STAKE_MIN {
            arena.total_stakers_t3_eligible += 1;
        }
    }

    // Validate vault_ata is the correct ATA for the arena PDA + AUR mint.
    // Without this, a compromised front-end could redirect staked AUR to a wrong account,
    // causing permanent loss (unstake would fail due to arena PDA lacking authority).
    {
        let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);
        let expected_vault_ata = derive_ata(&arena_pda, &arena.token_mint);
        if vault_ata.key != &expected_vault_ata {
            msg!("M1: vault_ata {} does not match expected AUR vault ATA {}",
                vault_ata.key, expected_vault_ata);
            return Err(AureusError::InvalidPDA.into());
        }
    }

    // Transfer AUR from staker to vault ATA
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::id(),
            staker_ata.key,
            vault_ata.key,
            staker.key,
            &[],
            amount,
        )?,
        &[
            staker_ata.clone(),
            vault_ata.clone(),
            staker.clone(),
            token_program.clone(),
        ],
        &[],
    )?;

    arena.total_aur_staked += amount;
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("🔒 Staked {} AUR by {}", amount, staker.key);
    Ok(())
}
