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
// REVEAL — verify hash, store strategy, set field weights
// ================================================================
#[inline(never)]
pub fn process(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    round_number: u64,
    strategy: [u8; 5],
    nonce: [u8; 32],
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let _agent_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let round_info = next_account_info(account_iter)?;
    let commit_info = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    require_program_owner(arena_info, _program_id)?;
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    // Ensure arena is initialized
    if !arena.is_initialized {
        return Err(AureusError::NotInitialized.into());
    }

    // PDA verification for arena
    require_pda(arena_info, &[b"arena"], _program_id)?;

    let clock = Clock::get()?;
    if !arena.can_still_reveal(round_number, clock.slot) {
        return Err(AureusError::NotRevealPhase.into());
    }

    // Validate strategy
    let sum: u16 = strategy.iter().map(|&x| x as u16).sum();
    if sum != 100 {
        return Err(AureusError::InvalidStrategy.into());
    }

    // Verify commitment
    let mut preimage = Vec::with_capacity(37);
    preimage.extend_from_slice(&strategy);
    preimage.extend_from_slice(&nonce);
    let computed = hash(&preimage);

    require_program_owner(commit_info, _program_id)?;
    let mut commit = CommitState::try_from_slice(&commit_info.data.borrow())?;

    // PDA verification for commit
    let round_bytes = round_number.to_le_bytes();
    require_pda(commit_info, &[b"commit", &round_bytes, authority.key.as_ref()], _program_id)?;
    // Verify commit belongs to the right round
    if commit.round_number != round_number {
        msg!("Commit round {} != submitted round {}", commit.round_number, round_number);
        return Err(AureusError::WrongRound.into());
    }

    if commit.revealed {
        return Err(AureusError::AlreadyRevealed.into());
    }
    if commit.agent != *authority.key {
        return Err(AureusError::InvalidOwner.into());
    }
    if computed.to_bytes() != commit.commitment {
        return Err(AureusError::CommitmentMismatch.into());
    }

    commit.revealed = true;
    commit.strategy = strategy;
    commit.serialize(&mut &mut commit_info.data.borrow_mut()[..])?;

    require_program_owner(round_info, _program_id)?;
    let mut round = RoundState::try_from_slice(&round_info.data.borrow())?;

    // PDA verification for round
    require_pda(round_info, &[b"round", &round_bytes], _program_id)?;

    round.num_reveals += 1;

    // Accumulate reveal entropy — XOR commitment hash into running seed.
    // This makes the matchmaking seed unpredictable until all reveals land.
    for i in 0..32 {
        round.reveal_entropy[i] ^= commit.commitment[i];
    }

    // Mark matchmaking_done flag on first reveal (emission calculation
    // deferred to process_score_match where actual reveal counts are available)
    if !round.matchmaking_done {
        round.matchmaking_done = true;
        msg!("Reveal phase started. Emission rates deferred to scoring.");
    }

    round.serialize(&mut &mut round_info.data.borrow_mut()[..])?;

    // Do NOT log strategy — prevents MEV bots from reading reveals
    // from transaction logs before other agents have revealed.
    msg!("Reveal: agent={}, round={}", authority.key, round_number);
    Ok(())
}
