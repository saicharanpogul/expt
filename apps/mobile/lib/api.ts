/**
 * Data layer for the mobile app — direct RPC via @solana/web3.js.
 *
 * Manually deserializes zero-copy ExptConfig accounts without Anchor/SDK
 * (which requires Node's `crypto` module unavailable in React Native).
 *
 * Layout reference: programs/expt/src/state/expt_config.rs
 * ExptConfig: 8 (discriminator) + 1760 (struct) = 1768 bytes
 * Milestone:  408 bytes each, 3 inline
 */

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { Platform } from "react-native";

// ── Constants ───────────────────────────────────────────────────
// Android emulator uses 10.0.2.2 to reach host machine's localhost.
// Physical devices on same network use the host's LAN IP.
const LOCALNET_RPC =
  Platform.OS === "android"
    ? "http://10.0.2.2:8899" // Android emulator → host localhost
    : "http://localhost:8899"; // iOS simulator → host localhost

const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL || LOCALNET_RPC;

const PROGRAM_ID = new PublicKey(
  "9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw"
);

const MAX_NAME_LEN = 32;
const MAX_URI_LEN = 200;
const MAX_MILESTONE_DESC_LEN = 128;
const MAX_DELIVERABLE_LEN = 200;
const MAX_MILESTONES = 3;
const ANCHOR_DISCRIMINATOR_LEN = 8;

// ── Singleton connection ────────────────────────────────────────
let _connection: Connection | null = null;

function getConnection(): Connection {
  if (!_connection) {
    _connection = new Connection(RPC_URL, "confirmed");
  }
  return _connection;
}

// ── Enums ───────────────────────────────────────────────────────

export enum ExptStatus {
  Created = 0,
  PresaleActive = 1,
  PresaleFailed = 2,
  Active = 3,
  Completed = 4,
}

export enum MilestoneStatus {
  Pending = 0,
  Submitted = 1,
  Challenged = 2,
  Passed = 3,
  Failed = 4,
}

const EXPT_STATUS_LABELS: Record<number, string> = {
  [ExptStatus.Created]: "Created",
  [ExptStatus.PresaleActive]: "Presale Active",
  [ExptStatus.PresaleFailed]: "Presale Failed",
  [ExptStatus.Active]: "Active",
  [ExptStatus.Completed]: "Completed",
};

const MILESTONE_STATUS_LABELS: Record<number, string> = {
  [MilestoneStatus.Pending]: "Pending",
  [MilestoneStatus.Submitted]: "Submitted",
  [MilestoneStatus.Challenged]: "Challenged",
  [MilestoneStatus.Passed]: "Passed",
  [MilestoneStatus.Failed]: "Failed",
};

// ── Types ───────────────────────────────────────────────────────

export interface ParsedMilestone {
  index: number;
  description: string;
  unlockBps: number;
  unlockPercent: number;
  deadline: Date;
  status: MilestoneStatus;
  statusLabel: string;
  submittedAt: Date | null;
  deliverable: string;
  totalVetoStake: number; // lamports as number (safe for display)
  challengeWindowEnd: Date | null;
}

export interface ParsedExptConfig {
  address: PublicKey;
  builder: PublicKey;
  builderPda: PublicKey;
  name: string;
  uri: string;
  presale: PublicKey;
  mint: PublicKey;
  treasuryBump: number;
  status: ExptStatus;
  statusLabel: string;
  milestoneCount: number;
  poolLaunched: boolean;
  presaleFundsWithdrawn: boolean;
  presaleMinimumCap: number;
  totalTreasuryReceived: number;
  totalClaimedByBuilder: number;
  vetoThresholdBps: number;
  vetoThresholdPercent: number;
  challengeWindow: number;
  milestones: ParsedMilestone[];
  dammPool: PublicKey;
  positionNftMint: PublicKey;
  lpPosition: PublicKey;
  totalSupply: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function bytesToString(buf: Uint8Array): string {
  let end = buf.length;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder().decode(buf.slice(0, end));
}

function readPublicKey(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32));
}

function readU8(data: Uint8Array, offset: number): number {
  return data[offset];
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU64LE(data: Uint8Array, offset: number): number {
  // Read as two 32-bit halves (safe for values < 2^53)
  const lo = data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0);
  const hi = data[offset + 4] |
    (data[offset + 5] << 8) |
    (data[offset + 6] << 16) |
    ((data[offset + 7] << 24) >>> 0);
  return lo + hi * 0x100000000;
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

// ── Deserializer ────────────────────────────────────────────────
// Layout (zero-copy, no Borsh — direct struct read):
//
// Milestone (408 bytes):
//   [0..128]   description: [u8; 128]
//   [128]      deliverable_type: u8
//   [129]      _padding0: u8
//   [130..132] unlock_bps: u16
//   [132..136] _padding1: [u8; 4]
//   [136..144] deadline: u64
//   [144]      status: u8
//   [145..152] _padding2: [u8; 7]
//   [152..160] submitted_at: u64
//   [160..360] deliverable: [u8; 200]
//   [360..368] total_veto_stake: u64
//   [368..376] challenge_window_end: u64
//   [376..408] padding: [u8; 32]
//
// ExptConfig (1760 bytes, after 8-byte discriminator):
//   [0..32]    builder: Pubkey
//   [32..64]   name: [u8; 32]
//   [64..264]  uri: [u8; 200]
//   [264..296] presale: Pubkey
//   [296..328] mint: Pubkey
//   [328]      treasury_bump: u8
//   [329]      status: u8
//   [330]      milestone_count: u8
//   [331]      pool_launched: u8
//   [332]      presale_funds_withdrawn: u8
//   [333..336] _padding0: [u8; 3]
//   [336..344] presale_minimum_cap: u64
//   [344..352] total_treasury_received: u64
//   [352..360] total_claimed_by_builder: u64
//   [360..362] veto_threshold_bps: u16
//   [362..368] _padding1: [u8; 6]
//   [368..376] challenge_window: u64
//   [376..1600] milestones: [Milestone; 3]  (3 × 408 = 1224)
//   [1600..1632] damm_pool: Pubkey
//   [1632..1664] position_nft_mint: Pubkey
//   [1664..1696] lp_position: Pubkey
//   [1696..1704] total_supply: u64
//   [1704..1736] builder_pda: Pubkey
//   [1736..1760] padding: [u8; 24]

function parseMilestone(data: Uint8Array, baseOffset: number, index: number): ParsedMilestone {
  const description = bytesToString(data.slice(baseOffset, baseOffset + MAX_MILESTONE_DESC_LEN));
  const unlockBps = readU16LE(data, baseOffset + 130);
  const deadline = readU64LE(data, baseOffset + 136);
  const status = readU8(data, baseOffset + 144);
  const submittedAt = readU64LE(data, baseOffset + 152);
  const deliverable = bytesToString(data.slice(baseOffset + 160, baseOffset + 160 + MAX_DELIVERABLE_LEN));
  const totalVetoStake = readU64LE(data, baseOffset + 360);
  const challengeWindowEnd = readU64LE(data, baseOffset + 368);

  return {
    index,
    description,
    unlockBps,
    unlockPercent: unlockBps / 100,
    deadline: new Date(deadline * 1000),
    status: status as MilestoneStatus,
    statusLabel: MILESTONE_STATUS_LABELS[status] ?? `Unknown(${status})`,
    submittedAt: submittedAt > 0 ? new Date(submittedAt * 1000) : null,
    deliverable,
    totalVetoStake,
    challengeWindowEnd: challengeWindowEnd > 0 ? new Date(challengeWindowEnd * 1000) : null,
  };
}

function parseExptConfig(data: Uint8Array, address: PublicKey): ParsedExptConfig {
  // Skip the 8-byte Anchor discriminator
  const d = data.slice(ANCHOR_DISCRIMINATOR_LEN);

  const builder = readPublicKey(d, 0);
  const name = bytesToString(d.slice(32, 32 + MAX_NAME_LEN));
  const uri = bytesToString(d.slice(64, 64 + MAX_URI_LEN));
  const presale = readPublicKey(d, 264);
  const mint = readPublicKey(d, 296);
  const treasuryBump = readU8(d, 328);
  const status = readU8(d, 329);
  const milestoneCount = readU8(d, 330);
  const poolLaunched = readU8(d, 331) !== 0;
  const presaleFundsWithdrawn = readU8(d, 332) !== 0;
  const presaleMinimumCap = readU64LE(d, 336);
  const totalTreasuryReceived = readU64LE(d, 344);
  const totalClaimedByBuilder = readU64LE(d, 352);
  const vetoThresholdBps = readU16LE(d, 360);
  const challengeWindow = readU64LE(d, 368);

  const milestones: ParsedMilestone[] = [];
  const msBase = 376; // milestones start offset
  const msSize = 408; // each milestone
  for (let i = 0; i < milestoneCount; i++) {
    milestones.push(parseMilestone(d, msBase + i * msSize, i));
  }

  const dammPool = readPublicKey(d, 1600);
  const positionNftMint = readPublicKey(d, 1632);
  const lpPosition = readPublicKey(d, 1664);
  const totalSupply = readU64LE(d, 1696);
  const builderPda = readPublicKey(d, 1704);

  return {
    address,
    builder,
    builderPda,
    name,
    uri,
    presale,
    mint,
    treasuryBump,
    status: status as ExptStatus,
    statusLabel: EXPT_STATUS_LABELS[status] ?? `Unknown(${status})`,
    milestoneCount,
    poolLaunched,
    presaleFundsWithdrawn,
    presaleMinimumCap,
    totalTreasuryReceived,
    totalClaimedByBuilder,
    vetoThresholdBps,
    vetoThresholdPercent: vetoThresholdBps / 100,
    challengeWindow,
    milestones,
    dammPool,
    positionNftMint,
    lpPosition,
    totalSupply,
  };
}

// ── Data fetching (direct RPC) ──────────────────────────────────

/**
 * Fetch all ExptConfig accounts from the program using getProgramAccounts.
 * Filters by expected data size (1768 bytes = 8 discriminator + 1760 struct).
 */
export async function fetchExperiments(): Promise<ParsedExptConfig[]> {
  try {
    const connection = getConnection();
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: ANCHOR_DISCRIMINATOR_LEN + 1760 }],
    });

    return accounts.map((a) =>
      parseExptConfig(new Uint8Array(a.account.data), a.pubkey)
    );
  } catch (err) {
    console.warn("[api] Failed to fetch experiments from RPC:", err);
    return [];
  }
}

/**
 * Fetch a single ExptConfig by its PDA address.
 */
export async function fetchExperiment(
  address: string
): Promise<ParsedExptConfig | null> {
  try {
    const connection = getConnection();
    const pubkey = new PublicKey(address);
    const info = await connection.getAccountInfo(pubkey);
    if (!info || !info.data) return null;
    return parseExptConfig(new Uint8Array(info.data), pubkey);
  } catch (err) {
    console.warn("[api] Failed to fetch experiment:", err);
    return null;
  }
}

/**
 * Fetch experiments belonging to a specific builder wallet.
 * Uses a memcmp filter on the builder field (offset 8, first 32 bytes after discriminator).
 */
export async function fetchExperimentsByBuilder(
  builderWallet: string
): Promise<ParsedExptConfig[]> {
  try {
    const connection = getConnection();
    const builder = new PublicKey(builderWallet);
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { dataSize: ANCHOR_DISCRIMINATOR_LEN + 1760 },
        {
          memcmp: {
            offset: ANCHOR_DISCRIMINATOR_LEN, // builder is the first field
            bytes: builder.toBase58(),
          },
        },
      ],
    });

    return accounts.map((a) =>
      parseExptConfig(new Uint8Array(a.account.data), a.pubkey)
    );
  } catch (err) {
    console.warn("[api] Failed to fetch builder experiments:", err);
    return [];
  }
}
