import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ---------------------------------------------------------------------------
// Enums  (must match on-chain repr(u8) enums)
// ---------------------------------------------------------------------------

export enum ExptStatus {
  Created = 0,
  PresaleActive = 1,
  PresaleFailed = 2,
  Active = 3,
  Completed = 4,
}

export enum DeliverableType {
  Url = 0,
  Github = 1,
  ProgramId = 2,
  Deployment = 3,
}

export enum MilestoneStatus {
  Pending = 0,
  Submitted = 1,
  Challenged = 2,
  Passed = 3,
  Failed = 4,
}

// ---------------------------------------------------------------------------
// Human-readable label helpers
// ---------------------------------------------------------------------------

const EXPT_STATUS_LABELS: Record<ExptStatus, string> = {
  [ExptStatus.Created]: "Created",
  [ExptStatus.PresaleActive]: "Presale Active",
  [ExptStatus.PresaleFailed]: "Presale Failed",
  [ExptStatus.Active]: "Active",
  [ExptStatus.Completed]: "Completed",
};

const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  [MilestoneStatus.Pending]: "Pending",
  [MilestoneStatus.Submitted]: "Submitted",
  [MilestoneStatus.Challenged]: "Challenged",
  [MilestoneStatus.Passed]: "Passed",
  [MilestoneStatus.Failed]: "Failed",
};

const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  [DeliverableType.Url]: "URL",
  [DeliverableType.Github]: "GitHub",
  [DeliverableType.ProgramId]: "Program ID",
  [DeliverableType.Deployment]: "Deployment",
};

export function exptStatusLabel(status: number): string {
  return EXPT_STATUS_LABELS[status as ExptStatus] ?? `Unknown(${status})`;
}

export function milestoneStatusLabel(status: number): string {
  return (
    MILESTONE_STATUS_LABELS[status as MilestoneStatus] ?? `Unknown(${status})`
  );
}

export function deliverableTypeLabel(deliverableType: number): string {
  return (
    DELIVERABLE_TYPE_LABELS[deliverableType as DeliverableType] ??
    `Unknown(${deliverableType})`
  );
}

// ---------------------------------------------------------------------------
// Byte-array ↔ String helpers
// ---------------------------------------------------------------------------

/**
 * Convert a null-padded byte array to a trimmed UTF-8 string.
 */
export function bytesToString(bytes: number[] | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Find the first null byte to trim
  let end = arr.length;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder().decode(arr.slice(0, end));
}

/**
 * Convert a string to a null-padded byte array of the given length.
 */
export function stringToBytes(str: string, length: number): number[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length > length) {
    throw new Error(
      `String "${str}" exceeds max length of ${length} bytes (got ${encoded.length})`
    );
  }
  const result = new Array(length).fill(0);
  for (let i = 0; i < encoded.length; i++) {
    result[i] = encoded[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parsed types (human-readable representations of on-chain state)
// ---------------------------------------------------------------------------

export interface ParsedMilestone {
  index: number;
  description: string;
  deliverableType: DeliverableType;
  deliverableTypeLabel: string;
  unlockBps: number;
  unlockPercent: number;
  deadline: Date;
  status: MilestoneStatus;
  statusLabel: string;
  submittedAt: Date | null;
  deliverable: string;
  totalVetoStake: BN;
  challengeWindowEnd: Date | null;
}

export interface ParsedExptConfig {
  address: PublicKey;
  builder: PublicKey;
  name: string;
  uri: string;
  presale: PublicKey;
  mint: PublicKey;
  treasuryBump: number;
  status: ExptStatus;
  statusLabel: string;
  milestoneCount: number;
  presaleMinimumCap: BN;
  totalTreasuryReceived: BN;
  totalClaimedByBuilder: BN;
  vetoThresholdBps: number;
  vetoThresholdPercent: number;
  challengeWindow: BN;
  milestones: ParsedMilestone[];
}

export interface ParsedVetoStake {
  address: PublicKey;
  exptConfig: PublicKey;
  staker: PublicKey;
  milestoneIndex: number;
  amount: BN;
}

// ---------------------------------------------------------------------------
// Raw account types (as returned by Anchor deserialization)
// ---------------------------------------------------------------------------

export interface RawMilestone {
  description: number[];
  deliverableType: number;
  unlockBps: number;
  deadline: BN;
  status: number;
  submittedAt: BN;
  deliverable: number[];
  totalVetoStake: BN;
  challengeWindowEnd: BN;
  // padding fields omitted
}

export interface RawExptConfig {
  builder: PublicKey;
  name: number[];
  uri: number[];
  presale: PublicKey;
  mint: PublicKey;
  treasuryBump: number;
  status: number;
  milestoneCount: number;
  presaleMinimumCap: BN;
  totalTreasuryReceived: BN;
  totalClaimedByBuilder: BN;
  vetoThresholdBps: number;
  challengeWindow: BN;
  milestones: RawMilestone[];
  // padding fields omitted
}

export interface RawVetoStake {
  exptConfig: PublicKey;
  staker: PublicKey;
  milestoneIndex: number;
  amount: BN;
  // padding fields omitted
}

// ---------------------------------------------------------------------------
// Parsers (raw → human-readable)
// ---------------------------------------------------------------------------

/**
 * Parse a raw Milestone from Anchor deserialization into a readable format.
 */
export function parseMilestone(
  raw: RawMilestone,
  index: number
): ParsedMilestone {
  const deadlineSec = raw.deadline.toNumber();
  const submittedAtSec = raw.submittedAt.toNumber();
  const challengeEndSec = raw.challengeWindowEnd.toNumber();

  return {
    index,
    description: bytesToString(raw.description),
    deliverableType: raw.deliverableType as DeliverableType,
    deliverableTypeLabel: deliverableTypeLabel(raw.deliverableType),
    unlockBps: raw.unlockBps,
    unlockPercent: raw.unlockBps / 100,
    deadline: new Date(deadlineSec * 1000),
    status: raw.status as MilestoneStatus,
    statusLabel: milestoneStatusLabel(raw.status),
    submittedAt: submittedAtSec > 0 ? new Date(submittedAtSec * 1000) : null,
    deliverable: bytesToString(raw.deliverable),
    totalVetoStake: raw.totalVetoStake,
    challengeWindowEnd:
      challengeEndSec > 0 ? new Date(challengeEndSec * 1000) : null,
  };
}

/**
 * Parse a raw ExptConfig from Anchor deserialization into a readable format.
 */
export function parseExptConfig(
  raw: RawExptConfig,
  address: PublicKey
): ParsedExptConfig {
  const milestones: ParsedMilestone[] = [];
  for (let i = 0; i < raw.milestoneCount; i++) {
    milestones.push(parseMilestone(raw.milestones[i], i));
  }

  return {
    address,
    builder: raw.builder,
    name: bytesToString(raw.name),
    uri: bytesToString(raw.uri),
    presale: raw.presale,
    mint: raw.mint,
    treasuryBump: raw.treasuryBump,
    status: raw.status as ExptStatus,
    statusLabel: exptStatusLabel(raw.status),
    milestoneCount: raw.milestoneCount,
    presaleMinimumCap: raw.presaleMinimumCap,
    totalTreasuryReceived: raw.totalTreasuryReceived,
    totalClaimedByBuilder: raw.totalClaimedByBuilder,
    vetoThresholdBps: raw.vetoThresholdBps,
    vetoThresholdPercent: raw.vetoThresholdBps / 100,
    challengeWindow: raw.challengeWindow,
    milestones,
  };
}

/**
 * Parse a raw VetoStake from Anchor deserialization into a readable format.
 */
export function parseVetoStake(
  raw: RawVetoStake,
  address: PublicKey
): ParsedVetoStake {
  return {
    address,
    exptConfig: raw.exptConfig,
    staker: raw.staker,
    milestoneIndex: raw.milestoneIndex,
    amount: raw.amount,
  };
}

// ---------------------------------------------------------------------------
// Instruction arg builders (string → byte arrays)
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  /** Human-readable description (max 128 bytes) */
  description: string;
  /** Deliverable type */
  deliverableType: DeliverableType;
  /** Unlock percentage in basis points (100 = 1%) */
  unlockBps: number;
  /** Deadline as a Date or unix timestamp (seconds) */
  deadline: Date | number;
}

export interface CreateExptConfigInput {
  /** Experiment name (max 32 bytes) */
  name: string;
  /** Metadata URI (max 200 bytes) */
  uri: string;
  /** Minimum SOL for presale success (in lamports) */
  presaleMinimumCap: BN;
  /** Veto threshold in basis points */
  vetoThresholdBps: number;
  /** Challenge window in seconds */
  challengeWindow: BN;
  /** Milestones (1-3) */
  milestones: MilestoneInput[];
}

/**
 * Convert CreateExptConfigInput into the on-chain args format.
 */
export function buildCreateExptConfigArgs(input: CreateExptConfigInput) {
  return {
    name: stringToBytes(input.name, 32),
    uri: stringToBytes(input.uri, 200),
    presaleMinimumCap: input.presaleMinimumCap,
    vetoThresholdBps: input.vetoThresholdBps,
    challengeWindow: input.challengeWindow,
    milestones: input.milestones.map((m) => ({
      description: stringToBytes(m.description, 128),
      deliverableType: m.deliverableType as number,
      unlockBps: m.unlockBps,
      deadline: new BN(
        typeof m.deadline === "number"
          ? m.deadline
          : Math.floor(m.deadline.getTime() / 1000)
      ),
    })),
  };
}

export interface SubmitMilestoneInput {
  milestoneIndex: number;
  /** Deliverable proof (URL, program ID, etc. — max 200 bytes) */
  deliverable: string;
}

/**
 * Convert SubmitMilestoneInput into the on-chain args format.
 */
export function buildSubmitMilestoneArgs(input: SubmitMilestoneInput) {
  return {
    milestoneIndex: input.milestoneIndex,
    deliverable: stringToBytes(input.deliverable, 200),
  };
}
