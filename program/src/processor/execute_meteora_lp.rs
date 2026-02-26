use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_pack::Pack,
    pubkey::Pubkey,
};
use spl_token::state::Account as TokenAccount;

use crate::error::AureusError;
use crate::state::*;
use super::{derive_ata, require_program_owner, require_pda};

// ================================================================
// EXECUTE METEORA LP — CPI into add_liquidity_one_side
//   Must be called AFTER DeployLiquidity + syncNative in same TX.
//   The vault PDA signs as the sender for the Meteora CPI.
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    active_id: i32,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let caller         = next_account_info(account_iter)?;  // 0: signer
    let arena_info     = next_account_info(account_iter)?;  // 1: arena PDA
    let vault_info     = next_account_info(account_iter)?;  // 2: sol_vault PDA
    let wsol_vault_ata = next_account_info(account_iter)?;  // 3: vault's wSOL ATA
    let position       = next_account_info(account_iter)?;  // 4: position
    let lb_pair        = next_account_info(account_iter)?;  // 5: lb_pair
    let bitmap_ext     = next_account_info(account_iter)?;  // 6: bitmap extension
    let reserve        = next_account_info(account_iter)?;  // 7: wSOL reserve
    let wsol_mint      = next_account_info(account_iter)?;  // 8: wSOL mint
    let bin_array_lower = next_account_info(account_iter)?; // 9: bin array lower
    let bin_array_upper = next_account_info(account_iter)?; // 10: bin array upper
    let token_program  = next_account_info(account_iter)?;  // 11: token program
    let event_authority = next_account_info(account_iter)?; // 12: event authority
    let dlmm_program   = next_account_info(account_iter)?;  // 13: DLMM program

    if !caller.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    require_program_owner(arena_info, program_id)?;
    require_pda(arena_info, &[b"arena"], program_id)?;
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    if arena.authority != *caller.key {
        msg!("ExecuteMeteoraLP requires arena authority signer");
        return Err(AureusError::NotAuthority.into());
    }
    if arena.lp_pool == Pubkey::default() || arena.lp_pool != *lb_pair.key {
        msg!("LB pair {} does not match sanctioned arena.lp_pool {}", lb_pair.key, arena.lp_pool);
        return Err(AureusError::InvalidPDA.into());
    }

    // Verify vault PDA
    let (vault_pda, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if vault_info.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }
    if token_program.key != &spl_token::id() {
        return Err(AureusError::InvalidOwner.into());
    }
    if wsol_mint.key != &spl_token::native_mint::id() {
        msg!("Expected wSOL mint {}, got {}", spl_token::native_mint::id(), wsol_mint.key);
        return Err(AureusError::InvalidPDA.into());
    }
    let expected_wsol_ata = derive_ata(&vault_pda, wsol_mint.key);
    if wsol_vault_ata.key != &expected_wsol_ata {
        msg!(
            "wSOL vault ATA mismatch: {} (expected {})",
            wsol_vault_ata.key,
            expected_wsol_ata
        );
        return Err(AureusError::InvalidPDA.into());
    }
    if wsol_vault_ata.owner != token_program.key {
        return Err(AureusError::InvalidOwner.into());
    }
    let wsol_vault_state = TokenAccount::unpack(&wsol_vault_ata.data.borrow())?;
    if wsol_vault_state.owner != vault_pda || wsol_vault_state.mint != *wsol_mint.key {
        msg!("wSOL vault ATA has invalid owner/mint");
        return Err(AureusError::InvalidOwner.into());
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

    // Build Meteora add_liquidity_one_side instruction data
    msg!("Using active_id={} for add_liquidity_one_side", active_id);

    let mut ix_data: Vec<u8> = Vec::new();
    ix_data.extend_from_slice(&[94, 155, 103, 151, 70, 95, 220, 165]); // discriminator
    ix_data.extend_from_slice(&amount.to_le_bytes());         // amount
    ix_data.extend_from_slice(&active_id.to_le_bytes());      // active_id
    ix_data.extend_from_slice(&(10i32).to_le_bytes());        // max_active_bin_slippage
    ix_data.extend_from_slice(&(1u32).to_le_bytes());         // vec len = 1
    ix_data.extend_from_slice(&active_id.to_le_bytes());      // bin_id
    ix_data.extend_from_slice(&(10000u16).to_le_bytes());     // weight (100%)

    let dlmm_ix = solana_program::instruction::Instruction {
        program_id: *dlmm_program.key,
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*position.key, false),
            solana_program::instruction::AccountMeta::new(*lb_pair.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*bitmap_ext.key, false),
            solana_program::instruction::AccountMeta::new(*wsol_vault_ata.key, false),
            solana_program::instruction::AccountMeta::new(*reserve.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*wsol_mint.key, false),
            solana_program::instruction::AccountMeta::new(*bin_array_lower.key, false),
            solana_program::instruction::AccountMeta::new(*bin_array_upper.key, false),
            solana_program::instruction::AccountMeta::new_readonly(vault_pda, true), // sender = vault PDA
            solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*event_authority.key, false),
            solana_program::instruction::AccountMeta::new_readonly(*dlmm_program.key, false),
        ],
        data: ix_data,
    };

    invoke_signed(
        &dlmm_ix,
        &[
            position.clone(),
            lb_pair.clone(),
            bitmap_ext.clone(),
            wsol_vault_ata.clone(),
            reserve.clone(),
            wsol_mint.clone(),
            bin_array_lower.clone(),
            bin_array_upper.clone(),
            vault_info.clone(),
            token_program.clone(),
            event_authority.clone(),
            dlmm_program.clone(),
        ],
        &[&[b"sol_vault", &[vault_bump]]],
    )?;

    msg!("🌊 Added {} lamports one-sided SOL liquidity to Meteora DLMM", amount);
    Ok(())
}
