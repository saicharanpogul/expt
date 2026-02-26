/**
 * Data provider abstraction layer.
 *
 * Provides a unified interface for fetching experiment data.
 * Toggle between direct RPC reads (@expt/sdk) and the Indexer REST API
 * via the environment variable:
 *
 *   NEXT_PUBLIC_USE_INDEXER=true   → fetch from indexer API
 *   NEXT_PUBLIC_USE_INDEXER=false  → fetch directly from RPC (default)
 *
 * The indexer URL is configured via:
 *   NEXT_PUBLIC_INDEXER_URL=https://your-indexer.example.com
 */

import type { ParsedExptConfig, ParsedMilestone } from "@expt/sdk";
import { ExptClient, exptStatusLabel, milestoneStatusLabel, deliverableTypeLabel } from "@expt/sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// ── Config ──────────────────────────────────────────────────────
const USE_INDEXER = process.env.NEXT_PUBLIC_USE_INDEXER === "true";
const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:4000";

// ── Public API ──────────────────────────────────────────────────

/**
 * Fetch all experiments.
 * On RPC: calls client.fetchAllExptConfigs()
 * On Indexer: calls GET /api/experiments
 */
export async function fetchAllExperiments(
  client: ExptClient
): Promise<ParsedExptConfig[]> {
  if (!USE_INDEXER) {
    return client.fetchAllExptConfigs();
  }

  const res = await fetch(`${INDEXER_URL}/api/experiments?limit=200`);
  if (!res.ok) throw new Error(`Indexer error: ${res.status}`);
  const { data } = await res.json();
  return (data || []).map(mapIndexerExperiment);
}

/**
 * Fetch a single experiment by address.
 * On RPC: calls client.fetchExptConfigByAddress()
 * On Indexer: calls GET /api/experiments/:address
 */
export async function fetchExperimentByAddress(
  client: ExptClient,
  address: PublicKey
): Promise<ParsedExptConfig | null> {
  if (!USE_INDEXER) {
    try {
      return await client.fetchExptConfigByAddress(address);
    } catch {
      return null;
    }
  }

  const res = await fetch(
    `${INDEXER_URL}/api/experiments/${address.toBase58()}`
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Indexer error: ${res.status}`);
  }
  const { data } = await res.json();
  return data ? mapIndexerExperiment(data) : null;
}

/**
 * Fetch experiments by builder wallet.
 * On RPC: fetches all and filters client-side.
 * On Indexer: calls GET /api/builders/:wallet
 */
export async function fetchExperimentsByBuilder(
  client: ExptClient,
  builderWallet: string
): Promise<ParsedExptConfig[]> {
  if (!USE_INDEXER) {
    const all = await client.fetchAllExptConfigs();
    return all.filter((e) => e.builder.toBase58() === builderWallet);
  }

  const res = await fetch(`${INDEXER_URL}/api/builders/${builderWallet}`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Indexer error: ${res.status}`);
  }
  const { data } = await res.json();
  return (data?.experiments || []).map(mapIndexerExperiment);
}

// ── Mapper: Indexer JSON → ParsedExptConfig ─────────────────────

function mapIndexerExperiment(raw: any): ParsedExptConfig {
  const status = raw.status as number;
  const vetoThresholdBps = raw.veto_threshold_bps ?? 0;
  return {
    address: new PublicKey(raw.address),
    builder: new PublicKey(raw.builder_wallet),
    name: raw.name,
    uri: raw.uri || "",
    mint: new PublicKey(raw.mint),
    status,
    statusLabel: exptStatusLabel(status),
    milestoneCount: raw.milestone_count,
    presaleMinimumCap: new BN(raw.presale_minimum_cap || "0"),
    vetoThresholdBps,
    vetoThresholdPercent: vetoThresholdBps / 100,
    challengeWindow: new BN(raw.challenge_window || "0"),
    totalTreasuryReceived: new BN(raw.total_treasury_received || "0"),
    totalClaimedByBuilder: new BN(raw.total_claimed_by_builder || "0"),
    poolLaunched: raw.pool_launched || false,
    presaleFundsWithdrawn: raw.presale_funds_withdrawn || false,
    treasuryBump: raw.treasury_bump ?? 0,
    dammPool: raw.damm_pool ? new PublicKey(raw.damm_pool) : PublicKey.default,
    positionNftMint: raw.position_nft_mint ? new PublicKey(raw.position_nft_mint) : PublicKey.default,
    lpPosition: raw.lp_position ? new PublicKey(raw.lp_position) : PublicKey.default,
    totalSupply: new BN(raw.total_supply || "0"),
    milestones: (raw.milestones || [])
      .sort((a: any, b: any) => a.index - b.index)
      .map(mapIndexerMilestone),
    presale: raw.presale ? new PublicKey(raw.presale) : PublicKey.default,
    builderPda: raw.builder_pda
      ? new PublicKey(raw.builder_pda)
      : PublicKey.default,
  };
}

function mapIndexerMilestone(raw: any): ParsedMilestone {
  const status = raw.status as number;
  const deliverableType = raw.deliverable_type ?? 0;
  return {
    index: raw.index,
    description: raw.description,
    unlockPercent: raw.unlock_percent,
    unlockBps: raw.unlock_percent * 100,
    deliverableType,
    deliverableTypeLabel: deliverableTypeLabel(deliverableType),
    deadline: raw.deadline ? new Date(raw.deadline) : new Date(0),
    status,
    statusLabel: milestoneStatusLabel(status),
    deliverable: raw.deliverable || "",
    submittedAt: raw.submitted_at ? new Date(raw.submitted_at) : null,
    totalVetoStake: new BN(raw.total_veto_stake || "0"),
    challengeWindowEnd: raw.challenge_window_end ? new Date(raw.challenge_window_end) : null,
  };
}
