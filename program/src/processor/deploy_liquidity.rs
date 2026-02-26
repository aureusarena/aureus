use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

use crate::error::AureusError;
use crate::state::*;
use super::{derive_ata, require_program_owner};

// ================================================================
// DEPLOY LIQUIDITY — permissionless, moves LP fund SOL to destination
//   Destination is typically the vault's wSOL ATA for Meteora LP,
//   or any writable account as a fallback.
//   After this, caller should add syncNative + ExecuteMeteoraLP
//   in the same transaction.
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let _anyone = next_account_info(account_iter)?;        // 0: signer (anyone)
    let arena_info = next_account_info(account_iter)?;     // 1: arena PDA
    let vault_info = next_account_info(account_iter)?;     // 2: sol_vault PDA
    let destination = next_account_info(account_iter)?;    // 3: destination (wSOL ATA or wallet)

    require_program_owner(arena_info, program_id)?;
    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;

    // Only arena authority can deploy liquidity
    if !_anyone.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    if *_anyone.key != arena.authority {
        msg!("Only arena authority can deploy liquidity");
        return Err(AureusError::NotAuthority.into());
    }

    // Verify arena PDA
    let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);
    if arena_info.key != &arena_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    // Verify vault PDA
    let (vault_pda, _vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if vault_info.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    // Validate destination is the vault's wSOL ATA.
    // LP funds must ONLY go to the vault's wSOL token account
    // (which then gets used by the Meteora CPI). This prevents
    // a compromised authority from draining LP funds to arbitrary addresses.
    {
        let wsol_mint = spl_token::native_mint::id();
        let expected_wsol_ata = derive_ata(&vault_pda, &wsol_mint);
        if destination.key != &expected_wsol_ata {
            msg!("S5: LP destination {} does not match vault wSOL ATA {}",
                destination.key, expected_wsol_ata);
            return Err(AureusError::InvalidPDA.into());
        }
    }

    // Check threshold
    if arena.lp_fund < ArenaState::LP_DEPLOY_THRESHOLD {
        msg!("LP fund {} below threshold {}",
            arena.lp_fund, ArenaState::LP_DEPLOY_THRESHOLD);
        return Err(AureusError::InsufficientFunds.into());
    }

    let deploy_amount = arena.lp_fund;

    // Ensure vault keeps rent-exempt minimum
    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(vault_info.data_len());
    let vault_balance = vault_info.lamports();
    let available = vault_balance.saturating_sub(min_balance);
    let actual_deploy = deploy_amount.min(available);

    if actual_deploy == 0 {
        msg!("Vault balance too low to deploy LP (rent-exempt protected)");
        return Ok(());
    }

    // Transfer SOL from vault → destination via lamport manipulation
    **vault_info.try_borrow_mut_lamports()? -= actual_deploy;
    **destination.try_borrow_mut_lamports()? += actual_deploy;

    arena.lp_fund = deploy_amount.saturating_sub(actual_deploy);
    arena.total_lp_deployed = arena.total_lp_deployed.saturating_add(actual_deploy);
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("🌊 Deployed {} lamports to {}", deploy_amount, destination.key);
    Ok(())
}
