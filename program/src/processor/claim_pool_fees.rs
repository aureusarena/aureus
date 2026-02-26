use borsh::{BorshDeserialize, BorshSerialize};
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
use super::{derive_ata, require_program_owner};

// ================================================================
// CLAIM POOL FEES — collect swap fees from Meteora DLMM position
//   Permissionless: anyone can trigger.
//   1) CPI update_fees_and_rewards (syncs fee accruals)
//   2) CPI claim_fee (transfers fees to vault ATAs)
//   3) Route claimed SOL (wSOL) to staker_reward_pool
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let _anyone        = next_account_info(account_iter)?;  // 0: signer
    // Signer check
    if !_anyone.is_signer {
        return Err(AureusError::NotSigner.into());
    }
    let arena_info      = next_account_info(account_iter)?;  // 1: arena PDA
    let vault_info      = next_account_info(account_iter)?;  // 2: vault PDA
    let position        = next_account_info(account_iter)?;  // 3: position
    let lb_pair         = next_account_info(account_iter)?;  // 4: lb pair
    let bin_array_lower = next_account_info(account_iter)?;  // 5: bin array lower
    let bin_array_upper = next_account_info(account_iter)?;  // 6: bin array upper
    let reserve_x       = next_account_info(account_iter)?;  // 7: reserve X
    let reserve_y       = next_account_info(account_iter)?;  // 8: reserve Y
    let user_token_x    = next_account_info(account_iter)?;  // 9: vault ATA token X
    let user_token_y    = next_account_info(account_iter)?;  // 10: vault ATA token Y
    let token_x_mint    = next_account_info(account_iter)?;  // 11: token X mint
    let token_y_mint    = next_account_info(account_iter)?;  // 12: token Y mint
    let token_program   = next_account_info(account_iter)?;  // 13: token program
    let event_authority = next_account_info(account_iter)?;  // 14: event authority
    let dlmm_program    = next_account_info(account_iter)?;  // 15: DLMM program

    // Verify and read arena
    require_program_owner(arena_info, program_id)?;
    let (vault_pda, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if vault_info.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }
    let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);
    if arena_info.key != &arena_pda {
        return Err(AureusError::InvalidPDA.into());
    }
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    if arena.lp_pool == Pubkey::default() || arena.lp_pool != *lb_pair.key {
        msg!("LB pair {} does not match sanctioned arena.lp_pool {}", lb_pair.key, arena.lp_pool);
        return Err(AureusError::InvalidPDA.into());
    }
    if token_program.key != &spl_token::id() {
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

    // Only accept sanctioned AUR/wSOL pool fee claims.
    let wsol_mint = spl_token::native_mint::id();
    let pair_is_xy = *token_x_mint.key == wsol_mint && *token_y_mint.key == arena.token_mint;
    let pair_is_yx = *token_y_mint.key == wsol_mint && *token_x_mint.key == arena.token_mint;
    if !(pair_is_xy || pair_is_yx) {
        msg!(
            "Invalid fee mint pair: token_x={}, token_y={}, expected {{wSOL={}, AUR={}}}",
            token_x_mint.key,
            token_y_mint.key,
            wsol_mint,
            arena.token_mint
        );
        return Err(AureusError::InvalidPDA.into());
    }

    // Fee destination accounts must be vault-owned ATAs for token_x/token_y.
    let expected_token_x_ata = derive_ata(&vault_pda, token_x_mint.key);
    let expected_token_y_ata = derive_ata(&vault_pda, token_y_mint.key);
    if user_token_x.key != &expected_token_x_ata || user_token_y.key != &expected_token_y_ata {
        msg!(
            "Invalid fee destination ATA(s): x={} expected {}, y={} expected {}",
            user_token_x.key, expected_token_x_ata, user_token_y.key, expected_token_y_ata
        );
        return Err(AureusError::InvalidPDA.into());
    }
    if user_token_x.owner != token_program.key || user_token_y.owner != token_program.key {
        return Err(AureusError::InvalidOwner.into());
    }

    let token_x_before = TokenAccount::unpack(&user_token_x.data.borrow())?;
    let token_y_before = TokenAccount::unpack(&user_token_y.data.borrow())?;
    if token_x_before.owner != vault_pda
        || token_y_before.owner != vault_pda
        || token_x_before.mint != *token_x_mint.key
        || token_y_before.mint != *token_y_mint.key
    {
        msg!("Fee token account owner/mint mismatch");
        return Err(AureusError::InvalidOwner.into());
    }

    let vault_seeds: &[&[u8]] = &[b"sol_vault", &[vault_bump]];

    // Snapshot BOTH token balances before claim
    let bal_before_x = token_x_before.amount;
    let bal_before_y = token_y_before.amount;

    // === CPI 1: update_fees_and_rewards ===
    let update_disc: [u8; 8] = [154, 230, 250, 13, 236, 209, 75, 223];
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: *dlmm_program.key,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*position.key, false),
                solana_program::instruction::AccountMeta::new(*lb_pair.key, false),
                solana_program::instruction::AccountMeta::new(*bin_array_lower.key, false),
                solana_program::instruction::AccountMeta::new(*bin_array_upper.key, false),
                solana_program::instruction::AccountMeta::new_readonly(vault_pda, true),
            ],
            data: update_disc.to_vec(),
        },
        &[position.clone(), lb_pair.clone(), bin_array_lower.clone(), bin_array_upper.clone(), vault_info.clone()],
        &[vault_seeds],
    )?;
    msg!("✅ update_fees_and_rewards OK");

    // === CPI 2: claim_fee ===
    let claim_disc: [u8; 8] = [169, 32, 79, 137, 136, 232, 70, 137];
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: *dlmm_program.key,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*lb_pair.key, false),
                solana_program::instruction::AccountMeta::new(*position.key, false),
                solana_program::instruction::AccountMeta::new(*bin_array_lower.key, false),
                solana_program::instruction::AccountMeta::new(*bin_array_upper.key, false),
                solana_program::instruction::AccountMeta::new_readonly(vault_pda, true),
                solana_program::instruction::AccountMeta::new(*reserve_x.key, false),
                solana_program::instruction::AccountMeta::new(*reserve_y.key, false),
                solana_program::instruction::AccountMeta::new(*user_token_x.key, false),
                solana_program::instruction::AccountMeta::new(*user_token_y.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*token_x_mint.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*token_y_mint.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*event_authority.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*dlmm_program.key, false),
            ],
            data: claim_disc.to_vec(),
        },
        &[
            lb_pair.clone(), position.clone(), bin_array_lower.clone(), bin_array_upper.clone(),
            vault_info.clone(), reserve_x.clone(), reserve_y.clone(),
            user_token_x.clone(), user_token_y.clone(),
            token_x_mint.clone(), token_y_mint.clone(),
            token_program.clone(), event_authority.clone(), dlmm_program.clone(),
        ],
        &[vault_seeds],
    )?;
    msg!("✅ claim_fee OK");

    // === Measure claimed amounts for BOTH tokens ===
    // Use proper SPL token account unpacking instead of raw byte offsets
    let bal_after_x = TokenAccount::unpack(&user_token_x.data.borrow())?.amount;
    let bal_after_y = TokenAccount::unpack(&user_token_y.data.borrow())?.amount;
    let delta_x = bal_after_x.saturating_sub(bal_before_x);
    let delta_y = bal_after_y.saturating_sub(bal_before_y);

    // Figure out which is SOL and which is AUR
    let (claimed_sol, claimed_aur) = if *token_x_mint.key == wsol_mint {
        (delta_x, delta_y) // X = wSOL, Y = AUR
    } else {
        (delta_y, delta_x) // X = AUR, Y = wSOL
    };

    if claimed_sol > 0 || claimed_aur > 0 {
        let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;

        // wSOL fees → staker reward pool (or T1 jackpot if no stakers)
        if claimed_sol > 0 {
            if arena.total_aur_staked > 0 {
                arena.staker_reward_pool = arena.staker_reward_pool.saturating_add(claimed_sol);
                // Update the reward accumulator (same pattern as process_score_match)
                let reward_delta = (claimed_sol as u128)
                    .checked_mul(ArenaState::REWARD_PRECISION)
                    .unwrap_or(0)
                    / arena.total_aur_staked as u128;
                arena.reward_per_token_cumulative += reward_delta;
                msg!("💰 Claimed {} lamports SOL fees → staker reward pool (accumulator updated)", claimed_sol);
            } else {
                // No stakers — redirect to T1 SOL jackpot so funds aren't stuck
                arena.add_sol_jackpot(0, claimed_sol);
                msg!("📢 No stakers — {} lamports SOL fees → T1 SOL jackpot", claimed_sol);
            }
        }

        // AUR fees → swap_fee_aur_jackpot (transfer-based, not mint-based).
        //
        // These AUR tokens are already minted and sit in the vault's AUR ATA.
        // We track them separately in swap_fee_aur_jackpot so that when the
        // T1 token jackpot triggers, claim.rs can TRANSFER them from the vault
        // ATA instead of minting new tokens. This avoids double-counting
        // Mint.supply and ensures payouts work even after MAX_SUPPLY is reached.
        if claimed_aur > 0 {
            arena.swap_fee_aur_jackpot = arena.swap_fee_aur_jackpot.saturating_add(claimed_aur);
            msg!("💰 Claimed {} AUR fees → swap_fee_aur_jackpot (T1)", claimed_aur);
        }

        arena.serialize(&mut *arena_info.data.borrow_mut())?;
        msg!("📊 Pools after claim — staker: {}, T1 token JP: {}",
            arena.staker_reward_pool, arena.token_jackpot_t1);
    } else {
        msg!("ℹ️  No swap fees accrued yet");
    }

    Ok(())
}
