use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::{clock::Clock, Sysvar},
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// CLOSE ROUND — reclaim rent from old round PDAs
//   Permissionless — anyone can close a round PDA once the grace
//   period has expired. Lamports go to the signer (cranker).
//   This prevents round-PDA rent from accumulating indefinitely.
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let payer = next_account_info(account_iter)?;
    let round_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;

    if !payer.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    require_program_owner(round_info, program_id)?;
    require_program_owner(arena_info, program_id)?;

    let round_bytes = round_number.to_le_bytes();
    require_pda(round_info, &[b"round", &round_bytes], program_id)?;
    require_pda(arena_info, &[b"arena"], program_id)?;

    let round = RoundState::try_from_slice(&round_info.data.borrow())?;
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;

    // Safety: round must have its grace period fully expired
    let clock = Clock::get()?;
    if !arena.is_reveal_grace_expired(round.round_number, clock.slot) {
        msg!("Round {} grace period not expired yet (slot {})",
            round.round_number, clock.slot);
        return Err(AureusError::RoundNotSettled.into());
    }

    // Transfer all lamports from round PDA to payer (reclaim rent)
    let lamports = round_info.lamports();
    **round_info.try_borrow_mut_lamports()? = 0;
    **payer.try_borrow_mut_lamports()? = payer.lamports()
        .checked_add(lamports)
        .ok_or::<ProgramError>(AureusError::Overflow.into())?;

    // Zero out account data — runtime GCs zero-lamport accounts at tx end
    let mut data = round_info.data.borrow_mut();
    for byte in data.iter_mut() {
        *byte = 0;
    }

    msg!("\u{1F5D1} Closed round PDA {}, reclaimed {} lamports",
        round_number, lamports);
    Ok(())
}
