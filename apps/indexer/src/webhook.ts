import { Hono } from "hono";
import { supabase } from "./db";

/**
 * Helius Enhanced Transaction webhook handler.
 *
 * Helius sends an array of enriched transactions. Each transaction has:
 * - `events`: parsed program events (Anchor CPI logs)
 * - `accountData`: account state changes
 * - `signature`, `slot`, `timestamp`
 *
 * We parse the Anchor event logs to extract our program events.
 */

const HELIUS_AUTH_TOKEN = process.env.HELIUS_AUTH_TOKEN || "";

// Anchor event discriminators (first 8 bytes of sha256("event:<EventName>"))
// We match by event name in the log message instead for simplicity.
const EVENT_NAMES = [
  "EvtBuilderCreated",
  "EvtExptConfigCreated",
  "EvtPresaleFinalized",
  "EvtPresaleFundsWithdrawn",
  "EvtMilestoneSubmitted",
  "EvtVetoInitiated",
  "EvtMilestoneResolved",
  "EvtBuilderFundsClaimed",
  "EvtPoolLaunched",
  "EvtTradingFeesClaimed",
] as const;

type EventName = (typeof EVENT_NAMES)[number];

interface HeliusTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  events: Record<string, any>;
  accountData: any[];
  instructions: any[];
  nativeTransfers: any[];
  tokenTransfers: any[];
  description: string;
  type: string;
}

export const webhookApp = new Hono();

// ── Auth middleware ──────────────────────────────────────────────
webhookApp.use("/webhook", async (c, next) => {
  if (HELIUS_AUTH_TOKEN) {
    const authHeader = c.req.header("Authorization");
    if (authHeader !== `Bearer ${HELIUS_AUTH_TOKEN}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
  await next();
});

// ── Webhook endpoint ────────────────────────────────────────────
webhookApp.post("/webhook", async (c) => {
  try {
    const transactions: HeliusTransaction[] = await c.req.json();
    console.log(`[webhook] Received ${transactions.length} transactions`);

    let processed = 0;

    for (const tx of transactions) {
      // Parse Anchor event logs from the transaction
      const events = parseAnchorEvents(tx);

      for (const event of events) {
        await handleEvent(event, tx.signature, tx.slot, tx.timestamp);
        processed++;
      }
    }

    console.log(`[webhook] Processed ${processed} events`);
    return c.json({ ok: true, processed });
  } catch (err: any) {
    console.error("[webhook] Error:", err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ── Parse Anchor events from transaction logs ───────────────────
interface ParsedEvent {
  name: EventName;
  data: Record<string, any>;
}

function parseAnchorEvents(tx: HeliusTransaction): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  // Helius Enhanced Transactions include parsed events in `events` field
  // For Anchor programs, events are logged as base64-encoded data
  // We also check the description and instruction data

  // If Helius provides parsed events directly
  if (tx.events && typeof tx.events === "object") {
    for (const [name, data] of Object.entries(tx.events)) {
      if (EVENT_NAMES.includes(name as EventName)) {
        events.push({ name: name as EventName, data: data as Record<string, any> });
      }
    }
  }

  return events;
}

// ── Event handlers ──────────────────────────────────────────────
async function handleEvent(
  event: ParsedEvent,
  txSignature: string,
  slot: number,
  timestamp: number
) {
  const blockTime = new Date(timestamp * 1000);
  const { name, data } = event;

  console.log(`[event] ${name} in tx ${txSignature.slice(0, 12)}...`);

  switch (name) {
    case "EvtBuilderCreated":
      await supabase.from("builders").upsert(
        {
          address: data.builder,
          wallet: data.wallet,
          x_username: data.x_username || data.xUsername,
          created_at: blockTime.toISOString(),
          updated_at: blockTime.toISOString(),
        },
        { onConflict: "wallet" }
      );
      break;

    case "EvtExptConfigCreated":
      // Insert experiment
      await supabase.from("experiments").upsert(
        {
          address: data.expt_config || data.exptConfig,
          builder_wallet: data.builder,
          name: decodeUtf8(data.name),
          uri: "",
          mint: data.mint,
          status: 0,
          milestone_count: data.milestone_count || data.milestoneCount,
          presale_minimum_cap: String(data.presale_minimum_cap || data.presaleMinimumCap || 0),
          veto_threshold_bps: data.veto_threshold_bps || data.vetoThresholdBps || 0,
          challenge_window: String(data.challenge_window || data.challengeWindow || 0),
          created_at: blockTime.toISOString(),
          updated_at: blockTime.toISOString(),
        },
        { onConflict: "address" }
      );

      // Update builder's active experiment
      await supabase
        .from("builders")
        .update({
          active_experiment: data.expt_config || data.exptConfig,
          updated_at: blockTime.toISOString(),
        })
        .eq("wallet", data.builder);
      break;

    case "EvtPresaleFinalized":
      await supabase
        .from("experiments")
        .update({
          status: data.new_status || data.newStatus,
          updated_at: blockTime.toISOString(),
        })
        .eq("address", data.expt_config || data.exptConfig);
      break;

    case "EvtPresaleFundsWithdrawn":
      await supabase
        .from("experiments")
        .update({
          total_treasury_received: String(data.treasury_amount || data.treasuryAmount || 0),
          updated_at: blockTime.toISOString(),
        })
        .eq("address", data.expt_config || data.exptConfig);
      break;

    case "EvtMilestoneSubmitted":
      await supabase
        .from("milestones")
        .update({
          status: 1, // Submitted
          submitted_at: new Date((data.submitted_at || data.submittedAt) * 1000).toISOString(),
        })
        .eq("experiment_addr", data.expt_config || data.exptConfig)
        .eq("index", data.milestone_index || data.milestoneIndex);
      break;

    case "EvtVetoInitiated":
      await supabase
        .from("milestones")
        .update({
          status: 3, // Challenged
          total_veto_stake: String(data.total_veto_stake || data.totalVetoStake || 0),
        })
        .eq("experiment_addr", data.expt_config || data.exptConfig)
        .eq("index", data.milestone_index || data.milestoneIndex);
      break;

    case "EvtMilestoneResolved":
      const passed = data.passed;
      await supabase
        .from("milestones")
        .update({
          status: passed ? 4 : 5, // Passed or Failed
        })
        .eq("experiment_addr", data.expt_config || data.exptConfig)
        .eq("index", data.milestone_index || data.milestoneIndex);
      break;

    case "EvtBuilderFundsClaimed":
      await supabase
        .from("experiments")
        .update({
          total_claimed_by_builder: String(data.total_claimed || data.totalClaimed || 0),
          updated_at: blockTime.toISOString(),
        })
        .eq("address", data.expt_config || data.exptConfig);
      break;

    case "EvtPoolLaunched":
      await supabase
        .from("experiments")
        .update({
          pool_launched: true,
          damm_pool: data.damm_pool || data.dammPool,
          updated_at: blockTime.toISOString(),
        })
        .eq("address", data.expt_config || data.exptConfig);
      break;

    case "EvtTradingFeesClaimed":
      // Just record the event — no state change needed
      break;
  }

  // Always record the event in the timeline
  const experimentAddr =
    data.expt_config || data.exptConfig || data.builder || "unknown";

  await supabase.from("experiment_events").insert({
    experiment_addr: experimentAddr,
    event_type: name,
    tx_signature: txSignature,
    slot: slot,
    block_time: blockTime.toISOString(),
    data: data,
  });
}

// ── Helpers ─────────────────────────────────────────────────────
function decodeUtf8(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    // Anchor stores [u8; N] as number array — decode as UTF-8
    const bytes = new Uint8Array(value);
    const nullIdx = bytes.indexOf(0);
    return new TextDecoder().decode(nullIdx >= 0 ? bytes.slice(0, nullIdx) : bytes);
  }
  return String(value || "");
}
