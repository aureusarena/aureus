use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
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
// CREATE TOKEN METADATA — authority-only, CPIs into Metaplex
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
    let system_program = next_account_info(account_iter)?; // 4: system program
    let rent_info = next_account_info(account_iter)?;    // 5: rent sysvar
    let metadata_program = next_account_info(account_iter)?; // 6: metaplex program

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
        msg!("Only arena authority can set token metadata");
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

    let (arena_pda, _) = Pubkey::find_program_address(&[b"arena"], program_id);

    // Build the Metaplex CreateMetadataAccountV3 instruction data
    // Discriminator: 33 (CreateMetadataAccountV3)
    let mut ix_data: Vec<u8> = Vec::new();
    ix_data.push(33); // instruction discriminator

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
    // is_mutable: bool = true (so we can update later)
    ix_data.push(1);
    // collection_details: Option<CollectionDetails> = None
    ix_data.push(0);

    let create_metadata_ix = Instruction {
        program_id: METADATA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*metadata_info.key, false),        // metadata (writable)
            AccountMeta::new_readonly(*mint_info.key, false),    // mint
            AccountMeta::new_readonly(arena_pda, true),          // mint authority (signer via CPI)
            AccountMeta::new(*authority.key, true),              // payer
            AccountMeta::new_readonly(arena_pda, true),          // update authority (signer via CPI)
            AccountMeta::new_readonly(*system_program.key, false),
            AccountMeta::new_readonly(*rent_info.key, false),
        ],
        data: ix_data,
    };

    msg!("Creating token metadata: name={}, symbol={}, uri={}",
        name, symbol, uri);

    invoke_signed(
        &create_metadata_ix,
        &[
            metadata_info.clone(),
            mint_info.clone(),
            arena_info.clone(),
            authority.clone(),
            arena_info.clone(),
            system_program.clone(),
            rent_info.clone(),
            metadata_program.clone(),
        ],
        &[&[b"arena", &[arena.bump]]],
    )?;

    msg!("✅ Token metadata created at {}", metadata_info.key);
    Ok(())
}
