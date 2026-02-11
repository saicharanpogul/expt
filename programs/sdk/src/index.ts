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
} from "./constants";

// PDA derivation
export {
  deriveExptConfigPda,
  deriveTreasuryPda,
  deriveVetoStakePda,
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
  buildCreateExptConfigArgs,
  buildSubmitMilestoneArgs,
} from "./types";

// Type re-exports
export type {
  ParsedExptConfig,
  ParsedMilestone,
  ParsedVetoStake,
  RawExptConfig,
  RawMilestone,
  RawVetoStake,
  CreateExptConfigInput,
  SubmitMilestoneInput,
  MilestoneInput,
} from "./types";
