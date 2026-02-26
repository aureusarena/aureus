use borsh::{BorshDeserialize, BorshSerialize};

// ============================================================
// ROUND STATE — Per-round PDA ["round", round_number_le_bytes]
// ============================================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct RoundState {
    pub is_initialized: bool,
    pub round_number: u64,
    pub num_commits: u32,        // total across all tiers
    pub num_reveals: u32,
    pub num_scored: u32,
    pub matchmaking_done: bool,
    pub matchmaking_seed: [u8; 32],
    pub field_weights: [u8; 5],
    pub total_pot: u64,
    pub emission_per_match: u64,  // kept for backward compat, T1 emission
    pub bump: u8,
    /// How many match winners this round (incremented during scoring)
    pub num_winners: u32,
    /// SOL jackpot pool for this round (legacy — now per-tier)
    pub round_jackpot_sol: u64,
    /// AUR jackpot pool for this round (legacy — now per-tier)
    pub round_jackpot_aur: u64,
    // === Per-tier commit counts ===
    pub num_commits_t1: u32,
    pub num_commits_t2: u32,
    pub num_commits_t3: u32,
    // === Per-tier total pots ===
    pub total_pot_t1: u64,
    pub total_pot_t2: u64,
    pub total_pot_t3: u64,
    // === Per-tier emission per match ===
    pub emission_per_match_t1: u64,
    pub emission_per_match_t2: u64,
    pub emission_per_match_t3: u64,
    // === Per-tier round jackpots (snapshotted from global when triggered) ===
    pub round_jackpot_sol_t1: u64,
    pub round_jackpot_sol_t2: u64,
    pub round_jackpot_sol_t3: u64,
    pub round_jackpot_aur_t1: u64,
    pub round_jackpot_aur_t2: u64,
    pub round_jackpot_aur_t3: u64,
    // === Per-tier winner counts ===
    pub num_winners_t1: u32,
    pub num_winners_t2: u32,
    pub num_winners_t3: u32,
    /// Accumulated entropy from reveals — XOR of all commitment hashes.
    /// Makes matchmaking seed unpredictable until all reveals are in.
    pub reveal_entropy: [u8; 32],
    /// Portion of round_jackpot_aur_t1 that is pre-minted (from swap fees).
    /// These tokens are already in the vault ATA and need TRANSFER, not mint_to.
    pub round_jackpot_aur_preminted_t1: u64,
}

impl RoundState {
    pub const LEN: usize = 1 + 8 + 4 + 4 + 4 + 1 + 32 + 5 + 8 + 8 + 1
        + 4 + 8 + 8                        // num_winners + legacy jackpots
        + (3 * 4)                           // per-tier commit counts (u32)
        + (3 * 8)                           // per-tier pots
        + (3 * 8)                           // per-tier emission per match
        + (6 * 8)                           // per-tier round jackpots (3 SOL + 3 AUR)
        + (3 * 4)                           // per-tier winner counts (u32)
        + 32                                // reveal_entropy
        + 8;                                // round_jackpot_aur_preminted_t1

    /// Get commit count for a specific tier
    pub fn commits_for_tier(&self, tier: u8) -> u32 {
        match tier {
            0 => self.num_commits_t1,
            1 => self.num_commits_t2,
            2 => self.num_commits_t3,
            _ => 0,
        }
    }

    /// Get emission per match for a specific tier
    pub fn emission_for_tier(&self, tier: u8) -> u64 {
        match tier {
            0 => self.emission_per_match_t1,
            1 => self.emission_per_match_t2,
            2 => self.emission_per_match_t3,
            _ => 0,
        }
    }

    /// Get round jackpot SOL for a specific tier
    pub fn round_jackpot_sol_for_tier(&self, tier: u8) -> u64 {
        match tier {
            0 => self.round_jackpot_sol_t1,
            1 => self.round_jackpot_sol_t2,
            2 => self.round_jackpot_sol_t3,
            _ => 0,
        }
    }

    /// Get round jackpot AUR for a specific tier
    pub fn round_jackpot_aur_for_tier(&self, tier: u8) -> u64 {
        match tier {
            0 => self.round_jackpot_aur_t1,
            1 => self.round_jackpot_aur_t2,
            2 => self.round_jackpot_aur_t3,
            _ => 0,
        }
    }

    /// Get winners count for a specific tier
    pub fn winners_for_tier(&self, tier: u8) -> u32 {
        match tier {
            0 => self.num_winners_t1,
            1 => self.num_winners_t2,
            2 => self.num_winners_t3,
            _ => 0,
        }
    }
}
