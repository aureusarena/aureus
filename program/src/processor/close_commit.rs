use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

/// Number of rounds after which a commit can be force-closed
/// without claiming.
const STALE_ROUND_THRESHOLD: u64 = 100;

// ================================================================
// CLOSE COMMIT — reclaim rent + refund entry fees from old commits
//   Only the commit owner (signer) can close their own commit.
//
//   Case 1: Claimed commit (2 accounts)
//     → Reclaim rent only. Winnings already paid out.
//
//   Case 2: Stale unclaimed + SCORED commit (3 accounts)
//     → Reclaim rent. Forfeited winnings stay in vault.
//       (They chose not to claim — that's on them.)
//
//   Case 3: Stale unclaimed + UNSCORED commit (4 accounts)
//     → Reclaim rent + REFUND entry fee from vault.
//       Match never happened, so their entry fee is returned.
//
//   Accounts:
//     0. [signer, writable] authority (commit owner)
//     1. [writable]         commit PDA
//     2. []                 arena PDA   (required if unclaimed)
//     3. [writable]         vault PDA   (required if unscored — for refund)
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let commit_info = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    require_program_owner(commit_info, program_id)?;
    let round_bytes = round_number.to_le_bytes();
    require_pda(commit_info, &[b"commit", &round_bytes, authority.key.as_ref()], program_id)?;

    let commit = CommitState::try_from_slice(&commit_info.data.borrow())?;

    // Only the commit owner can close it
    if commit.agent != *authority.key {
        return Err(AureusError::InvalidOwner.into());
    }

    // If not yet claimed, check staleness and handle refund
    if !commit.claimed {
        let arena_info = next_account_info(account_iter)?;
        require_program_owner(arena_info, program_id)?;
        require_pda(arena_info, &[b"arena"], program_id)?;

        let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
        let clock = Clock::get()?;
        let current_round = arena.round_for_slot(clock.slot);

        if current_round < round_number || current_round - round_number < STALE_ROUND_THRESHOLD {
            msg!("Cannot close fresh unclaimed commit — claim winnings first (round {} is only {} rounds behind current {})",
                round_number, current_round.saturating_sub(round_number), current_round);
            return Err(AureusError::NotScored.into());
        }

        // If unscored, refund the entry fee from the vault
        if !commit.scored {
            let vault_info = next_account_info(account_iter)?;
            require_program_owner(vault_info, program_id)?;
            require_pda(vault_info, &[b"sol_vault"], program_id)?;

            let entry_fee = ArenaState::entry_fee_for_tier(commit.tier);

            // Protect vault rent-exemption
            let rent = Rent::get()?;
            let min_balance = rent.minimum_balance(vault_info.data_len());
            let vault_balance = vault_info.lamports();
            let available = vault_balance.saturating_sub(min_balance);
            let refund = entry_fee.min(available);

            if refund > 0 {
                **vault_info.try_borrow_mut_lamports()? -= refund;
                **authority.try_borrow_mut_lamports()? += refund;
                msg!("💸 Refunded {} lamports entry fee for unscored round {}", refund, round_number);
            }
            if refund < entry_fee {
                msg!("⚠ Vault rent-protected: refunded {} of {} lamports", refund, entry_fee);
            }
        } else {
            msg!("⚠ Force-closing stale scored-but-unclaimed commit for round {}. Winnings forfeited.",
                round_number);
        }
    }

    // Transfer all lamports from commit PDA to authority (reclaim rent)
    let lamports = commit_info.lamports();
    **commit_info.try_borrow_mut_lamports()? = 0;
    **authority.try_borrow_mut_lamports()? = authority.lamports()
        .checked_add(lamports)
        .ok_or::<ProgramError>(AureusError::Overflow.into())?;

    // Zero out account data — runtime GCs zero-lamport accounts at tx end
    let mut data = commit_info.data.borrow_mut();
    for byte in data.iter_mut() {
        *byte = 0;
    }

    msg!("\u{1F5D1} Closed commit PDA for round {}, reclaimed {} lamports rent",
        round_number, lamports);
    Ok(())
}
