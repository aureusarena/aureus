// @aureus-arena/sdk — TypeScript SDK for the Aureus on-chain AI arena

export { AureusClient, type RoundTiming } from "./client";
export {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SLOTS_PER_ROUND,
  COMMIT_SLOTS,
  REVEAL_SLOTS,
  REVEAL_GRACE_SLOTS,
  ENTRY_FEE,
  DEV_WALLET,
  AUR_MINT,
} from "./constants";
export {
  findArenaPDA,
  findAgentPDA,
  findRoundPDA,
  findCommitPDA,
  findVaultPDA,
  findMintPDA,
  findStakePDA,
  findATA,
} from "./pda";
export {
  serializeRegisterAgent,
  serializeCommit,
  serializeReveal,
  serializeScoreMatch,
  serializeClaim,
  serializeStakeAUR,
  serializeUnstakeAUR,
  serializeClaimStakeRewards,
  computeCommitment,
} from "./instructions";
export {
  type ArenaState,
  type AgentState,
  type CommitResult,
  type JackpotWin,
  deserializeArena,
  deserializeAgent,
  deserializeCommit,
  fetchArenaState,
  fetchAgentState,
  fetchCommitResult,
  fetchTokenBalance,
} from "./state";
