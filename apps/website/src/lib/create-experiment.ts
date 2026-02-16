/**
 * create-experiment.ts
 *
 * Builds the full set of transactions needed to create an experiment:
 *   TX 1 — Create ExptConfig (on-chain mint creation + total supply mint + authority revoke)
 *   TX 2 — Initialize Meteora presale from treasury
 *
 * Mirrors the logic in programs/tests/localnet-e2e.ts (Phase 1 + Phase 2).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
} from "@solana/spl-token";
import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ExptClient,
  deriveExptConfigPda,
  deriveTreasuryPda,
  derivePresalePda,
} from "@expt/sdk";
import type { CreateExptConfigInput, MilestoneInput, InitializePresaleFromTreasuryInput } from "@expt/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateExperimentParams {
  name: string;
  uri: string;
  symbol: string;
  raiseTargetSol: number;
  minCapSol: number;
  presaleDurationSeconds: number;
  vetoThresholdBps: number;
  challengeWindowSeconds: number;
  milestones: Array<{
    description: string;
    deliverableType: string; // "url" | "github" | "program_id" | "deployment"
    unlockBps: number;
    deadline: string; // datetime-local string
  }>;
}

export interface CreationStep {
  label: string;
  status: "pending" | "processing" | "signing" | "confirming" | "done" | "error";
  signature?: string;
  error?: string;
}

export type StepCallback = (steps: CreationStep[]) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DELIVERABLE_TYPE_MAP: Record<string, number> = {
  url: 0,
  github: 1,
  program_id: 2,
  deployment: 3,
};

const TOTAL_SUPPLY = new BN("1000000000000000"); // 1M tokens × 10^9 decimals
const DECIMALS = 9;

// ---------------------------------------------------------------------------
// Main creation flow
// ---------------------------------------------------------------------------

/**
 * Execute the full experiment creation flow:
 *   Step 1: Create ExptConfig (on-chain mint + treasury ATA + total supply + revoke authority)
 *   Step 2: Initialize Meteora presale from treasury
 *
 * @param connection  Solana connection
 * @param builder     Builder's public key (from Privy wallet)
 * @param params      Form parameters
 * @param signAndSend Function to sign and send a transaction (from useSolanaSigner)
 * @param onProgress  Callback for step status updates
 * @returns The ExptConfig PDA address, presale PDA, and mint public key
 */
export async function executeCreateExperiment(
  connection: Connection,
  builder: PublicKey,
  params: CreateExperimentParams,
  signAndSend: (tx: Transaction, extraSigners?: Keypair[]) => Promise<string>,
  onProgress: StepCallback
): Promise<{ exptConfigPda: PublicKey; presalePda: PublicKey; mint: PublicKey }> {
  const quoteMint = NATIVE_MINT;

  const steps: CreationStep[] = [
    { label: "Create experiment & mint", status: "pending" },
    { label: "Initialize presale", status: "pending" },
  ];
  const update = () => onProgress([...steps]);
  update();

  // --- Keypairs (generated first, needed for PDA derivation) ---
  const mintKp = Keypair.generate();
  const baseKp = Keypair.generate();

  // --- Derive PDAs ---
  const [exptConfigPda] = deriveExptConfigPda(builder, mintKp.publicKey);
  const [treasuryPda] = deriveTreasuryPda(exptConfigPda);

  // --- Create SDK client ---
  const dummyWallet = {
    publicKey: builder,
    signTransaction: async (tx: Transaction) => tx,
    signAllTransactions: async (txs: Transaction[]) => txs,
  } as unknown as Wallet;
  const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
  const client = new ExptClient(provider);

  try {
    // =====================================================================
    // TX 1: Create ExptConfig (on-chain mint creation)
    // =====================================================================
    steps[0].status = "processing";
    update();

    const sdkMilestones: MilestoneInput[] = params.milestones.map((m) => ({
      description: m.description,
      deliverableType: DELIVERABLE_TYPE_MAP[m.deliverableType] ?? 0,
      unlockBps: m.unlockBps,
      deadline: Math.floor(new Date(m.deadline).getTime() / 1000),
    }));

    const input: CreateExptConfigInput = {
      name: params.name,
      uri: params.uri,
      presaleMinimumCap: new BN(Math.floor(params.minCapSol * LAMPORTS_PER_SOL)),
      vetoThresholdBps: params.vetoThresholdBps,
      challengeWindow: new BN(params.challengeWindowSeconds),
      milestones: sdkMilestones,
      totalSupply: TOTAL_SUPPLY,
      decimals: DECIMALS,
    };

    const createExptIx = await client.createExptConfig(builder, mintKp.publicKey, input);
    const tx1 = new Transaction().add(createExptIx);

    steps[0].status = "signing";
    update();

    const sig1 = await signAndSend(tx1, [mintKp]);
    steps[0].status = "done";
    steps[0].signature = sig1;
    update();

    // =====================================================================
    // TX 2: Initialize Meteora presale from treasury
    // =====================================================================
    steps[1].status = "processing";
    update();

    const slot = await connection.getSlot();
    const blockTime = await connection.getBlockTime(slot);
    if (!blockTime) throw new Error("Cannot get block time");
    const now = blockTime;
    const presaleStart = now + 10; // 10s from now to allow tx confirmation
    const presaleEnd = presaleStart + params.presaleDurationSeconds;

    const presaleSupply = TOTAL_SUPPLY.div(new BN(2)); // 50% of total supply

    const presaleInput: InitializePresaleFromTreasuryInput = {
      presaleMaximumCap: new BN(Math.floor(params.raiseTargetSol * LAMPORTS_PER_SOL)),
      presaleMinimumCap: new BN(Math.floor(params.minCapSol * LAMPORTS_PER_SOL)),
      presaleStartTime: new BN(presaleStart),
      presaleEndTime: new BN(presaleEnd),
      presaleSupply: presaleSupply,
      buyerMinDepositCap: new BN(LAMPORTS_PER_SOL).div(new BN(10)), // 0.1 SOL
      buyerMaxDepositCap: new BN(Math.floor(params.raiseTargetSol * LAMPORTS_PER_SOL)),
    };

    const initPresaleIx = await client.initializePresaleFromTreasury(
      builder,
      mintKp.publicKey,
      baseKp.publicKey,
      quoteMint,
      presaleInput
    );
    const tx2 = new Transaction().add(initPresaleIx);

    steps[1].status = "signing";
    update();

    const sig2 = await signAndSend(tx2, [baseKp]);
    steps[1].status = "done";
    steps[1].signature = sig2;
    update();

    // Derive presale PDA for return value
    const [presalePda] = derivePresalePda(baseKp.publicKey, mintKp.publicKey, quoteMint);

    return { exptConfigPda, presalePda, mint: mintKp.publicKey };
  } catch (err: any) {
    const activeIdx = steps.findIndex((s) => s.status === "processing" || s.status === "signing");
    if (activeIdx >= 0) {
      steps[activeIdx].status = "error";
      steps[activeIdx].error = err.message || "Transaction failed";
      update();
    }
    throw err;
  }
}
