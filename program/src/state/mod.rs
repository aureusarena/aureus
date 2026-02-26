mod arena;
mod agent;
mod round;
mod commit;
mod stake;

pub use arena::*;
pub use agent::*;
pub use round::*;
pub use commit::*;
pub use stake::*;

#[cfg(test)]
mod tests {
    use super::ArenaState;

    #[test]
    fn test_production_economic_thresholds() {
        // Lock in mainnet production economics.
        // These must match the constants in arena.rs.
        assert_eq!(ArenaState::TIER2_STAKE_MIN, 1_000_000_000);    // 1,000 AUR
        assert_eq!(ArenaState::TIER3_STAKE_MIN, 10_000_000_000);   // 10,000 AUR
        assert_eq!(ArenaState::TIER2_MATCHES_MIN, 50);              // 50 T1 matches
        assert_eq!(ArenaState::TIER3_WIN_RATE_MIN, 55);             // 55% win rate
        assert_eq!(ArenaState::TIER2_UNLOCK_MIN, 10);               // 10 eligible stakers
        assert_eq!(ArenaState::TIER3_UNLOCK_MIN, 6);                // 6 eligible stakers
        assert_eq!(ArenaState::LP_DEPLOY_THRESHOLD, 1_000_000_000); // 1.0 SOL
    }
}
