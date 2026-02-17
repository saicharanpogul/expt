import { Hono } from "hono";
import { supabase } from "./db";

/**
 * REST API routes for the indexer.
 * Consumed by the website and mobile app.
 */
export const apiApp = new Hono();

// ── GET /api/experiments ─────────────────────────────────────────
apiApp.get("/api/experiments", async (c) => {
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  let query = supabase
    .from("experiments")
    .select("*, milestones(*)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== undefined && status !== "") {
    query = query.eq("status", parseInt(status));
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[api] experiments error:", error.message);
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data, count, limit, offset });
});

// ── GET /api/experiments/:address ────────────────────────────────
apiApp.get("/api/experiments/:address", async (c) => {
  const address = c.req.param("address");

  const { data, error } = await supabase
    .from("experiments")
    .select("*, milestones(*), experiment_events(*)")
    .eq("address", address)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return c.json({ error: "Experiment not found" }, 404);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data });
});

// ── GET /api/builders/:wallet ────────────────────────────────────
apiApp.get("/api/builders/:wallet", async (c) => {
  const wallet = c.req.param("wallet");

  const { data: builder, error: bErr } = await supabase
    .from("builders")
    .select("*")
    .eq("wallet", wallet)
    .single();

  if (bErr) {
    if (bErr.code === "PGRST116") {
      return c.json({ error: "Builder not found" }, 404);
    }
    return c.json({ error: bErr.message }, 500);
  }

  // Fetch builder's experiments
  const { data: experiments } = await supabase
    .from("experiments")
    .select("*, milestones(*)")
    .eq("builder_wallet", wallet)
    .order("created_at", { ascending: false });

  return c.json({ data: { ...builder, experiments: experiments || [] } });
});

// ── GET /api/analytics ───────────────────────────────────────────
apiApp.get("/api/analytics", async (c) => {
  // Total experiments
  const { count: totalExperiments } = await supabase
    .from("experiments")
    .select("*", { count: "exact", head: true });

  // Unique builders
  const { count: uniqueBuilders } = await supabase
    .from("builders")
    .select("*", { count: "exact", head: true });

  // Status distribution
  const { data: experiments } = await supabase
    .from("experiments")
    .select("status, total_treasury_received, total_claimed_by_builder");

  const statusCounts: Record<number, number> = {};
  let totalTreasury = BigInt(0);
  let totalClaimed = BigInt(0);

  for (const exp of experiments || []) {
    statusCounts[exp.status] = (statusCounts[exp.status] || 0) + 1;
    totalTreasury += BigInt(exp.total_treasury_received || 0);
    totalClaimed += BigInt(exp.total_claimed_by_builder || 0);
  }

  // Milestone stats
  const { data: milestones } = await supabase
    .from("milestones")
    .select("status, total_veto_stake");

  let passed = 0,
    failed = 0,
    pending = 0,
    submitted = 0,
    challenged = 0;
  let totalVetoStake = BigInt(0);

  for (const ms of milestones || []) {
    switch (ms.status) {
      case 0: pending++; break;
      case 1: submitted++; break;
      case 3: challenged++; break;
      case 4: passed++; break;
      case 5: failed++; break;
    }
    totalVetoStake += BigInt(ms.total_veto_stake || 0);
  }

  return c.json({
    data: {
      totalExperiments: totalExperiments || 0,
      uniqueBuilders: uniqueBuilders || 0,
      totalTreasuryLamports: totalTreasury.toString(),
      totalClaimedLamports: totalClaimed.toString(),
      statusCounts,
      milestones: {
        total: (milestones || []).length,
        passed,
        failed,
        pending,
        submitted,
        challenged,
      },
      totalVetoStakeLamports: totalVetoStake.toString(),
    },
  });
});

// ── GET /api/events/:experimentAddr ──────────────────────────────
apiApp.get("/api/events/:experimentAddr", async (c) => {
  const addr = c.req.param("experimentAddr");
  const limit = parseInt(c.req.query("limit") || "100");

  const { data, error } = await supabase
    .from("experiment_events")
    .select("*")
    .eq("experiment_addr", addr)
    .order("block_time", { ascending: false })
    .limit(limit);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ data });
});
