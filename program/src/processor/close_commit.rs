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

// ================================================================
// CLOSE COMMIT — reclaim rent from old claimed commit PDAs
//   Only the commit owner can close, and only after the commit
//   has been fully claimed (or slashed). This prevents rent from
//   accumulating indefinitely on-chain.
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

    // Must be claimed before closing — prevents closing with uncollected winnings
    if !commit.claimed {
        msg!("Cannot close unclaimed commit — claim winnings first");
        return Err(AureusError::NotScored.into());
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
