"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Activity, Users, Target, BarChart3, Clock, Shield, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useExptClient } from "@/hooks/use-expt-client";
import {
  type ParsedExptConfig,
  type ParsedMilestone,
  ExptStatus,
  MilestoneStatus,
  exptStatusLabel,
} from "@expt/sdk";
import BN from "bn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lamportsToSol(lamports: BN | number): number {
  const val = typeof lamports === "number" ? lamports : lamports.toNumber();
  return val / 1_000_000_000;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function avgDays(totalSeconds: number, count: number): string {
  if (count === 0) return "—";
  const avgSec = totalSeconds / count;
  if (avgSec < 3600) return `${(avgSec / 60).toFixed(0)}m`;
  if (avgSec < 86400) return `${(avgSec / 3600).toFixed(1)}h`;
  return `${(avgSec / 86400).toFixed(1)}d`;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color = "#140E1C",
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}) {
  return (
    <Card className="bg-white/80 backdrop-blur-sm border-[rgba(0,0,0,0.06)] shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-[#6A6D78] uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color }}>
              {value}
            </p>
            {subtitle && <p className="text-xs text-[#6A6D78] mt-0.5">{subtitle}</p>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}10` }}>
            <Icon className="h-4.5 w-4.5" style={{ color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bar Chart (CSS-based)
// ---------------------------------------------------------------------------

function BarChart({
  data,
  title,
}: {
  data: { label: string; value: number; color: string }[];
  title: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-[rgba(0,0,0,0.06)] shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-[#140E1C]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {data.map((d) => (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#6A6D78]">{d.label}</span>
              <span className="font-medium text-[#140E1C]">{d.value}</span>
            </div>
            <div className="h-2 rounded-full bg-[#F0F0F0] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${(d.value / max) * 100}%`,
                  backgroundColor: d.color,
                  minWidth: d.value > 0 ? "4px" : "0px",
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Donut Ring (CSS)
// ---------------------------------------------------------------------------

function DonutRing({
  segments,
  title,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  title: string;
  centerLabel: string;
  centerValue: string | number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let cumulativePct = 0;

  // Build conic-gradient stops
  const stops = segments.flatMap((seg) => {
    const start = cumulativePct;
    const segPct = total > 0 ? (seg.value / total) * 100 : 0;
    cumulativePct += segPct;
    return [`${seg.color} ${start}% ${cumulativePct}%`];
  });
  if (total === 0) stops.push("#E5E5E5 0% 100%");

  const gradient = `conic-gradient(${stops.join(", ")})`;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-[rgba(0,0,0,0.06)] shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-[#140E1C]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 flex items-center gap-6">
        {/* Ring */}
        <div className="relative w-28 h-28 shrink-0">
          <div
            className="w-full h-full rounded-full"
            style={{ background: gradient }}
          />
          <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-[#140E1C]">{centerValue}</span>
            <span className="text-[10px] text-[#6A6D78]">{centerLabel}</span>
          </div>
        </div>
        {/* Legend */}
        <div className="space-y-1.5 flex-1">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[#6A6D78] flex-1">{seg.label}</span>
              <span className="font-medium text-[#140E1C]">{seg.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metrics computation
// ---------------------------------------------------------------------------

interface Analytics {
  totalExperiments: number;
  uniqueBuilders: number;
  totalTreasurySOL: number;
  totalClaimedSOL: number;

  // Status distribution
  statusCounts: Record<number, number>;

  // Milestones
  totalMilestones: number;
  passedMilestones: number;
  failedMilestones: number;
  pendingMilestones: number;
  submittedMilestones: number;
  challengedMilestones: number;
  milestoneShipRate: number; // % experiments with ≥1 passed milestone

  // Veto
  totalVetoStake: number; // SOL
  vetoSuccessRate: number; // % milestones that failed (vetoed successfully)

  // Timing
  avgTimeToFirstMilestone: string;

  // Top experiments by treasury
  topByTreasury: ParsedExptConfig[];
}

function computeAnalytics(experiments: ParsedExptConfig[]): Analytics {
  const uniqueBuilders = new Set(experiments.map((e) => e.builder.toBase58())).size;

  let totalTreasurySOL = 0;
  let totalClaimedSOL = 0;
  const statusCounts: Record<number, number> = {};

  let totalMilestones = 0;
  let passedMilestones = 0;
  let failedMilestones = 0;
  let pendingMilestones = 0;
  let submittedMilestones = 0;
  let challengedMilestones = 0;
  let totalVetoStakeSOL = 0;

  let experimentsWithPassedMilestone = 0;
  let firstMilestoneTimeSum = 0;
  let firstMilestoneCount = 0;

  for (const expt of experiments) {
    totalTreasurySOL += lamportsToSol(expt.totalTreasuryReceived);
    totalClaimedSOL += lamportsToSol(expt.totalClaimedByBuilder);

    statusCounts[expt.status] = (statusCounts[expt.status] || 0) + 1;

    let hasPassedMs = false;
    let earliestSubmitted: number | null = null;

    for (const ms of expt.milestones) {
      totalMilestones++;
      switch (ms.status) {
        case MilestoneStatus.Passed:
          passedMilestones++;
          hasPassedMs = true;
          break;
        case MilestoneStatus.Failed:
          failedMilestones++;
          break;
        case MilestoneStatus.Pending:
          pendingMilestones++;
          break;
        case MilestoneStatus.Submitted:
          submittedMilestones++;
          break;
        case MilestoneStatus.Challenged:
          challengedMilestones++;
          break;
      }

      totalVetoStakeSOL += lamportsToSol(ms.totalVetoStake);

      if (
        ms.submittedAt &&
        (earliestSubmitted === null || ms.submittedAt.getTime() < earliestSubmitted)
      ) {
        earliestSubmitted = ms.submittedAt.getTime();
      }
    }

    if (hasPassedMs) experimentsWithPassedMilestone++;

    // Time to first milestone (from experiment creation estimate — use first milestone deadline minus offset)
    // Since we don't store creation timestamp, skip for now
  }

  const resolvedMilestones = passedMilestones + failedMilestones;

  return {
    totalExperiments: experiments.length,
    uniqueBuilders,
    totalTreasurySOL,
    totalClaimedSOL,
    statusCounts,
    totalMilestones,
    passedMilestones,
    failedMilestones,
    pendingMilestones,
    submittedMilestones,
    challengedMilestones,
    milestoneShipRate:
      experiments.length > 0
        ? (experimentsWithPassedMilestone / experiments.length) * 100
        : 0,
    totalVetoStake: totalVetoStakeSOL,
    vetoSuccessRate:
      resolvedMilestones > 0
        ? (failedMilestones / resolvedMilestones) * 100
        : 0,
    avgTimeToFirstMilestone: avgDays(firstMilestoneTimeSum, firstMilestoneCount),
    topByTreasury: [...experiments]
      .sort((a, b) => b.totalTreasuryReceived.toNumber() - a.totalTreasuryReceived.toNumber())
      .slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const client = useExptClient();
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const all = await client.fetchAllExptConfigs();
        if (!cancelled) setExperiments(all);
      } catch (err) {
        console.error("Failed to fetch experiments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const analytics = useMemo(() => computeAnalytics(experiments), [experiments]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F3EE] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#6A6D78]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F3EE]">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-[rgba(0,0,0,0.06)] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-[#6A6D78] hover:text-[#140E1C] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#140E1C]">Protocol Analytics</h1>
            <p className="text-xs text-[#6A6D78]">
              Real-time on-chain metrics from {analytics.totalExperiments} experiments
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* ── Overview Stats ──────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-medium text-[#6A6D78] uppercase tracking-wider mb-4">
            Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Activity}
              label="Total Experiments"
              value={analytics.totalExperiments}
              color="#140E1C"
            />
            <StatCard
              icon={Users}
              label="Unique Builders"
              value={analytics.uniqueBuilders}
              color="#457B9D"
            />
            <StatCard
              icon={TrendingUp}
              label="Total Treasury"
              value={`${analytics.totalTreasurySOL.toFixed(2)} SOL`}
              subtitle={`${analytics.totalClaimedSOL.toFixed(2)} SOL claimed`}
              color="#2D6A4F"
            />
            <StatCard
              icon={Zap}
              label="Ship Rate"
              value={`${analytics.milestoneShipRate.toFixed(1)}%`}
              subtitle="experiments with ≥1 milestone shipped"
              color="#E09F3E"
            />
          </div>
        </section>

        {/* ── Charts Row ──────────────────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-6">
          {/* Experiment Status Distribution */}
          <DonutRing
            title="Experiment Status Distribution"
            centerLabel="total"
            centerValue={analytics.totalExperiments}
            segments={[
              { label: "Created", value: analytics.statusCounts[ExptStatus.Created] || 0, color: "#6A6D78" },
              { label: "Presale Active", value: analytics.statusCounts[ExptStatus.PresaleActive] || 0, color: "#E09F3E" },
              { label: "Active", value: analytics.statusCounts[ExptStatus.Active] || 0, color: "#457B9D" },
              { label: "Completed", value: analytics.statusCounts[ExptStatus.Completed] || 0, color: "#2D6A4F" },
              { label: "Failed", value: analytics.statusCounts[ExptStatus.PresaleFailed] || 0, color: "#9B2226" },
            ]}
          />

          {/* Milestone Resolution */}
          <DonutRing
            title="Milestone Resolution"
            centerLabel="total"
            centerValue={analytics.totalMilestones}
            segments={[
              { label: "Passed", value: analytics.passedMilestones, color: "#2D6A4F" },
              { label: "Failed / Vetoed", value: analytics.failedMilestones, color: "#9B2226" },
              { label: "Submitted", value: analytics.submittedMilestones, color: "#E09F3E" },
              { label: "Challenged", value: analytics.challengedMilestones, color: "#D32F2F" },
              { label: "Pending", value: analytics.pendingMilestones, color: "#DEDEE3" },
            ]}
          />
        </section>

        {/* ── Veto & Accountability ──────────────────────────────── */}
        <section>
          <h2 className="text-sm font-medium text-[#6A6D78] uppercase tracking-wider mb-4">
            Accountability
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Shield}
              label="Veto Stake"
              value={`${analytics.totalVetoStake.toFixed(2)} SOL`}
              subtitle="total staked in challenges"
              color="#9B2226"
            />
            <StatCard
              icon={Target}
              label="Veto Success Rate"
              value={`${analytics.vetoSuccessRate.toFixed(1)}%`}
              subtitle="of resolved milestones failed"
              color="#D32F2F"
            />
            <StatCard
              icon={BarChart3}
              label="Milestones Passed"
              value={analytics.passedMilestones}
              subtitle={`of ${analytics.totalMilestones} total`}
              color="#2D6A4F"
            />
            <StatCard
              icon={Clock}
              label="Avg. Time to Ship"
              value={analytics.avgTimeToFirstMilestone}
              subtitle="first milestone delivery"
              color="#457B9D"
            />
          </div>
        </section>

        {/* ── Top Experiments by Treasury ─────────────────────────── */}
        {analytics.topByTreasury.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[#6A6D78] uppercase tracking-wider mb-4">
              Top Experiments by Treasury
            </h2>
            <BarChart
              title=""
              data={analytics.topByTreasury.map((expt, i) => ({
                label: expt.name || `Experiment ${i + 1}`,
                value: parseFloat(lamportsToSol(expt.totalTreasuryReceived).toFixed(2)),
                color: ["#140E1C", "#457B9D", "#2D6A4F", "#E09F3E", "#9B2226"][i] || "#6A6D78",
              }))}
            />
          </section>
        )}

        {/* ── Recent Experiments Table ───────────────────────────── */}
        <section>
          <h2 className="text-sm font-medium text-[#6A6D78] uppercase tracking-wider mb-4">
            All Experiments
          </h2>
          <Card className="bg-white/80 backdrop-blur-sm border-[rgba(0,0,0,0.06)] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F0F0F0]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Treasury</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Claimed</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Milestones</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[#6A6D78] uppercase">Veto Stake</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((expt) => {
                    const passed = expt.milestones.filter((m) => m.status === MilestoneStatus.Passed).length;
                    const total = expt.milestones.length;
                    const vetoStake = expt.milestones.reduce(
                      (sum, m) => sum + lamportsToSol(m.totalVetoStake),
                      0
                    );

                    return (
                      <tr
                        key={expt.address.toBase58()}
                        className="border-b border-[#F8F8F8] hover:bg-[#FAFAF9] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/experiment/${expt.address.toBase58()}`}
                            className="font-medium text-[#140E1C] hover:underline"
                          >
                            {expt.name || expt.address.toBase58().slice(0, 8) + "..."}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 font-normal"
                          >
                            {exptStatusLabel(expt.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {lamportsToSol(expt.totalTreasuryReceived).toFixed(2)} SOL
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {lamportsToSol(expt.totalClaimedByBuilder).toFixed(2)} SOL
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs">
                            <span className="text-[#2D6A4F] font-medium">{passed}</span>
                            <span className="text-[#6A6D78]">/{total}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {vetoStake > 0 ? `${vetoStake.toFixed(2)} SOL` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
