use borsh::{BorshDeserialize, BorshSerialize};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum AureusInstruction {
    /// Initialize the arena with token mint + SOL vault.
    /// Accounts:
    ///   0. `[signer, writable]` Authority
    ///   1. `[writable]` Arena PDA (seeds: ["arena"])
    ///   2. `[writable]` Token Mint (hardcoded: AUREUSnYXx3sWsS8gLcDJaMr8Nijwftcww1zbKHiDhF)
    ///   3. `[writable]` SOL Vault PDA (seeds: ["sol_vault"])
    ///   4. `[]` System program
    ///   5. `[]` Token program
    ///   6. `[]` Rent sysvar
    ///   7. `[]` ProgramData PDA for this program (upgrade-authority check)
    InitializeArena { genesis_slot: u64 },

    /// Register an agent.
    /// Accounts:
    ///   0. `[signer, writable]` Agent wallet
    ///   1. `[writable]` Agent PDA (seeds: ["agent", wallet])
    ///   2. `[writable]` Arena PDA
    ///   3. `[]` System program
    RegisterAgent,

    /// Commit a strategy hash + SOL entry fee.
    /// Accounts:
    ///   0. `[signer, writable]` Agent wallet
    ///   1. `[]` Agent PDA
    ///   2. `[writable]` Arena PDA
    ///   3. `[writable]` Round PDA (seeds: ["round", round_le])
    ///   4. `[writable]` Commit PDA (seeds: ["commit", round_le, wallet])
    ///   5. `[writable]` SOL Vault PDA
    ///   6. `[]` System program
    Commit {
        round_number: u64,
        commitment: [u8; 32],
        tier: u8,
    },

    /// Reveal strategy + nonce.
    /// Accounts:
    ///   0. `[signer, writable]` Agent wallet
    ///   1. `[]` Agent PDA
    ///   2. `[]` Arena PDA
    ///   3. `[writable]` Round PDA
    ///   4. `[writable]` Commit PDA
    Reveal {
        round_number: u64,
        strategy: [u8; 5],
        nonce: [u8; 32],
    },

    /// Score a match between two revealed agents.
    /// Accounts:
    ///   0. `[signer]` Cranker (anyone)
    ///   1. `[writable]` Arena PDA
    ///   2. `[writable]` Round PDA
    ///   3. `[writable]` Commit PDA (agent A)
    ///   4. `[writable]` Commit PDA (agent B)
    ///   5. `[writable]` Agent PDA (agent A)
    ///   6. `[writable]` Agent PDA (agent B)
    ///   7. `[writable]` SOL Vault PDA
    ///   8. `[writable]` Dev Fee Wallet (must match DEV_WALLET constant)
    ScoreMatch { round_number: u64, match_index: u32 },

    /// Claim SOL winnings + mint AUR tokens.
    /// Accounts:
    ///   0. `[signer, writable]` Agent wallet
    ///   1. `[writable]` Commit PDA
    ///   2. `[writable]` SOL Vault PDA
    ///   3. `[]` Arena PDA (mint authority)
    ///   4. `[writable]` Token Mint PDA
    ///   5. `[writable]` Agent's AUR token account (ATA)
    ///   6. `[]` Token program
    ///   7. `[]` Round PDA (for jackpot calc)
    ///   8. `[writable]` Agent PDA (seeds: ["agent", wallet]) — for jackpot totals
    ///   9. `[writable, optional]` Vault's AUR fee ATA — for transferring preminted jackpot AUR
    Claim { round_number: u64 },

    /// Slash non-revealers after round ends.
    /// Accounts:
    ///   0. `[signer]` Anyone
    ///   1. `[writable]` Arena PDA
    ///   2. `[writable]` Round PDA (writable for num_scored tracking)
    ///   3. `[writable]` Commit PDA (agent A)
    ///   4. `[writable]` Commit PDA (agent B)
    ///   5. `[writable]` Agent PDA (agent A)
    ///   6. `[writable]` Agent PDA (agent B)
    ///   7. `[writable]` SOL Vault PDA
    ///   8. `[writable]` Dev Fee Wallet (must match DEV_WALLET constant)
    Cleanup { round_number: u64, match_index: u32 },

    /// Stake AUR tokens to earn SOL yield from protocol revenue.
    /// Transfers AUR from staker's token account to a vault ATA.
    /// Accounts:
    ///   0. `[signer, writable]` Staker wallet
    ///   1. `[writable]` Stake PDA (seeds: ["stake", wallet])
    ///   2. `[writable]` Arena PDA
    ///   3. `[writable]` Staker's AUR token account (source)
    ///   4. `[writable]` Vault AUR token account (seeds: ["aur_vault"]) dest
    ///   5. `[]` Token program
    ///   6. `[]` System program
    StakeAUR { amount: u64 },

    /// Unstake AUR tokens. Returns AUR + claims pending SOL rewards.
    /// Accounts:
    ///   0. `[signer, writable]` Staker wallet
    ///   1. `[writable]` Stake PDA
    ///   2. `[writable]` Arena PDA
    ///   3. `[writable]` Staker's AUR token account (dest)
    ///   4. `[writable]` Vault AUR token account (source)
    ///   5. `[writable]` SOL Vault PDA
    ///   6. `[]` Token program
    UnstakeAUR { amount: u64 },

    /// Claim accumulated SOL staking rewards without unstaking.
    /// Accounts:
    ///   0. `[signer, writable]` Staker wallet
    ///   1. `[writable]` Stake PDA
    ///   2. `[writable]` Arena PDA
    ///   3. `[writable]` SOL Vault PDA
    ClaimStakeRewards,

    /// Deploy accumulated LP fund SOL to designated LP wallet.
    /// Permissionless — anyone can trigger this when lp_fund > threshold.
    /// Accounts:
    ///   0. `[signer]` Anyone (cranker/agent)
    ///   1. `[writable]` Arena PDA
    ///   2. `[writable]` SOL Vault PDA (source)
    ///   3. `[writable]` LP Wallet (destination — wSOL for Meteora pool)
    DeployLiquidity,

    /// Initialize a Meteora DLMM position owned by the vault PDA.
    /// CPI into Meteora's initialize_position with vault PDA signing.
    /// Accounts:
    ///   0. `[signer, writable]` Funder (pays rent)
    ///   1. `[writable]` Arena PDA (must match funder authority, pins lb_pair)
    ///   2. `[writable]` SOL Vault PDA (owner/signer for position)
    ///   3. `[signer, writable]` Position keypair
    ///   4. `[]` LB Pair
    ///   5. `[]` System program
    ///   6. `[]` Rent sysvar
    ///   7. `[]` Event authority
    ///   8. `[]` DLMM program
    InitPoolPosition {
        lower_bin_id: i32,
        width: i32,
    },

    /// Execute Meteora DLMM add_liquidity_one_side via CPI.
    /// Called AFTER DeployLiquidity moves lamports to wSOL ATA.
    /// Handles sync_native + Meteora CPI with vault PDA signing.
    /// Accounts:
    ///   0. `[signer]` Arena authority
    ///   1. `[]` Arena PDA (must contain sanctioned lb_pair)
    ///   2. `[]` SOL Vault PDA (signer for Meteora CPI)
    ///   3-13. Meteora remaining accounts
    ExecuteMeteoraLP {
        amount: u64,
        active_id: i32,
    },

    /// Claim accrued swap fees from Meteora DLMM position.
    /// Permissionless — anyone can trigger fee collection.
    /// Flow: update_fees_and_rewards CPI → claim_fee CPI → close wSOL ATA → route SOL to staker pool
    /// Accounts:
    ///   0. `[signer]` Anyone (cranker)
    ///   1. `[writable]` Arena PDA
    ///   2. `[]` SOL Vault PDA (signer for Meteora CPI — owns the position)
    ///   3. `[writable]` Position account
    ///   4. `[writable]` LB Pair (DLMM pool)
    ///   5. `[writable]` Bin array lower
    ///   6. `[writable]` Bin array upper
    ///   7. `[writable]` Reserve X (pool's token X reserve)
    ///   8. `[writable]` Reserve Y (pool's token Y reserve)
    ///   9. `[writable]` Vault ATA for token X (fee destination)
    ///  10. `[writable]` Vault ATA for token Y (fee destination)
    ///  11. `[]` Token X mint
    ///  12. `[]` Token Y mint
    ///  13. `[]` Token program
    ///  14. `[]` Event authority
    ///  15. `[]` DLMM program
    ClaimPoolFees,

    /// Close a claimed commit PDA to reclaim rent SOL.
    /// Only the commit owner can close it, and only after claiming.
    /// Accounts:
    ///   0. `[signer, writable]` Agent wallet (must match commit.agent)
    ///   1. `[writable]` Commit PDA (will be zeroed + lamports reclaimed)
    CloseCommit { round_number: u64 },

    /// Close a round PDA to reclaim rent SOL.
    /// Permissionless — anyone can close once grace period expires.
    /// Accounts:
    ///   0. `[signer, writable]` Payer (receives reclaimed lamports)
    ///   1. `[writable]` Round PDA (will be zeroed + lamports reclaimed)
    ///   2. `[]` Arena PDA (for grace period check)
    CloseRound { round_number: u64 },

    /// Create/update Metaplex token metadata for the AUR mint.
    /// Authority-only. CPIs into Metaplex Token Metadata program.
    /// Accounts:
    ///   0. `[signer, writable]` Arena authority
    ///   1. `[]` Arena PDA
    ///   2. `[]` Token Mint (AUR_MINT)
    ///   3. `[writable]` Metadata PDA (derived from Metaplex + mint)
    ///   4. `[]` System program
    ///   5. `[]` Rent sysvar
    ///   6. `[]` Metaplex Token Metadata program
    CreateTokenMetadata {
        name: String,
        symbol: String,
        uri: String,
    },

    /// Update existing Metaplex token metadata for the AUR mint.
    /// Authority-only. CPIs into Metaplex Token Metadata program.
    /// Accounts:
    ///   0. `[signer, writable]` Arena authority
    ///   1. `[]` Arena PDA
    ///   2. `[]` Token Mint (AUR_MINT)
    ///   3. `[writable]` Metadata PDA (derived from Metaplex + mint)
    ///   4. `[]` Metaplex Token Metadata program
    UpdateTokenMetadata {
        name: String,
        symbol: String,
        uri: String,
    },
}
