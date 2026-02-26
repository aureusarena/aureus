use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// ============================================================
// ARENA STATE — Global singleton PDA ["arena"]
// ============================================================

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone)]
pub struct ArenaState {
    pub is_initialized: bool,
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub sol_vault: Pubkey,
    pub genesis_slot: u64,
    pub total_rounds: u64,
    pub total_agents: u64,
    pub current_era: u8,
    pub total_emitted: u64,
    // Per-tier SOL jackpot pools
    pub sol_jackpot_t1: u64,
    pub sol_jackpot_t2: u64,
    pub sol_jackpot_t3: u64,
    // Per-tier AUR jackpot pools
    pub token_jackpot_t1: u64,
    pub token_jackpot_t2: u64,
    pub token_jackpot_t3: u64,
    pub bump: u8,
    pub mint_bump: u8,
    pub vault_bump: u8,
    /// Total SOL collected by protocol (10% cut — before split)
    pub protocol_revenue: u64,
    /// Staker reward pool: 30% of protocol revenue, distributed to AUR stakers
    pub staker_reward_pool: u64,
    /// Total AUR currently staked across all stakers
    pub total_aur_staked: u64,
    /// Cumulative SOL per staked-AUR factor (scaled by 1e12 for precision)
    pub reward_per_token_cumulative: u128,
    /// SOL accumulated for LP deployment to Meteora (40% of protocol cut)
    pub lp_fund: u64,
    /// Meteora DLMM pool address for AUR/SOL liquidity
    pub lp_pool: Pubkey,
    /// Cumulative SOL deployed to LP pool
    pub total_lp_deployed: u64,
    // === Jackpot history (ring buffer of last 10) ===
    /// Round numbers where jackpots were won
    pub jackpot_rounds: [u64; 10],
    /// Winners of each jackpot
    pub jackpot_winners: [Pubkey; 10],
    /// Amount won (lamports for SOL, tokens for AUR)
    pub jackpot_amounts: [u64; 10],
    /// Type: 0 = SOL, 1 = AUR
    pub jackpot_types: [u8; 10],
    /// Current index in the ring buffer
    pub jackpot_history_idx: u8,
    // === Tier eligibility counters ===
    /// Number of stakers with >= TIER2_STAKE_MIN AUR staked
    pub total_stakers_t2_eligible: u32,
    /// Number of stakers with >= TIER3_STAKE_MIN AUR staked
    pub total_stakers_t3_eligible: u32,
    /// AUR from DLMM swap fees, routed to T1 token jackpot.
    /// These tokens are already minted (sitting in vault's AUR ATA),
    /// so jackpot payout transfers them instead of minting new ones.
    pub swap_fee_aur_jackpot: u64,
}

impl ArenaState {
    // Size: original fields + per-tier jackpots (6*8=48 replaces old 2*8=16, net +32)
    //       + tier eligible counters (2*4=8)
    pub const LEN: usize = 1 + 32 + 32 + 32 + 8 + 8 + 8 + 1 + 8
        + (6 * 8)       // 6 jackpot pools (3 SOL + 3 AUR) instead of old 2
        + 1 + 1 + 1 + 8 + 8 + 8 + 16 + 8 + 32 + 8
        + (10 * 8) + (10 * 32) + (10 * 8) + 10 + 1
        + 4 + 4          // tier eligible counters
        + 8;             // swap_fee_aur_jackpot

    // === Protocol constants ===
    pub const SLOTS_PER_ROUND: u64 = 30;
    pub const COMMIT_SLOTS: u64 = 20;
    pub const REVEAL_SLOTS: u64 = 8;
    /// Grace period for delayed reveals (~40 seconds at 400ms/slot)
    pub const REVEAL_GRACE_SLOTS: u64 = 100;
    pub const MAX_SUPPLY: u64 = 21_000_000_000_000; // 21M with 6 decimals
    pub const BASE_EMISSION: u64 = 5_000_000;       // 5 AUR per round (6 dec)
    pub const ROUNDS_PER_ERA: u64 = 2_100_000;

    // === Tier entry fees ===
    pub const TIER1_ENTRY_FEE: u64 = 10_000_000;    // 0.01 SOL
    pub const TIER2_ENTRY_FEE: u64 = 50_000_000;    // 0.05 SOL
    pub const TIER3_ENTRY_FEE: u64 = 100_000_000;   // 0.1 SOL

    // === Tier staking minimums (6 decimals) ===
    pub const TIER1_STAKE_MIN: u64 = 0;                   // no stake needed
    pub const TIER2_STAKE_MIN: u64 = 1_000_000_000;       // 1,000 AUR
    pub const TIER3_STAKE_MIN: u64 = 10_000_000_000;      // 10,000 AUR

    // === Tier match requirements ===
    pub const TIER2_MATCHES_MIN: u32 = 50;   // 50 matches at T1
    pub const TIER3_WIN_RATE_MIN: u8 = 55;   // 55% win rate

    // === Tier unlock thresholds (min eligible stakers to open tier) ===
    pub const TIER2_UNLOCK_MIN: u32 = 10;    // 10 eligible stakers
    pub const TIER3_UNLOCK_MIN: u32 = 6;     // 6 eligible stakers

    // === Tier emission multipliers (basis: 100 = 1.0x) ===
    pub const TIER1_EMISSION_MULT: u64 = 100;  // 1.0x
    pub const TIER2_EMISSION_MULT: u64 = 200;  // 2.0x
    pub const TIER3_EMISSION_MULT: u64 = 400;  // 4.0x

    // Keep ENTRY_FEE for backward compat in constants export
    pub const ENTRY_FEE: u64 = Self::TIER1_ENTRY_FEE;

    pub const WINNER_CUT_BPS: u64 = 8500;             // 85%
    pub const PROTOCOL_CUT_BPS: u64 = 1000;           // 10%
    pub const JACKPOT_CUT_BPS: u64 = 500;             // 5%
    pub const TOKEN_WINNER_BPS: u64 = 6500;            // 65% to winner
    pub const TOKEN_LOSER_BPS: u64 = 0;                // 0% to loser (BTC principle: win or nothing)
    pub const TOKEN_JACKPOT_BPS: u64 = 3500;           // 35% to jackpot pool (anti-Sybil)
    // Protocol SOL split (of the 10% protocol cut)
    pub const PROTO_LP_BPS: u64 = 4000;                // 40% → LP seeding
    pub const PROTO_STAKER_BPS: u64 = 3000;            // 30% → staker rewards
    pub const PROTO_JACKPOT_BPS: u64 = 1000;           // 10% → jackpot boost
    pub const PROTO_DEV_BPS: u64 = 2000;               // 20% → dev treasury
    pub const REWARD_PRECISION: u128 = 1_000_000_000_000; // 1e12
    pub const LP_DEPLOY_THRESHOLD: u64 = 1_000_000_000;       // 1.0 SOL min deploy threshold
    /// Minimum stake amount to prevent dust-harvesting rounding exploits.
    /// Staking tiny amounts could harvest rounded-up rewards and slowly drain
    /// the staker pool. This floor makes rounding negligible.
    pub const MIN_STAKE_AMOUNT: u64 = 100_000;               // 0.1 AUR minimum (6 decimals)
    pub const SOL_JACKPOT_ODDS: u64 = 500;              // 1 in 500
    pub const TOKEN_JACKPOT_ODDS: u64 = 2500;            // 1 in 2500
    pub const TOKEN_DECIMALS: u8 = 6;
    /// Cooldown period after staking before unstake/claim is allowed.
    /// Prevents reward-sniping: staking large amounts right before scoring,
    /// capturing disproportionate rewards, then immediately unstaking.
    /// 200 rounds × 30 slots = 6,000 slots ≈ 40 minutes at 400ms/slot.
    pub const STAKE_COOLDOWN_SLOTS: u64 = 6_000;

    /// Hardcoded dev fee wallet — receives 20% of protocol cut automatically
    /// during every ScoreMatch / Cleanup. No withdrawal instruction needed.
    /// Address: FEEFgCx5pZoyuBV78bRuqcyCRkuKpYkPeuFAgHiyA13A
    pub const DEV_WALLET: Pubkey = Pubkey::new_from_array([
        211, 103, 39, 25, 249, 208, 192, 34,
        219, 86, 171, 198, 163, 217, 5, 227,
        242, 87, 133, 65, 14, 170, 35, 199,
        170, 2, 19, 96, 225, 195, 136, 133,
    ]);

    /// Hardcoded AUR token mint address (vanity: AUREUSnYXx3sWsS8gLcDJaMr8Nijwftcww1zbKHiDhF).
    /// Created via createWithSeed off-chain before arena initialization.
    /// base: 8JWwWhAndW8Fac9Xmy7viMzq6TEJaGwyjb4dAtc5JvW8
    /// seed: "s3HujoRlXTdXqTEp"
    /// owner: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
    pub const AUR_MINT: Pubkey = Pubkey::new_from_array([
        2, 109, 58, 139, 24, 191, 154, 55,
        34, 18, 171, 156, 115, 46, 104, 6,
        28, 98, 175, 117, 180, 226, 45, 136,
        233, 8, 117, 245, 127, 142, 148, 118,
    ]);

    /// Get entry fee for a given tier
    pub fn entry_fee_for_tier(tier: u8) -> u64 {
        match tier {
            0 => Self::TIER1_ENTRY_FEE,
            1 => Self::TIER2_ENTRY_FEE,
            2 => Self::TIER3_ENTRY_FEE,
            _ => Self::TIER1_ENTRY_FEE,
        }
    }

    /// Get minimum stake for a given tier
    pub fn stake_min_for_tier(tier: u8) -> u64 {
        match tier {
            0 => Self::TIER1_STAKE_MIN,
            1 => Self::TIER2_STAKE_MIN,
            2 => Self::TIER3_STAKE_MIN,
            _ => 0,
        }
    }

    /// Get emission multiplier for a tier (basis 100)
    pub fn emission_mult_for_tier(tier: u8) -> u64 {
        match tier {
            0 => Self::TIER1_EMISSION_MULT,
            1 => Self::TIER2_EMISSION_MULT,
            2 => Self::TIER3_EMISSION_MULT,
            _ => Self::TIER1_EMISSION_MULT,
        }
    }

    /// Check if a tier is unlocked (enough eligible stakers)
    pub fn is_tier_unlocked(&self, tier: u8) -> bool {
        match tier {
            0 => true, // T1 always open
            1 => self.total_stakers_t2_eligible >= Self::TIER2_UNLOCK_MIN,
            2 => self.total_stakers_t3_eligible >= Self::TIER3_UNLOCK_MIN,
            _ => false,
        }
    }

    /// Get mutable reference to the SOL jackpot for a tier
    pub fn sol_jackpot_for_tier(&self, tier: u8) -> u64 {
        match tier {
            0 => self.sol_jackpot_t1,
            1 => self.sol_jackpot_t2,
            2 => self.sol_jackpot_t3,
            _ => 0,
        }
    }

    /// Get mutable reference to the token jackpot for a tier
    pub fn token_jackpot_for_tier(&self, tier: u8) -> u64 {
        match tier {
            0 => self.token_jackpot_t1,
            1 => self.token_jackpot_t2,
            2 => self.token_jackpot_t3,
            _ => 0,
        }
    }

    /// Add to SOL jackpot for a specific tier (saturating to prevent overflow)
    pub fn add_sol_jackpot(&mut self, tier: u8, amount: u64) {
        match tier {
            0 => self.sol_jackpot_t1 = self.sol_jackpot_t1.saturating_add(amount),
            1 => self.sol_jackpot_t2 = self.sol_jackpot_t2.saturating_add(amount),
            2 => self.sol_jackpot_t3 = self.sol_jackpot_t3.saturating_add(amount),
            _ => {}
        }
    }

    /// Add to token jackpot for a specific tier (saturating to prevent overflow)
    pub fn add_token_jackpot(&mut self, tier: u8, amount: u64) {
        match tier {
            0 => self.token_jackpot_t1 = self.token_jackpot_t1.saturating_add(amount),
            1 => self.token_jackpot_t2 = self.token_jackpot_t2.saturating_add(amount),
            2 => self.token_jackpot_t3 = self.token_jackpot_t3.saturating_add(amount),
            _ => {}
        }
    }

    /// Drain SOL jackpot for a tier (returns amount drained)
    pub fn drain_sol_jackpot(&mut self, tier: u8) -> u64 {
        match tier {
            0 => { let v = self.sol_jackpot_t1; self.sol_jackpot_t1 = 0; v }
            1 => { let v = self.sol_jackpot_t2; self.sol_jackpot_t2 = 0; v }
            2 => { let v = self.sol_jackpot_t3; self.sol_jackpot_t3 = 0; v }
            _ => 0,
        }
    }

    /// Drain token jackpot for a tier (returns amount drained)
    pub fn drain_token_jackpot(&mut self, tier: u8) -> u64 {
        match tier {
            0 => { let v = self.token_jackpot_t1; self.token_jackpot_t1 = 0; v }
            1 => { let v = self.token_jackpot_t2; self.token_jackpot_t2 = 0; v }
            2 => { let v = self.token_jackpot_t3; self.token_jackpot_t3 = 0; v }
            _ => 0,
        }
    }

    pub fn round_for_slot(&self, slot: u64) -> u64 {
        if slot < self.genesis_slot { return 0; }
        (slot - self.genesis_slot) / Self::SLOTS_PER_ROUND
    }

    pub fn round_start_slot(&self, round: u64) -> u64 {
        self.genesis_slot + round * Self::SLOTS_PER_ROUND
    }

    pub fn is_commit_phase(&self, slot: u64) -> bool {
        let start = self.round_start_slot(self.round_for_slot(slot));
        slot >= start && slot < start + Self::COMMIT_SLOTS
    }

    pub fn is_reveal_phase(&self, slot: u64) -> bool {
        let start = self.round_start_slot(self.round_for_slot(slot));
        let reveal_start = start + Self::COMMIT_SLOTS;
        slot >= reveal_start && slot < reveal_start + Self::REVEAL_SLOTS
    }

    /// Can an agent still reveal for a given round?
    /// Allowed anytime after commit window closes, up to REVEAL_GRACE_SLOTS later.
    /// This protects agents from chain congestion — the commitment is already
    /// hash-locked so delayed reveals have no game-theory exploit.
    pub fn can_still_reveal(&self, commit_round: u64, current_slot: u64) -> bool {
        let commit_end = self.round_start_slot(commit_round) + Self::COMMIT_SLOTS;
        let grace_deadline = commit_end + Self::REVEAL_GRACE_SLOTS;
        current_slot >= commit_end && current_slot < grace_deadline
    }

    /// Has the reveal grace period expired for a round?
    /// Used by Cleanup to know when to process unrevealed commits.
    pub fn is_reveal_grace_expired(&self, round: u64, current_slot: u64) -> bool {
        let commit_end = self.round_start_slot(round) + Self::COMMIT_SLOTS;
        current_slot >= commit_end + Self::REVEAL_GRACE_SLOTS
    }

    pub fn is_round_over(&self, round: u64, current_slot: u64) -> bool {
        let start = self.round_start_slot(round);
        current_slot >= start + Self::COMMIT_SLOTS + Self::REVEAL_SLOTS
    }

    /// Returns true once the full 21M AUR has been minted.
    pub fn supply_capped(&self) -> bool {
        self.total_emitted >= Self::MAX_SUPPLY
    }

    /// Emission per round in current era. Zero once supply is capped.
    /// Uses saturating shift so this can never panic regardless of era value.
    pub fn emission_per_round(&self) -> u64 {
        if self.supply_capped() { return 0; }
        if self.current_era >= 64 { return 0; }
        let emission = Self::BASE_EMISSION.checked_shr(self.current_era as u32).unwrap_or(0);
        if emission == 0 { return 0; }
        let remaining = Self::MAX_SUPPLY - self.total_emitted;
        emission.min(remaining)
    }

    /// Cumulative tokens budgeted through the end of a given era.
    /// = BASE_EMISSION * ROUNDS_PER_ERA * (2 - 2^-(era))  [geometric series]
    /// Simplified: sum from i=0..=era of (BASE * ROUNDS >> i)
    fn cumulative_budget_through_era(era: u8) -> u64 {
        let mut total: u64 = 0;
        for i in 0..=(era as u32) {
            let era_budget = Self::BASE_EMISSION
                .saturating_mul(Self::ROUNDS_PER_ERA)
                .checked_shr(i)
                .unwrap_or(0);
            total = total.saturating_add(era_budget);
        }
        total
    }

    /// True when enough tokens have been emitted to advance to the next era.
    pub fn should_advance_era(&self) -> bool {
        if self.current_era >= 63 { return false; }
        let budget = Self::cumulative_budget_through_era(self.current_era);
        self.total_emitted >= budget.min(Self::MAX_SUPPLY)
    }



    /// Check field weights from hash bytes. Returns 5 weights in [1, 2, 3].
    pub fn compute_field_weights(hash_bytes: &[u8]) -> [u8; 5] {
        let mut w = [0u8; 5];
        for i in 0..5 {
            w[i] = (hash_bytes[i] % 41) + 10; // range [10, 50]
        }
        w
    }

    /// Check if SOL jackpot triggers using entropy bytes (1 in 500).
    pub fn check_sol_jackpot(entropy: &[u8]) -> bool {
        if entropy.len() < 8 { return false; }
        let val = u64::from_le_bytes([
            entropy[0], entropy[1], entropy[2], entropy[3],
            entropy[4], entropy[5], entropy[6], entropy[7],
        ]);
        (val % Self::SOL_JACKPOT_ODDS) == 0
    }

    /// Check if token jackpot triggers using entropy bytes (1 in 2500).
    pub fn check_token_jackpot(entropy: &[u8]) -> bool {
        if entropy.len() < 16 { return false; }
        let val = u64::from_le_bytes([
            entropy[8], entropy[9], entropy[10], entropy[11],
            entropy[12], entropy[13], entropy[14], entropy[15],
        ]);
        (val % Self::TOKEN_JACKPOT_ODDS) == 0
    }

    /// Record a jackpot win in the history ring buffer.
    pub fn record_jackpot(&mut self, round: u64, winner: Pubkey, amount: u64, jackpot_type: u8) {
        let idx = self.jackpot_history_idx as usize;
        self.jackpot_rounds[idx] = round;
        self.jackpot_winners[idx] = winner;
        self.jackpot_amounts[idx] = amount;
        self.jackpot_types[idx] = jackpot_type;
        self.jackpot_history_idx = ((idx + 1) % 10) as u8;
    }

    /// Deterministic pairing using a Feistel network permutation.
    /// Works for ANY number of agents (no memory allocation, O(1) per lookup).
    /// Returns (agent_a_index, agent_b_index) for the given match_index.
    pub fn deterministic_pair(seed: &[u8; 32], n: u32, match_index: u32) -> (u32, u32) {
        let a = Self::feistel_permute(seed, n, match_index * 2);
        let b = Self::feistel_permute(seed, n, match_index * 2 + 1);
        (a, b)
    }

    /// For odd `n`, returns the unmatched index under the deterministic
    /// permutation (the image of the last logical position).
    pub fn deterministic_unmatched_index(seed: &[u8; 32], n: u32) -> Option<u32> {
        if n == 0 || n % 2 == 0 {
            None
        } else {
            Some(Self::feistel_permute(seed, n, n - 1))
        }
    }

    /// Feistel network permutation — maps position `pos` to a unique index in [0, n).
    /// Uses a 6-round balanced Feistel cipher with cycle-walking for non-power-of-2 sizes.
    /// Guarantees: bijective (every input maps to exactly one output), deterministic,
    /// and uniform distribution given a good hash function.
    #[inline(never)]
    fn feistel_permute(seed: &[u8; 32], n: u32, pos: u32) -> u32 {
        if n <= 1 { return 0; }
        if n == 2 {
            // Special case: 2 elements. Use single hash to decide swap.
            let mut input = [0u8; 33];
            input[..32].copy_from_slice(seed);
            input[32] = 0;
            let h = solana_program::hash::hash(&input);
            return if pos == 0 { h.to_bytes()[0] as u32 % 2 } else { 1 - (h.to_bytes()[0] as u32 % 2) };
        }

        // Find smallest even number of bits >= ceil(log2(n))
        let mut bits = 0u32;
        let mut temp = n - 1;
        while temp > 0 { bits += 1; temp >>= 1; }
        if bits % 2 != 0 { bits += 1; } // ensure even for balanced halves
        let half = bits / 2;
        let half_mask = (1u32 << half) - 1;

        // Cycle-walking: repeat Feistel until result is in [0, n)
        let mut val = pos;
        loop {
            let mut left = (val >> half) & half_mask;
            let mut right = val & half_mask;

            // 6-round balanced Feistel for good diffusion
            for round in 0..6u8 {
                let mut input = [0u8; 37];
                input[..32].copy_from_slice(seed);
                input[32] = round;
                input[33] = (right & 0xFF) as u8;
                input[34] = ((right >> 8) & 0xFF) as u8;
                input[35] = ((right >> 16) & 0xFF) as u8;
                input[36] = ((right >> 24) & 0xFF) as u8;
                let h = solana_program::hash::hash(&input);
                let hash_val = u32::from_le_bytes([
                    h.to_bytes()[0], h.to_bytes()[1],
                    h.to_bytes()[2], h.to_bytes()[3],
                ]);
                let new_left = right;
                let new_right = (left ^ hash_val) & half_mask;
                left = new_left;
                right = new_right;
            }

            val = (left << half) | right;
            if val < n { return val; }
            // Cycle-walk: re-apply Feistel with the out-of-range result
        }
    }
}
