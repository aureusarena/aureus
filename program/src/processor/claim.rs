use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    hash::hash,
    msg,
    program::invoke_signed,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{clock::Clock, Sysvar},
};
use spl_token::state::Mint;

use crate::error::AureusError;
use crate::state::*;
use super::{derive_ata, require_program_owner, require_pda};

// ================================================================
// CLAIM — transfer SOL from vault + mint AUR tokens
// ================================================================
#[inline(never)]
pub fn process(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    _round_number: u64,
) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let commit_info = next_account_info(account_iter)?;
    let vault_info = next_account_info(account_iter)?;
    let arena_info = next_account_info(account_iter)?;
    let mint_info = next_account_info(account_iter)?;
    let agent_token_info = next_account_info(account_iter)?;
    let token_program = next_account_info(account_iter)?;
    let round_info = next_account_info(account_iter)?;
    let agent_info = next_account_info(account_iter)?;
    // Optional 10th account: vault's AUR fee ATA for transferring preminted jackpot AUR
    let vault_fee_aur_ata = next_account_info(account_iter).ok();

    if !authority.is_signer {
        return Err(AureusError::NotSigner.into());
    }

    // Owner checks
    require_program_owner(commit_info, _program_id)?;
    require_program_owner(arena_info, _program_id)?;
    require_program_owner(round_info, _program_id)?;
    require_program_owner(agent_info, _program_id)?;

    let mut commit = CommitState::try_from_slice(&commit_info.data.borrow())?;
    if commit.claimed {
        return Err(AureusError::AlreadyClaimed.into());
    }
    if commit.agent != *authority.key {
        return Err(AureusError::InvalidOwner.into());
    }

    let mut arena = ArenaState::try_from_slice(&arena_info.data.borrow())?;
    let round = RoundState::try_from_slice(&round_info.data.borrow())?;
    let mut agent = AgentState::try_from_slice(&agent_info.data.borrow())?;

    // Check if this agent is the odd one out (unmatched) for their tier
    let is_unmatched = if !commit.scored {
        let tier_commits = round.commits_for_tier(commit.tier);
        let is_odd_tier = tier_commits % 2 == 1;
        if is_odd_tier {
            // Use the same per-tier deterministic permutation as score/cleanup.
            // Do NOT assume "last commit index" is unmatched.
            let matchmaking_seed = if round.matchmaking_seed != [0u8; 32] {
                round.matchmaking_seed
            } else {
                let round_end_slot = arena.round_start_slot(commit.round_number)
                    + ArenaState::COMMIT_SLOTS + ArenaState::REVEAL_SLOTS;
                let mut seed_input = [0u8; 40];
                seed_input[..32].copy_from_slice(&round.reveal_entropy);
                seed_input[32..40].copy_from_slice(&round_end_slot.to_le_bytes());
                hash(&seed_input).to_bytes()
            };
            let mut tier_seed_input = [0u8; 33];
            tier_seed_input[..32].copy_from_slice(&matchmaking_seed);
            tier_seed_input[32] = commit.tier;
            let tier_seed = hash(&tier_seed_input).to_bytes();
            let unmatched_idx = ArenaState::deterministic_unmatched_index(&tier_seed, tier_commits);
            unmatched_idx == Some(commit.commit_index)
        } else {
            false
        }
    } else {
        false
    };
    if !commit.scored && !is_unmatched {
        return Err(AureusError::NotScored.into());
    }

    // PDA verification
    require_pda(arena_info, &[b"arena"], _program_id)?;
    require_pda(vault_info, &[b"sol_vault"], _program_id)?;
    // Validate mint matches arena's stored token_mint (vanity address, not PDA)
    if mint_info.key != &arena.token_mint {
        msg!("Mint mismatch: {} (expected {})", mint_info.key, arena.token_mint);
        return Err(AureusError::InvalidPDA.into());
    }
    let round_bytes = commit.round_number.to_le_bytes();
    require_pda(commit_info, &[b"commit", &round_bytes, authority.key.as_ref()], _program_id)?;
    require_pda(round_info, &[b"round", &round_bytes], _program_id)?;
    require_pda(agent_info, &[b"agent", authority.key.as_ref()], _program_id)?;
    // Validate token program
    if token_program.key != &spl_token::id() {
        return Err(AureusError::InvalidOwner.into());
    }

    // Validate agent_token_info is the expected ATA for the claimant.
    // Without this check, an attacker can pass ANY token account and redirect
    // minted AUR tokens to themselves.
    {
        let expected_ata = derive_ata(authority.key, mint_info.key);
        if agent_token_info.key != &expected_ata {
            msg!("S1: agent_token_info {} does not match expected ATA {}",
                agent_token_info.key, expected_ata);
            return Err(AureusError::InvalidPDA.into());
        }
    }

    // === GATE: Grace period must be expired ===
    let clock = Clock::get()?;
    if !arena.is_reveal_grace_expired(round.round_number, clock.slot) {
        msg!("Round {} grace period not expired yet (current slot {})",
            round.round_number, clock.slot);
        return Err(AureusError::RoundNotSettled.into());
    }

    commit.claimed = true;

    // === Handle unmatched agent: refund entry fee, no AUR reward ===
    let mut total_sol;
    let mut total_aur;
    let mut preminted_aur_transfer: u64 = 0; // AUR to transfer from vault ATA (not mint)
    if is_unmatched {
        // Refund the entry fee — agent had no opponent
        let entry_fee = ArenaState::entry_fee_for_tier(commit.tier);
        commit.result = 3; // 3 = unmatched
        commit.sol_won = entry_fee;
        total_sol = entry_fee;
        total_aur = 0;
        msg!("Unmatched agent (odd one out) — refunding {} lamports", entry_fee);
    } else {
        // Normal scored path
        total_sol = commit.sol_won;
        total_aur = commit.tokens_won;
        let tier = commit.tier;

        if commit.result == 1 {
            let tier_winners = round.winners_for_tier(tier);
            if tier_winners > 0 {
                let jackpot_sol_share = round.round_jackpot_sol_for_tier(tier) / tier_winners as u64;
                let jackpot_aur_share = round.round_jackpot_aur_for_tier(tier) / tier_winners as u64;

                // Calculate preminted (transfer) vs minted share for T1
                let preminted_share = if tier == 0 && round.round_jackpot_aur_preminted_t1 > 0 {
                    // Proportional: preminted_share = jackpot_share * preminted / total_aur_jackpot
                    let total_jp = round.round_jackpot_aur_t1;
                    if total_jp > 0 {
                        (jackpot_aur_share as u128 * round.round_jackpot_aur_preminted_t1 as u128
                            / total_jp as u128) as u64
                    } else { 0 }
                } else { 0 };

                commit.jackpot_sol_won = jackpot_sol_share;
                commit.jackpot_tokens_won = jackpot_aur_share;
                total_sol += jackpot_sol_share;

                // Split AUR: transfer preminted portion, mint the rest
                let aur_to_transfer = preminted_share;
                let aur_to_mint = jackpot_aur_share.saturating_sub(preminted_share);
                total_aur += aur_to_mint; // only the minted portion goes through mint_to
                preminted_aur_transfer += aur_to_transfer; // tracked separately for transfer

                msg!("🎰 T{} Jackpot share: {} SOL + {} AUR ({} mint + {} transfer) ({} winners)",
                    tier, jackpot_sol_share, jackpot_aur_share, aur_to_mint, aur_to_transfer, tier_winners);
            }
        }
    }

    // Update agent's cumulative earnings with jackpot amounts
    // (score_match only credited match winnings; jackpots are computed at claim time)
    if commit.jackpot_sol_won > 0 {
        agent.total_sol_earned += commit.jackpot_sol_won;
        arena.record_jackpot(commit.round_number, *authority.key, commit.jackpot_sol_won, 0); // 0 = SOL
    }
    if commit.jackpot_tokens_won > 0 {
        agent.total_aur_earned += commit.jackpot_tokens_won;
        arena.record_jackpot(commit.round_number, *authority.key, commit.jackpot_tokens_won, 1); // 1 = AUR
    }

    // 1. Transfer SOL from vault to agent (H7: rent-exempt protection)
    if total_sol > 0 {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(vault_info.data_len());
        let vault_balance = vault_info.lamports();
        let available = vault_balance.saturating_sub(min_balance);
        let actual_sol = total_sol.min(available);
        if actual_sol > 0 {
            **vault_info.try_borrow_mut_lamports()? -= actual_sol;
            **authority.try_borrow_mut_lamports()? += actual_sol;
            msg!("Transferred {} lamports to {}", actual_sol, authority.key);
        }
        if actual_sol < total_sol {
            msg!("⚠ Vault rent-protected: paid {} of {} SOL", actual_sol, total_sol);
        }
    }

    // 2a. Transfer preminted AUR from vault's AUR fee ATA (swap fee jackpot portion)
    if preminted_aur_transfer > 0 {
        if let Some(vault_fee_ata) = vault_fee_aur_ata {
            // Validate ATA is the expected vault fee AUR ATA
            let expected_fee_ata = derive_ata(vault_info.key, mint_info.key);
            if vault_fee_ata.key == &expected_fee_ata {
                let (_, vault_bump) = Pubkey::find_program_address(&[b"sol_vault"], _program_id);
                invoke_signed(
                    &spl_token::instruction::transfer(
                        &spl_token::id(),
                        vault_fee_ata.key,
                        agent_token_info.key,
                        vault_info.key,
                        &[],
                        preminted_aur_transfer,
                    )?,
                    &[
                        vault_fee_ata.clone(),
                        agent_token_info.clone(),
                        vault_info.clone(),
                        token_program.clone(),
                    ],
                    &[&[b"sol_vault", &[vault_bump]]],
                )?;
                msg!("Transferred {} preminted AUR from vault fee ATA", preminted_aur_transfer);
            } else {
                // ATA mismatch — fall back to minting
                msg!("⚠ Vault fee ATA mismatch, falling back to mint for {} AUR", preminted_aur_transfer);
                total_aur += preminted_aur_transfer;
            }
        } else {
            // No vault fee ATA provided — fall back to minting
            msg!("⚠ No vault fee ATA, falling back to mint for {} AUR", preminted_aur_transfer);
            total_aur += preminted_aur_transfer;
        }
    }

    // 2b. Mint AUR tokens to agent's token account
    //    Defense-in-depth: clamp to MAX_SUPPLY using actual Mint.supply
    //    so the hard cap can never be exceeded regardless of upstream logic.
    if total_aur > 0 {
        let mint_state = Mint::unpack(&mint_info.data.borrow())?;
        let remaining_mintable = ArenaState::MAX_SUPPLY.saturating_sub(mint_state.supply);
        total_aur = total_aur.min(remaining_mintable);

        if total_aur > 0 {
            invoke_signed(
                &spl_token::instruction::mint_to(
                    &spl_token::id(),
                    mint_info.key,
                    agent_token_info.key,
                    arena_info.key, // arena PDA is mint authority
                    &[],
                    total_aur,
                )?,
                &[
                    mint_info.clone(),
                    agent_token_info.clone(),
                    arena_info.clone(),
                    token_program.clone(),
                ],
                &[&[b"arena", &[arena.bump]]],
            )?;
            msg!("Minted {} AUR to {}", total_aur, authority.key);
        } else {
            msg!("⚠ Supply cap reached — no AUR minted");
        }
    }

    commit.serialize(&mut &mut commit_info.data.borrow_mut()[..])?;
    agent.serialize(&mut &mut agent_info.data.borrow_mut()[..])?;
    arena.serialize(&mut &mut arena_info.data.borrow_mut()[..])?;

    msg!("Claimed: SOL={}, AUR={} (jackpot: {}+{}), agent={}",
        total_sol, total_aur, commit.jackpot_sol_won, commit.jackpot_tokens_won, authority.key);
    Ok(())
}
