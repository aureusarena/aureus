use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
};

use crate::error::AureusError;
use crate::state::*;
use super::require_pda;

/// Metaplex Token Metadata program ID
const METADATA_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    11, 112, 101, 177, 227, 209, 124, 69,
    56, 157, 82, 127, 107, 4, 195, 205,
    88, 184, 108, 115, 26, 160, 253, 181,
    73, 182, 209, 188, 3, 248, 41, 70,
]); // metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s

// ================================================================
// UPDATE TOKEN METADATA — authority-only, CPIs into Metaplex
// ================================================================
#[inline(never)]
pub fn process(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    name: String,
    symbol: String,
    uri: String,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;    // 0: signer (arena authority)
    let arena_info = next_account_info(account_iter)?;   // 1: arena PDA
    let mint_info = next_account_info(account_iter)?;    // 2: token mint
    let metadata_info = next_account_info(account_iter)?; // 3: metadata PDA
    let metadata_program = next_account_info(account_iter)?; // 4: metaplex program

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    // Validate arena PDA
    require_pda(arena_info, &[b"arena"], program_id)?;

    // Load arena and verify authority
    let arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    if !arena.is_initialized {
        return Err(AureusError::NotInitialized.into());
    }
    if arena.authority != *authority.key {
        msg!("Only arena authority can update token metadata");
        return Err(AureusError::NotAuthority.into());
    }

    // Validate mint
    if mint_info.key != &ArenaState::AUR_MINT {
        msg!("Mint mismatch: {} (expected {})", mint_info.key, ArenaState::AUR_MINT);
        return Err(AureusError::InvalidPDA.into());
    }

    // Validate Metaplex program
    if metadata_program.key != &METADATA_PROGRAM_ID {
        msg!("Invalid metadata program: {}", metadata_program.key);
        return Err(AureusError::InvalidPDA.into());
    }

    // Derive expected metadata PDA
    let (expected_metadata, _) = Pubkey::find_program_address(
        &[b"metadata", METADATA_PROGRAM_ID.as_ref(), mint_info.key.as_ref()],
        &METADATA_PROGRAM_ID,
    );
    if metadata_info.key != &expected_metadata {
        msg!("Metadata PDA mismatch: {} (expected {})", metadata_info.key, expected_metadata);
        return Err(AureusError::InvalidPDA.into());
    }

    // Verify metadata account exists (can't update what doesn't exist)
    if metadata_info.data_is_empty() {
        msg!("Metadata account does not exist — use CreateTokenMetadata first");
        return Err(AureusError::NotInitialized.into());
    }

    let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);

    // Build the Metaplex UpdateMetadataAccountV2 instruction data
    // Discriminator: 15 (UpdateMetadataAccountV2)
    let mut ix_data: Vec<u8> = Vec::new();
    ix_data.push(15); // instruction discriminator

    // Option<DataV2> = Some
    ix_data.push(1);

    // DataV2 (Borsh serialized)
    // name: String
    ix_data.extend_from_slice(&(name.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(name.as_bytes());
    // symbol: String
    ix_data.extend_from_slice(&(symbol.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(symbol.as_bytes());
    // uri: String
    ix_data.extend_from_slice(&(uri.len() as u32).to_le_bytes());
    ix_data.extend_from_slice(uri.as_bytes());
    // seller_fee_basis_points: u16
    ix_data.extend_from_slice(&0u16.to_le_bytes());
    // creators: Option<Vec<Creator>> = None
    ix_data.push(0);
    // collection: Option<Collection> = None
    ix_data.push(0);
    // uses: Option<Uses> = None
    ix_data.push(0);

    // Option<Pubkey> new_update_authority = None (keep current)
    ix_data.push(0);
    // Option<bool> primary_sale_happened = None (keep current)
    ix_data.push(0);
    // Option<bool> is_mutable = Some(true)
    ix_data.push(1);
    ix_data.push(1);

    let update_metadata_ix = Instruction {
        program_id: METADATA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*metadata_info.key, false),        // metadata (writable)
            AccountMeta::new_readonly(arena_pda, true),          // update authority (signer via CPI)
        ],
        data: ix_data,
    };

    msg!("Updating token metadata: name={}, symbol={}, uri={}",
        name, symbol, uri);

    invoke_signed(
        &update_metadata_ix,
        &[
            metadata_info.clone(),
            arena_info.clone(),
            metadata_program.clone(),
        ],
        &[&[b"arena", &[arena.bump]]],
    )?;

    msg!("✅ Token metadata updated at {}", metadata_info.key);
    Ok(())
}
