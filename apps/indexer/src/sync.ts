/**
 * Initial sync / backfill script.
 *
 * Reads all on-chain accounts via @expt/sdk and populates Supabase.
 * Run this once to bootstrap the database, then rely on webhooks for updates.
 *
 * Usage: bun run src/sync.ts
 */

import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  ExptClient,
  type ParsedExptConfig,
} from "@expt/sdk";
import { supabase } from "./db";

const RPC_URL = process.env.SOLANA_RPC_URL || "http://localhost:8899";

async function main() {
  console.log(`[sync] Connecting to ${RPC_URL}...`);

  const connection = new Connection(RPC_URL, "confirmed");
  const dummyWallet = {
    publicKey: null,
    signTransaction: async () => {
      throw new Error("Read-only");
    },
    signAllTransactions: async () => {
      throw new Error("Read-only");
    },
  } as unknown as Wallet;

  const provider = new AnchorProvider(connection, dummyWallet, {
    commitment: "confirmed",
  });
  const client = new ExptClient(provider);

  // ── Sync Builders ──────────────────────────────────────────────
  console.log("[sync] Fetching all Builder accounts...");
  try {
    const builderAccounts = await (client as any).program.account.builder.all();
    console.log(`[sync] Found ${builderAccounts.length} builders`);

    for (const acc of builderAccounts) {
      const raw = acc.account as any;
      const address = acc.publicKey.toBase58();
      const wallet = raw.wallet.toBase58();
      const xUsername = decodeUtf8(raw.xUsername);
      const github = decodeUtf8(raw.github) || null;
      const telegram = decodeUtf8(raw.telegram) || null;
      const activeExperiment =
        raw.activeExperiment.toBase58() ===
          "11111111111111111111111111111111"
          ? null
          : raw.activeExperiment.toBase58();

      const { error } = await supabase.from("builders").upsert(
        {
          address,
          wallet,
          x_username: xUsername,
          github,
          telegram,
          active_experiment: activeExperiment,
          experiment_count: raw.experimentCount,
        },
        { onConflict: "wallet" }
      );

      if (error) console.error(`[sync] Builder upsert error:`, error.message);
      else console.log(`  ✓ Builder ${wallet.slice(0, 8)}... (${xUsername})`);
    }
  } catch (err: any) {
    console.warn("[sync] Could not fetch builders:", err.message);
  }

  // ── Sync Experiments ───────────────────────────────────────────
  console.log("[sync] Fetching all ExptConfig accounts...");
  const configs = await client.fetchAllExptConfigs();
  console.log(`[sync] Found ${configs.length} experiments`);

  for (const expt of configs) {
    const address = expt.address.toBase58();
    const builderWallet = expt.builder.toBase58();

    // Upsert experiment
    const { error: expErr } = await supabase.from("experiments").upsert(
      {
        address,
        builder_wallet: builderWallet,
        name: expt.name,
        uri: expt.uri,
        mint: expt.mint.toBase58(),
        status: expt.status,
        milestone_count: expt.milestoneCount,
        presale_minimum_cap: expt.presaleMinimumCap.toString(),
        veto_threshold_bps: expt.vetoThresholdBps,
        challenge_window: expt.challengeWindow.toString(),
        total_treasury_received: expt.totalTreasuryReceived.toString(),
        total_claimed_by_builder: expt.totalClaimedByBuilder.toString(),
        pool_launched: expt.poolLaunched,
        damm_pool: expt.dammPool?.toBase58() || null,
        total_supply: expt.totalSupply.toString(),
      },
      { onConflict: "address" }
    );

    if (expErr) {
      console.error(`[sync] Experiment upsert error:`, expErr.message);
      continue;
    }

    console.log(`  ✓ Experiment "${expt.name}" (${address.slice(0, 8)}...)`);

    // Upsert milestones
    for (const ms of expt.milestones) {
      const { error: msErr } = await supabase.from("milestones").upsert(
        {
          experiment_addr: address,
          index: ms.index,
          description: ms.description,
          unlock_percent: ms.unlockPercent,
          deliverable_type: ms.deliverableType,
          deadline: ms.deadline?.toISOString() || new Date(0).toISOString(),
          status: ms.status,
          deliverable: ms.deliverable || null,
          submitted_at: ms.submittedAt?.toISOString() || null,
          total_veto_stake: ms.totalVetoStake.toString(),
        },
        { onConflict: "experiment_addr,index" }
      );

      if (msErr) console.error(`[sync] Milestone upsert error:`, msErr.message);
    }
  }

  console.log("\n[sync] ✅ Backfill complete!");
  console.log(`  Builders: ${(await supabase.from("builders").select("*", { count: "exact", head: true })).count || 0}`);
  console.log(`  Experiments: ${(await supabase.from("experiments").select("*", { count: "exact", head: true })).count || 0}`);
  console.log(`  Milestones: ${(await supabase.from("milestones").select("*", { count: "exact", head: true })).count || 0}`);
}

function decodeUtf8(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const bytes = new Uint8Array(value);
    const nullIdx = bytes.indexOf(0);
    return new TextDecoder().decode(nullIdx >= 0 ? bytes.slice(0, nullIdx) : bytes);
  }
  if (value && typeof value === "object" && value.type === "Buffer") {
    const bytes = new Uint8Array(value.data);
    const nullIdx = bytes.indexOf(0);
    return new TextDecoder().decode(nullIdx >= 0 ? bytes.slice(0, nullIdx) : bytes);
  }
  return "";
}

main().catch((err) => {
  console.error("[sync] Fatal error:", err);
  process.exit(1);
});
