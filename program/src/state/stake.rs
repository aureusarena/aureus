use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// ============================================================
// STAKE STATE — Per-staker PDA ["stake", pubkey]
// ============================================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct StakeState {
    pub is_initialized: bool,
    pub owner: Pubkey,
    /// Amount of AUR tokens staked (in smallest units, 6 decimals)
    pub aur_staked: u64,
    /// Snapshot of reward_per_token_cumulative at time of last claim/stake
    pub reward_debt: u128,
    /// Unclaimed SOL rewards (lamports)
    pub pending_rewards: u64,
    /// Slot when staked
    pub staked_at: u64,
    pub bump: u8,
}

impl StakeState {
    // 1 + 32 + 8 + 16 + 8 + 8 + 1 = 74
    pub const LEN: usize = 1 + 32 + 8 + 16 + 8 + 8 + 1;
}
