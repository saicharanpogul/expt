// ---------------------------------------------------------------------------
// @expt/sdk — Public API
// ---------------------------------------------------------------------------

// Client
export { ExptClient } from "./client";

// IDL
export { IDL, type Expt } from "./idl";

// Constants
export {
  EXPT_PROGRAM_ID,
  SEEDS,
  MAX_MILESTONES,
  MAX_NAME_LEN,
  MAX_URI_LEN,
  MAX_MILESTONE_DESC_LEN,
  MAX_DELIVERABLE_LEN,
  MAX_RAISE_LAMPORTS,
  BPS_DENOMINATOR,
  PRESALE_PROGRAM_ID,
  PRESALE_AUTHORITY,
  MEMO_PROGRAM_ID,
  DAMM_V2_PROGRAM_ID,
  DAMM_POOL_AUTHORITY,
  DAMM_SEEDS,
  NATIVE_MINT,
} from "./constants";

// PDA derivation
export {
  deriveExptConfigPda,
  deriveBuilderPda,
  deriveTreasuryPda,
  deriveVetoStakePda,
  derivePresalePda,
  derivePresaleVault,
  deriveQuoteVault,
  deriveEscrowPda,
  deriveDammPoolPda,
  deriveDammPositionPda,
  deriveDammPositionNftAccount,
  deriveDammTokenVault,
} from "./pda";

// Types & enums
export {
  ExptStatus,
  DeliverableType,
  MilestoneStatus,
  exptStatusLabel,
  milestoneStatusLabel,
  deliverableTypeLabel,
  bytesToString,
  stringToBytes,
  parseExptConfig,
  parseMilestone,
  parseVetoStake,
  parsePresaleState,
  parseBuilder,
  buildCreateExptConfigArgs,
  buildSubmitMilestoneArgs,
} from "./types";

// Type re-exports
export type {
  ParsedExptConfig,
  ParsedMilestone,
  ParsedVetoStake,
  ParsedPresaleState,
  ParsedBuilder,
  RawExptConfig,
  RawMilestone,
  RawVetoStake,
  RawBuilder,
  CreateExptConfigInput,
  InitializePresaleFromTreasuryInput,
  SubmitMilestoneInput,
  MilestoneInput,
} from "./types";

