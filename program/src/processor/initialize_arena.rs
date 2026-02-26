use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    bpf_loader_upgradeable,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_token::state::Mint;

use crate::error::AureusError;
use crate::state::*;
use super::parse_programdata_upgrade_authority;

// ================================================================
// INITIALIZE ARENA — creates arena PDA + AUR token mint + SOL vault
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    genesis_slot: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let mint_info = next_account_info(account_iter)?;
    let vault_info = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;
    let _token_program = next_account_info(account_iter)?;
    let rent_sysvar = next_account_info(account_iter)?;
    let program_data_info = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    // Initialization of a brand-new arena must be authorized by the
    // program's upgrade authority to prevent first-come authority capture.
    if arena_info.data_len() == 0 {
        let (expected_program_data, _) = Pubkey::find_program_address(
            &[program_id.as_ref()],
            &bpf_loader_upgradeable::id(),
        );
        if program_data_info.key != &expected_program_data {
            msg!("ProgramData mismatch: {} (expected {})", program_data_info.key, expected_program_data);
            return Err(AureusError::InvalidPDA.into());
        }
        let upgrade_authority = parse_programdata_upgrade_authority(program_data_info)?;
        if upgrade_authority != Some(*authority.key) {
            msg!(
                "InitializeArena signer {} is not program upgrade authority {:?}",
                authority.key,
                upgrade_authority
            );
            return Err(AureusError::NotAuthority.into());
        }
    }

    // Derive PDAs
    let (arena_pda, arena_bump) = Pubkey::find_program_address(&[b"arena"], program_id);
    if arena_info.key != &arena_pda {
        return Err(AureusError::InvalidPDA.into());
    }
    // Validate mint is the hardcoded vanity address (pre-created via createWithSeed)
    if mint_info.key != &ArenaState::AUR_MINT {
        msg!("Mint mismatch: {} (expected {})", mint_info.key, ArenaState::AUR_MINT);
        return Err(AureusError::InvalidPDA.into());
    }
    let (vault_pda, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], program_id);
    if vault_info.key != &vault_pda {
        return Err(AureusError::InvalidPDA.into());
    }

    let rent = Rent::get()?;

    // 1. Create or realloc Arena PDA
    let arena_space = ArenaState::LEN;
    if arena_info.data_len() == 0 {
        // Fresh create
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                arena_info.key,
                rent.minimum_balance(arena_space),
                arena_space as u64,
                program_id,
            ),
            &[authority.clone(), arena_info.clone(), system_program.clone()],
            &[&[b"arena", &[arena_bump]]],
        )?;
    } else if arena_info.data_len() < arena_space {
        // Arena exists but is too small (migration) — realloc + PRESERVE state
        // Only authority can trigger migration to prevent unauthorized state wipes
        //
        // We cannot deserialize the old struct because the buffer is too short.
        // Instead, read authority directly from known byte offsets (Borsh layout is
        // append-only — new fields go at the end, existing offsets are stable).
        let data = arena_info.data.borrow();
        let is_initialized = data[0] != 0;
        if is_initialized {
            // authority starts at offset 1 (after is_initialized bool)
            let existing_authority = Pubkey::try_from(&data[1..33])
                .map_err(|_| {
                    msg!("Cannot read authority from existing arena");
                    AureusError::AlreadyInitialized
                })?;
            if existing_authority != *authority.key {
                msg!("Only arena authority can trigger migration");
                return Err(AureusError::NotAuthority.into());
            }
        }
        drop(data); // Release borrow before realloc

        msg!("Migrating arena from {} to {} bytes (preserving state)",
            arena_info.data_len(), arena_space);
        arena_info.realloc(arena_space, false)?;
        // Top up rent via system transfer
        let rent_needed = rent.minimum_balance(arena_space);
        let current_lamports = arena_info.lamports();
        if current_lamports < rent_needed {
            let diff = rent_needed - current_lamports;
            invoke(
                &system_instruction::transfer(
                    authority.key,
                    arena_info.key,
                    diff,
                ),
                &[authority.clone(), arena_info.clone(), system_program.clone()],
            )?;
        }

        // If already initialized, RETURN early — do NOT overwrite state.
        // The realloc above already expanded the account with zero-filled new bytes.
        // Existing fields are preserved in-place by Borsh's fixed layout.
        if is_initialized {
            msg!("Migration complete — existing state preserved");
            return Ok(());
        }
        // If not yet initialized, fall through to write fresh state below
    } else {
        // Arena already correct size — check if mint migration needed
        let mut existing = ArenaState::try_from_slice(&arena_info.data.borrow())?;
        if existing.is_initialized {
            // Allow authority to migrate token_mint to the vanity address
            if existing.token_mint != ArenaState::AUR_MINT {
                if existing.authority != *authority.key {
                    msg!("Only arena authority can migrate token mint");
                    return Err(AureusError::NotAuthority.into());
                }
                let old_mint = existing.token_mint;
                existing.token_mint = ArenaState::AUR_MINT;
                existing.mint_bump = 0;
                existing.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;
                msg!("Token mint migrated: {} → {}", old_mint, ArenaState::AUR_MINT);

                // Also initialize the new mint account if not yet initialized
                let mint_check = Mint::unpack_unchecked(&mint_info.data.borrow());
                match mint_check {
                    Ok(m) if m.is_initialized => {
                        msg!("Mint already initialized (supply: {})", m.supply);
                    },
                    _ => {
                        invoke(
                            &spl_token::instruction::initialize_mint2(
                                &spl_token::id(),
                                mint_info.key,
                                &arena_pda,
                                None,
                                ArenaState::TOKEN_DECIMALS,
                            )?,
                            &[mint_info.clone(), rent_sysvar.clone()],
                        )?;
                        msg!("Mint initialized at {} with arena PDA as authority", mint_info.key);
                    }
                }
                return Ok(());
            }
            msg!("Arena already initialized — cannot re-initialize");
            return Err(AureusError::AlreadyInitialized.into());
        }
    }

    // 2. Initialize pre-created Token Mint (created off-chain via createWithSeed)
    //    The mint account must already exist at AUR_MINT address, owned by Token Program.
    if mint_info.data_len() == 0 {
        msg!("Mint account not found at {}. Create it off-chain first via createWithSeed.", mint_info.key);
        return Err(AureusError::NotInitialized.into());
    }
    // Check if already initialized as a mint (data_len == Mint::LEN and supply exists)
    let mint_check = Mint::unpack_unchecked(&mint_info.data.borrow());
    match mint_check {
        Ok(m) if m.is_initialized => {
            msg!("Mint already initialized (supply: {}), skipping", m.supply);
        },
        _ => {
            // Mint account exists but not yet initialized — initialize it now
            // Arena PDA is the mint authority (only the program can mint)
            invoke(
                &spl_token::instruction::initialize_mint2(
                    &spl_token::id(),
                    mint_info.key,
                    &arena_pda,  // mint authority = arena PDA
                    None,         // no freeze authority
                    ArenaState::TOKEN_DECIMALS,
                )?,
                &[mint_info.clone(), rent_sysvar.clone()],
            )?;
            msg!("Mint initialized at {} with arena PDA as authority", mint_info.key);
        }
    }

    // 4. Create SOL vault PDA (skip if exists)
    if vault_info.lamports() == 0 {
        let vault_space: usize = 0;
        invoke_signed(
            &system_instruction::create_account(
                authority.key,
                vault_info.key,
                rent.minimum_balance(vault_space),
                vault_space as u64,
                program_id,
            ),
            &[authority.clone(), vault_info.clone(), system_program.clone()],
            &[&[b"sol_vault", &[vault_bump]]],
        )?;
    } else {
        msg!("Vault already exists, skipping");
    }

    // 5. Initialize arena state
    let arena = ArenaState {
        is_initialized: true,
        authority: *authority.key,
        token_mint: ArenaState::AUR_MINT,
        sol_vault: vault_pda,
        genesis_slot,
        total_rounds: 0,
        total_agents: 0,
        current_era: 0,
        total_emitted: 0,
        sol_jackpot_t1: 0,
        sol_jackpot_t2: 0,
        sol_jackpot_t3: 0,
        token_jackpot_t1: 0,
        token_jackpot_t2: 0,
        token_jackpot_t3: 0,
        bump: arena_bump,
        mint_bump: 0, // Not used — mint is createWithSeed, not PDA
        vault_bump,
        protocol_revenue: 0,
        staker_reward_pool: 0,
        total_aur_staked: 0,
        reward_per_token_cumulative: 0,
        lp_fund: 0,
        lp_pool: Pubkey::default(),
        total_lp_deployed: 0,
        jackpot_rounds: [0u64; 10],
        jackpot_winners: [Pubkey::default(); 10],
        jackpot_amounts: [0u64; 10],
        jackpot_types: [0u8; 10],
        jackpot_history_idx: 0,
        total_stakers_t2_eligible: 0,
        total_stakers_t3_eligible: 0,
        swap_fee_aur_jackpot: 0,
    };
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("Arena initialized! Mint: {}, Vault: {}, Genesis: {}",
        ArenaState::AUR_MINT, vault_pda, genesis_slot);
    Ok(())
}
