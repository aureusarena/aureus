use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

/// Number of rounds after which a commit can be force-closed
/// without claiming. Winnings remain in the vault — only rent
/// is returned to the commit owner.
const STALE_ROUND_THRESHOLD: u64 = 100;

// ================================================================
// CLOSE COMMIT — reclaim rent from old commit PDAs
//   Only the commit owner can close.
//   - If claimed: always allowed.
//   - If unclaimed but stale (100+ rounds old): allowed.
//     Winnings stay in the vault; owner only gets rent back.
//   - If unclaimed and fresh: rejected (claim first).
//
//   Accounts:
//     0. [signer, writable] authority (commit owner)
//     1. [writable]         commit PDA
//     2. []                 arena PDA (required if unclaimed)
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

    // If not yet claimed, check if the commit is stale enough to force-close
    if !commit.claimed {
        let arena_info = next_account_info(account_iter)?;
        require_program_owner(arena_info, program_id)?;
        require_pda(arena_info, &[b"arena"], program_id)?;

        let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
        let current_round = arena.total_rounds;

        if current_round < round_number || current_round - round_number < STALE_ROUND_THRESHOLD {
            msg!("Cannot close fresh unclaimed commit — claim winnings first (round {} is only {} rounds behind)",
                round_number, current_round.saturating_sub(round_number));
            return Err(AureusError::NotScored.into());
        }

        msg!("⚠ Force-closing stale unclaimed commit for round {} ({} rounds behind). Winnings forfeited.",
            round_number, current_round - round_number);
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

    msg!("\u{1F5D1} Closed commit PDA for round {}, reclaimed {} lamports",
        round_number, lamports);
    Ok(())
}

