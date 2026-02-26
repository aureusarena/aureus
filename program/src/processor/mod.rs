mod initialize_arena;
mod register_agent;
mod commit;
mod reveal;
mod score_match;
mod claim;
mod cleanup;
mod stake_aur;
mod unstake_aur;
mod claim_stake_rewards;
mod deploy_liquidity;
mod init_pool_position;
mod execute_meteora_lp;
mod claim_pool_fees;
mod close_commit;
mod create_token_metadata;
mod update_token_metadata;

use borsh::BorshDeserialize;
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

use crate::error::AureusError;
use crate::instruction::AureusInstruction;

pub struct Processor;

/// Verify that an account is owned by this program. Must be called
/// before any `try_from_slice` to prevent fake-account injection.
#[inline(never)]
pub(crate) fn require_program_owner(account: &AccountInfo, program_id: &Pubkey) -> ProgramResult {
    if account.owner != program_id {
        msg!("Account {} has wrong owner {} (expected {})",
            account.key, account.owner, program_id);
        Err(AureusError::InvalidOwner.into())
    } else {
        Ok(())
    }
}

/// Verify a PDA matches expected seeds.
#[inline(never)]
pub(crate) fn require_pda(account: &AccountInfo, seeds: &[&[u8]], program_id: &Pubkey) -> ProgramResult {
    let (expected, _) = Pubkey::find_program_address(seeds, program_id);
    if account.key != &expected {
        msg!("PDA mismatch: {} (expected {})", account.key, expected);
        Err(AureusError::InvalidPDA.into())
    } else {
        Ok(())
    }
}

#[inline(always)]
pub(crate) fn associated_token_program_id() -> Pubkey {
    Pubkey::new_from_array([
        140, 151, 37, 143, 78, 36, 137, 241,
        187, 61, 16, 41, 20, 142, 13, 131,
        11, 90, 19, 153, 218, 255, 16, 132,
        4, 142, 123, 216, 219, 233, 248, 89,
    ]) // ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
}

#[inline(always)]
pub(crate) fn derive_ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    let atp = associated_token_program_id();
    let (ata, _) = Pubkey::find_program_address(
        &[
            owner.as_ref(),
            spl_token::id().as_ref(),
            mint.as_ref(),
        ],
        &atp,
    );
    ata
}

/// Parse an upgradeable ProgramData account and return its upgrade authority.
/// Account must be owned by the BPF upgradeable loader.
#[inline(never)]
pub(crate) fn parse_programdata_upgrade_authority(program_data: &AccountInfo) -> Result<Option<Pubkey>, ProgramError> {
    use solana_program::bpf_loader_upgradeable;

    if program_data.owner != &bpf_loader_upgradeable::id() {
        msg!("ProgramData {} is not owned by BPF upgradeable loader", program_data.key);
        return Err(AureusError::InvalidOwner.into());
    }

    let data = program_data.data.borrow();
    if data.len() < bpf_loader_upgradeable::UpgradeableLoaderState::size_of_programdata_metadata() {
        msg!("ProgramData metadata too short: {}", data.len());
        return Err(AureusError::NotInitialized.into());
    }

    // bincode enum discriminant (u32 LE): ProgramData variant index = 3
    let variant = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    if variant != 3 {
        msg!("Expected ProgramData variant (3), got {}", variant);
        return Err(AureusError::InvalidOwner.into());
    }

    // Layout:
    // 0..4   discriminant
    // 4..12  slot (u64)
    // 12     Option tag for upgrade_authority_address
    // 13..45 pubkey bytes if tag == 1
    match data[12] {
        0 => Ok(None),
        1 => {
            let mut pk = [0u8; 32];
            pk.copy_from_slice(&data[13..45]);
            Ok(Some(Pubkey::new_from_array(pk)))
        }
        tag => {
            msg!("Invalid Option<Pubkey> tag in ProgramData: {}", tag);
            Err(AureusError::NotInitialized.into())
        }
    }
}

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = AureusInstruction::try_from_slice(instruction_data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match instruction {
            AureusInstruction::InitializeArena { genesis_slot } => {
                msg!("Instruction: InitializeArena");
                initialize_arena::process(program_id, accounts, genesis_slot)
            }
            AureusInstruction::RegisterAgent => {
                msg!("Instruction: RegisterAgent");
                register_agent::process(program_id, accounts)
            }
            AureusInstruction::Commit { round_number, commitment, tier } => {
                msg!("Instruction: Commit");
                commit::process(program_id, accounts, round_number, commitment, tier)
            }
            AureusInstruction::Reveal { round_number, strategy, nonce } => {
                msg!("Instruction: Reveal");
                reveal::process(program_id, accounts, round_number, strategy, nonce)
            }
            AureusInstruction::ScoreMatch { round_number, match_index } => {
                msg!("Instruction: ScoreMatch");
                score_match::process(program_id, accounts, round_number, match_index)
            }
            AureusInstruction::Claim { round_number } => {
                msg!("Instruction: Claim");
                claim::process(program_id, accounts, round_number)
            }
            AureusInstruction::Cleanup { round_number, match_index } => {
                msg!("Instruction: Cleanup");
                cleanup::process(program_id, accounts, round_number, match_index)
            }
            AureusInstruction::StakeAUR { amount } => {
                msg!("Instruction: StakeAUR");
                stake_aur::process(program_id, accounts, amount)
            }
            AureusInstruction::UnstakeAUR { amount } => {
                msg!("Instruction: UnstakeAUR");
                unstake_aur::process(program_id, accounts, amount)
            }
            AureusInstruction::ClaimStakeRewards => {
                msg!("Instruction: ClaimStakeRewards");
                claim_stake_rewards::process(program_id, accounts)
            }
            AureusInstruction::DeployLiquidity => {
                msg!("Instruction: DeployLiquidity");
                deploy_liquidity::process(program_id, accounts)
            }
            AureusInstruction::InitPoolPosition { lower_bin_id, width } => {
                msg!("Instruction: InitPoolPosition");
                init_pool_position::process(program_id, accounts, lower_bin_id, width)
            }
            AureusInstruction::ExecuteMeteoraLP { amount, active_id } => {
                msg!("Instruction: ExecuteMeteoraLP");
                execute_meteora_lp::process(program_id, accounts, amount, active_id)
            }
            AureusInstruction::ClaimPoolFees => {
                msg!("Instruction: ClaimPoolFees");
                claim_pool_fees::process(program_id, accounts)
            }
            AureusInstruction::CloseCommit { round_number } => {
                msg!("Instruction: CloseCommit");
                close_commit::process(program_id, accounts, round_number)
            }
            AureusInstruction::CreateTokenMetadata { name, symbol, uri } => {
                msg!("Instruction: CreateTokenMetadata");
                create_token_metadata::process(program_id, accounts, name, symbol, uri)
            }
            AureusInstruction::UpdateTokenMetadata { name, symbol, uri } => {
                msg!("Instruction: UpdateTokenMetadata");
                update_token_metadata::process(program_id, accounts, name, symbol, uri)
            }
        }
    }
}
