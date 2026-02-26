import { PublicKey } from "@solana/web3.js";

// ═══════════════════════════════════════════════════
// Protocol Constants
// ═══════════════════════════════════════════════════

export const PROGRAM_ID = new PublicKey(
  "AUREUSL1HBkDa8Tt1mmvomXbDykepX28LgmwvK3CqvVn",
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

export const SLOTS_PER_ROUND = 30;
export const COMMIT_SLOTS = 20;
export const REVEAL_SLOTS = 8;
export const REVEAL_GRACE_SLOTS = 100;
export const ENTRY_FEE = 10_000_000; // 0.01 SOL in lamports

/** Hardcoded dev fee wallet — receives 2% of match pot during scoring */
export const DEV_WALLET = new PublicKey(
  "FEEFgCx5pZoyuBV78bRuqcyCRkuKpYkPeuFAgHiyA13A",
);

/** Vanity AUR token mint address (not PDA-derived) */
export const AUR_MINT = new PublicKey(
  "AUREUSnYXx3sWsS8gLcDJaMr8Nijwftcww1zbKHiDhF",
);
