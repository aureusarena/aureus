use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// ============================================================
// COMMIT STATE — Per-agent-per-round PDA ["commit", round_le, pubkey]
// ============================================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct CommitState {
    pub is_initialized: bool,
    pub agent: Pubkey,
    pub round_number: u64,
    pub commitment: [u8; 32],
    pub revealed: bool,
    pub strategy: [u8; 5],
    pub opponent: Pubkey,
    pub scored: bool,
    pub result: u8,       // 0=loss, 1=win, 2=push, 255=unset
    pub sol_won: u64,
    pub tokens_won: u64,
    pub claimed: bool,
    pub bump: u8,
    /// Did this agent win the jackpot this round?
    pub jackpot_sol_won: u64,
    pub jackpot_tokens_won: u64,
    /// Sequential index assigned at commit time (0-based, PER-TIER)
    pub commit_index: u32,
    /// Which tier this commit is playing at (0=Base, 1=Proven, 2=Elite)
    pub tier: u8,
}

impl CommitState {
    pub const LEN: usize = 1 + 32 + 8 + 32 + 1 + 5 + 32 + 1 + 1 + 8 + 8 + 1 + 1 + 8 + 8 + 4
        + 1;  // tier
}
