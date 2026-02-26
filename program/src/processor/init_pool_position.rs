use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
};

use crate::error::AureusError;
use crate::state::*;
use super::{require_program_owner, require_pda};

// ================================================================
// INIT POOL POSITION — CPI into Meteora to create a position
//   owned by the vault PDA
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    lower_bin_id: i32,
    width: i32,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let funder = next_account_info(account_iter)?;        // 0: payer/authority
    let arena_info = next_account_info(account_iter)?;    // 1: arena PDA
    let vault_info = next_account_info(account_iter)?;    // 2: sol_vault PDA (owner)
    let position = next_account_info(account_iter)?;      // 3: position keypair
    let lb_pair = next_account_info(account_iter)?;       // 4: lb_pair
    let system_program = next_account_info(account_iter)?; // 5: system program
    let rent_sysvar = next_account_info(account_iter)?;   // 6: rent sysvar
    let event_authority = next_account_info(account_iter)?; // 7: event authority
    let dlmm_program = next_account_info(account_iter)?;  // 8: DLMM program

    if !funder.is_signer {
        return Err(solana_program::program_error::ProgramError::MissingRequiredSignature);
    }

    require_program_owner(arena_info, program_id)?;
    require_pda(arena_info, &[b"arena"], program_id)?;
    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    if arena.authority != *funder.key {
        msg!("InitPoolPosition requires arena authority signer");
        return Err(AureusError::NotAuthority.into());
    }

    // Verify vault PDA
    let (vault_pda, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if vault_info.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    // Bind LP operations to one sanctioned LB pair.
    // First init pins arena.lp_pool; subsequent calls must match.
    if arena.lp_pool == Pubkey::default() {
        arena.lp_pool = *lb_pair.key;
        msg!("Pinned arena.lp_pool to {}", lb_pair.key);
    } else if arena.lp_pool != *lb_pair.key {
        msg!("LB pair {} does not match arena.lp_pool {}", lb_pair.key, arena.lp_pool);
        return Err(AureusError::InvalidPDA.into());
    }

    // Validate Meteora DLMM program ID — prevents vault PDA signing
    // into a malicious program that could drain the vault.
    let expected_dlmm = Pubkey::new_from_array([
        4, 233, 225, 47, 188, 132, 232, 38,
        201, 50, 204, 233, 226, 100, 12, 206,
        21, 89, 12, 28, 98, 115, 176, 146,
        87, 8, 186, 59, 133, 32, 176, 188,
    ]); // LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
    if dlmm_program.key != &expected_dlmm {
        msg!("Invalid DLMM program: {} (expected {})", dlmm_program.key, expected_dlmm);
        return Err(AureusError::InvalidPDA.into());
    }
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    // Build Meteora initialize_position CPI
    // Discriminator: sha256("global:initialize_position")[0..8]
    // = [0xdc, 0x3f, 0x01, 0x14, 0x10, 0x08, 0x0b, 0xe8]
    // Args: lower_bin_id: i32, width: i32
    let disc: [u8; 8] = {
        use solana_program::hash::hash;
        let h = hash(b"global:initialize_position");
        let mut d = [0u8; 8];
        d.copy_from_slice(&h.to_bytes()[..8]);
        d
    };
    let mut ix_data = Vec::with_capacity(16);
    ix_data.extend_from_slice(&disc);
    ix_data.extend_from_slice(&lower_bin_id.to_le_bytes());
    ix_data.extend_from_slice(&width.to_le_bytes());

    let init_pos_ix = solana_program::instruction::Instruction {
        program_id: *dlmm_program.key,
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*funder.key, true),
            solana_program::instruction::AccountMeta::new(*position.key, true),
            solana_program::instruction::AccountMeta::new_readonly(*lb_pair.key, false),
            solana_program::instruction::AccountMeta::new_readonly(vault_pda, true), // owner = vault PDA
            solana_program::instruction::AccountMeta::new_readonly(*system_program.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*rent_sysvar.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*event_authority.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*dlmm_program.key, false),
        ],
        data: ix_data,
    };

    invoke_signed(
        &init_pos_ix,
        &[
            funder.clone(),
            position.clone(),
            lb_pair.clone(),
            vault_info.clone(), // vault PDA signs as owner
            system_program.clone(),
            rent_sysvar.clone(),
            event_authority.clone(),
            dlmm_program.clone(),
        ],
        &[&[b"sol_vault", &[vault_bump]]],
    )?;

    msg!("📍 Meteora position initialized (owner=vault PDA, bins={} to {})",
        lower_bin_id, lower_bin_id + width - 1);

    Ok(())
}
