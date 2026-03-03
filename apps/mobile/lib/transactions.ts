/**
 * Raw Anchor instruction builders for the Expt program.
 *
 * The SDK uses @coral-xyz/anchor which requires Node's `crypto` module,
 * unavailable in React Native. This module manually constructs
 * TransactionInstructions using pre-computed discriminators from the IDL.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

// NOTE: React Native provides a Buffer polyfill via `react-native-get-random-values`.
// We cast to Uint8Array where needed for TypeScript strictness.
// ── Program IDs & Seeds ─────────────────────────────────────────

export const EXPT_PROGRAM_ID = new PublicKey(
  "9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw"
);

const SEEDS = {
  EXPT_CONFIG: Buffer.from("expt_config"),
  TREASURY: Buffer.from("treasury"),
  VETO_STAKE: Buffer.from("veto_stake"),
} as const;

// ── Anchor Discriminators (from IDL expt.json) ──────────────────

const DISCRIMINATORS = {
  submitMilestone: Buffer.from([35, 96, 220, 215, 102, 83, 139, 52]),
  initiateVeto: Buffer.from([77, 201, 154, 77, 179, 78, 26, 133]),
  resolveMilestone: Buffer.from([183, 234, 132, 97, 208, 35, 45, 117]),
  claimBuilderFunds: Buffer.from([142, 161, 65, 35, 46, 7, 194, 97]),
} as const;

// ── PDA Derivation ──────────────────────────────────────────────

export function deriveExptConfigPda(
  builder: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EXPT_CONFIG, builder.toBuffer(), mint.toBuffer()],
    EXPT_PROGRAM_ID
  );
}

export function deriveTreasuryPda(
  exptConfig: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.TREASURY, exptConfig.toBuffer()],
    EXPT_PROGRAM_ID
  );
}

export function deriveVetoStakePda(
  exptConfig: PublicKey,
  staker: PublicKey,
  milestoneIndex: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEEDS.VETO_STAKE,
      exptConfig.toBuffer(),
      staker.toBuffer(),
      Buffer.from([milestoneIndex]),
    ],
    EXPT_PROGRAM_ID
  );
}

// ── Serialization Helpers ───────────────────────────────────────

/** Pad a UTF-8 string into a fixed-length byte array (Anchor's [u8; N]). */
function padString(s: string, len: number): Buffer {
  const buf = Buffer.alloc(len);
  const bytes = Buffer.from(s, "utf-8");
  bytes.copy(buf, 0, 0, Math.min(bytes.length, len));
  return buf;
}

/** Serialize a u64 as little-endian 8-byte buffer. */
function serializeU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

// ── Instruction Builders ────────────────────────────────────────

/**
 * Submit proof for a milestone.
 *
 * Accounts:
 *   0. [signer]   builder
 *   1. []          mint
 *   2. [writable]  exptConfig (PDA)
 *
 * Args: { milestone_index: u8, deliverable: [u8; 200] }
 */
export function buildSubmitMilestoneIx(
  builder: PublicKey,
  mint: PublicKey,
  milestoneIndex: number,
  deliverable: string
): TransactionInstruction {
  const [exptConfigPda] = deriveExptConfigPda(builder, mint);

  // Serialize args: 8-byte discriminator + 1-byte index + 200-byte deliverable
  const data = Buffer.concat([
    DISCRIMINATORS.submitMilestone,
    Buffer.from([milestoneIndex]),
    padString(deliverable, 200),
  ]);

  return new TransactionInstruction({
    programId: EXPT_PROGRAM_ID,
    keys: [
      { pubkey: builder, isSigner: true, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: exptConfigPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Stake SOL against a submitted milestone (veto).
 *
 * Accounts:
 *   0. [signer, writable] staker
 *   1. [writable]          exptConfig
 *   2. [writable]          vetoStake (PDA)
 *   3. [writable]          treasury (PDA)
 *   4. []                  systemProgram
 *
 * Args: { milestone_index: u8, amount: u64 }
 */
export function buildInitiateVetoIx(
  staker: PublicKey,
  exptConfig: PublicKey,
  milestoneIndex: number,
  amountLamports: bigint
): TransactionInstruction {
  const [vetoStakePda] = deriveVetoStakePda(exptConfig, staker, milestoneIndex);
  const [treasuryPda] = deriveTreasuryPda(exptConfig);

  // Serialize args: 8-byte discriminator + 1-byte index + 8-byte amount
  const data = Buffer.concat([
    DISCRIMINATORS.initiateVeto,
    Buffer.from([milestoneIndex]),
    serializeU64(amountLamports),
  ]);

  return new TransactionInstruction({
    programId: EXPT_PROGRAM_ID,
    keys: [
      { pubkey: staker, isSigner: true, isWritable: true },
      { pubkey: exptConfig, isSigner: false, isWritable: true },
      { pubkey: vetoStakePda, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Resolve a milestone after the challenge window expires.
 * Permissionless — anyone can call.
 *
 * Accounts:
 *   0. [signer]   payer
 *   1. [writable]  exptConfig
 *
 * Args: { milestone_index: u8 }
 */
export function buildResolveMilestoneIx(
  payer: PublicKey,
  exptConfig: PublicKey,
  milestoneIndex: number
): TransactionInstruction {
  // Serialize args: 8-byte discriminator + 1-byte index
  const data = Buffer.concat([
    DISCRIMINATORS.resolveMilestone,
    Buffer.from([milestoneIndex]),
  ]);

  return new TransactionInstruction({
    programId: EXPT_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: false },
      { pubkey: exptConfig, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Builder claims earned funds from the treasury.
 *
 * Accounts:
 *   0. [signer, writable] builder
 *   1. []                  mint
 *   2. [writable]          exptConfig (PDA)
 *   3. [writable]          treasury (PDA)
 *   4. []                  systemProgram
 *
 * Args: (none — uses empty data after discriminator)
 */
export function buildClaimBuilderFundsIx(
  builder: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  const [exptConfigPda] = deriveExptConfigPda(builder, mint);
  const [treasuryPda] = deriveTreasuryPda(exptConfigPda);

  const data = Buffer.from(DISCRIMINATORS.claimBuilderFunds);

  return new TransactionInstruction({
    programId: EXPT_PROGRAM_ID,
    keys: [
      { pubkey: builder, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: exptConfigPda, isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}
