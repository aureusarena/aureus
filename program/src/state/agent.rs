use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// ============================================================
// AGENT STATE — Per-agent PDA ["agent", pubkey]
// ============================================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct AgentState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub total_wins: u32,
    pub total_losses: u32,
    pub total_pushes: u32,
    pub last_100: [u8; 100],
    pub last_100_idx: u8,
    pub registered_at: u64,
    pub bump: u8,
    /// Total AUR earned all time (for stats)
    pub total_aur_earned: u64,
    /// Total SOL earned all time (for stats)
    pub total_sol_earned: u64,
    // === Per-tier match counts ===
    pub matches_t1: u32,
    pub matches_t2: u32,
    pub matches_t3: u32,
}

impl AgentState {
    pub const LEN: usize = 1 + 32 + 4 + 4 + 4 + 100 + 1 + 8 + 1 + 8 + 8
        + 4 + 4 + 4;  // per-tier match counts

    /// Total matches across all tiers
    pub fn total_matches(&self) -> u32 {
        self.total_wins + self.total_losses + self.total_pushes
    }

    /// Matches played at a specific tier
    pub fn matches_at_tier(&self, tier: u8) -> u32 {
        match tier {
            0 => self.matches_t1,
            1 => self.matches_t2,
            2 => self.matches_t3,
            _ => 0,
        }
    }

    /// Increment match count for a specific tier
    pub fn record_tier_match(&mut self, tier: u8) {
        match tier {
            0 => self.matches_t1 = self.matches_t1.saturating_add(1),
            1 => self.matches_t2 = self.matches_t2.saturating_add(1),
            2 => self.matches_t3 = self.matches_t3.saturating_add(1),
            _ => {}
        }
    }

    pub fn win_rate(&self) -> u8 {
        let total = self.total_wins + self.total_losses + self.total_pushes;
        if total == 0 { return 0; }
        let rounds = total.min(100) as usize;
        let mut wins = 0u32;
        let mut valid = 0u32;
        for i in 0..rounds {
            let idx = if (self.last_100_idx as usize) >= i + 1 {
                self.last_100_idx as usize - i - 1
            } else {
                100 + self.last_100_idx as usize - i - 1
            };
            match self.last_100[idx] {
                0 => { valid += 1; }
                1 => { wins += 1; valid += 1; }
                _ => {}
            }
        }
        if valid == 0 { return 0; }  // no matches → 0% (prevents tier-gate bypass)
        ((wins * 100) / valid) as u8
    }

    pub fn bucket(&self) -> u8 {
        let wr = self.win_rate();
        if wr > 65 { 0 }
        else if wr >= 50 { 1 }
        else if wr >= 35 { 2 }
        else { 3 }
    }

    pub fn record_result(&mut self, result: u8) {
        self.last_100[self.last_100_idx as usize] = result;
        self.last_100_idx = (self.last_100_idx + 1) % 100;
        match result {
            0 => self.total_losses = self.total_losses.saturating_add(1),
            1 => self.total_wins = self.total_wins.saturating_add(1),
            2 => self.total_pushes = self.total_pushes.saturating_add(1),
            _ => {}
        }
    }
}
