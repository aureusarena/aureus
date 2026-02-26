use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum AureusError {
    #[error("Wrong round number for current slot")]
    WrongRound,
    #[error("Not in commit phase")]
    NotCommitPhase,
    #[error("Not in reveal phase")]
    NotRevealPhase,
    #[error("Commitment hash mismatch")]
    CommitmentMismatch,
    #[error("Invalid strategy: must sum to 100")]
    InvalidStrategy,
    #[error("Already revealed")]
    AlreadyRevealed,
    #[error("Match not scored yet")]
    NotScored,
    #[error("Already claimed")]
    AlreadyClaimed,
    #[error("Round not over yet")]
    RoundNotOver,
    #[error("Agent not revealed - slashable")]
    DidNotReveal,
    #[error("Invalid PDA seeds")]
    InvalidPDA,
    #[error("Account not signer")]
    NotSigner,
    #[error("Account not writable")]
    NotWritable,
    #[error("Account already initialized")]
    AlreadyInitialized,
    #[error("Account not initialized")]
    NotInitialized,
    #[error("Invalid account owner")]
    InvalidOwner,
    #[error("Arithmetic overflow")]
    Overflow,
    #[error("Opponent has not revealed yet")]
    OpponentNotRevealed,
    #[error("Match already scored")]
    AlreadyScored,
    #[error("Insufficient funds")]
    InsufficientFunds,
    #[error("Not authorized")]
    NotAuthority,
    #[error("Agents do not match deterministic matchmaking pairing")]
    MatchmakingMismatch,
    #[error("Round not settled — grace period has not expired")]
    RoundNotSettled,
    #[error("Invalid tier value (must be 0, 1, or 2)")]
    InvalidTier,
    #[error("Insufficient AUR staked for this tier")]
    InsufficientStakeForTier,
    #[error("Not enough matches played to qualify for this tier")]
    InsufficientMatchesForTier,
    #[error("Win rate too low for elite tier")]
    InsufficientWinRate,
    #[error("Tier not unlocked — not enough eligible stakers")]
    TierNotUnlocked,
    #[error("Stake cooldown active — wait for cooldown to expire before unstaking or claiming")]
    StakeCooldownActive,
}

impl From<AureusError> for ProgramError {
    fn from(e: AureusError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
