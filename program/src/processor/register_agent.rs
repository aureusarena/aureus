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
use super::{require_program_owner, require_pda};

// ================================================================
// REGISTER AGENT
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let agent_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    let (agent_pda, agent_bump) =
        Pubkey::find_program_address(&[b"agent", authority.key.as_ref()], program_id);
    if agent_info.key != &agent_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    let rent = Rent::get()?;
    let space = AgentState::LEN;

    if agent_info.data_len() == 0 {
        // Brand new agent — create account
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                agent_info.key,
                rent.minimum_balance(space),
                space as u64,
                program_id,
            ),
            &[authority.clone(), agent_info.clone(), system_program.clone()],
            &[&[b"agent", authority.key.as_ref(), &[agent_bump]]],
        )?;

        let clock = Clock::get()?;
        let agent = AgentState {
            is_initialized: true,
            authority: *authority.key,
            total_wins: 0,
            total_losses: 0,
            total_pushes: 0,
            last_100: [255u8; 100],
            last_100_idx: 0,
            registered_at: clock.slot,
            bump: agent_bump,
            total_aur_earned: 0,
            total_sol_earned: 0,
            matches_t1: 0,
            matches_t2: 0,
            matches_t3: 0,
        };
        agent.serialize(&mut &mut agent_info.data.borrow_mut()[..])?;

        // Validate arena PDA before modifying
        require_program_owner(arena_info, program_id)?;
        require_pda(arena_info, &[b"arena"], program_id)?;

        let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
        arena.total_agents += 1;
        arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;
    } else {
        // Agent already exists — no migration, just return
        msg!("Agent already registered");
        return Ok(());
    }

    msg!("Agent registered: {}", authority.key);
    Ok(())
}
