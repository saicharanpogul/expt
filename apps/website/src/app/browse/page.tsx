"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useExptClient } from "@/hooks/use-expt-client";
import {
  type ParsedExptConfig,
  ExptStatus,
  exptStatusLabel,
} from "@expt/sdk";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const FILTERS = ["All", "Created", "Presale", "Active", "Completed", "Failed"];

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
  [ExptStatus.PresaleActive]: "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [ExptStatus.PresaleFailed]: "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [ExptStatus.Active]: "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [ExptStatus.Completed]: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
};

const FILTER_TO_STATUS: Record<string, number | undefined> = {
  All: undefined,
  Created: ExptStatus.Created,
  Presale: ExptStatus.PresaleActive,
  Active: ExptStatus.Active,
  Completed: ExptStatus.Completed,
  Failed: ExptStatus.PresaleFailed,
};

/* ── Experiment Card with metadata ──────────────────────────── */
function ExperimentCard({ expt }: { expt: ParsedExptConfig }) {
  const [meta, setMeta] = useState<{
    image?: string;
    symbol?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const uri = expt.uri;
        if (!uri) return;
        const res = await fetch(uri);
        const json = await res.json();
        if (!cancelled) setMeta(json);
      } catch {
        /* ignore — fallback UI */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [expt.uri]);

  const passedCount = expt.milestones.filter(
    (m) => m.status === 3 /* Passed */
  ).length;
  const treasurySOL = Number(expt.totalTreasuryReceived) / LAMPORTS_PER_SOL;

  return (
    <Link
      href={`/experiment/${expt.address.toBase58()}`}
      className="group bg-white hover:bg-[#FAFAF9] rounded-3xl p-6 transition-colors border border-[#DEDEE3]"
    >
      {/* Token image */}
      {meta?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.image}
          alt={expt.name}
          className="w-10 h-10 mb-4 rounded-xl object-cover border border-[#DEDEE3]"
        />
      ) : (
        <div className="w-10 h-10 mb-4 rounded-xl bg-gradient-to-br from-[#140E1C] to-[#E09F3E] flex items-center justify-center text-white font-bold text-sm">
          {expt.name.charAt(0)}
        </div>
      )}

      {/* Content */}
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-sm font-medium text-[#1C1917] group-hover:text-[#140E1C]">
          {expt.name}
        </h3>
        {meta?.symbol && (
          <span className="text-[10px] font-mono text-[#6A6D78] bg-[#F4F3EE] rounded px-1.5 py-0.5">
            ${meta.symbol}
          </span>
        )}
      </div>
      <p className="text-xs text-[#6A6D78] mb-3 font-mono">
        {expt.builder.toBase58().slice(0, 4)}...
        {expt.builder.toBase58().slice(-4)}
      </p>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="h-1.5 bg-[#DEDEE3] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#140E1C] rounded-full transition-all"
            style={{
              width: `${
                expt.milestoneCount > 0
                  ? (passedCount / expt.milestoneCount) * 100
                  : 0
              }%`,
            }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
            STATUS_COLORS[expt.status] || ""
          }`}
        >
          {exptStatusLabel(expt.status)}
        </Badge>
        <span className="text-[10px] text-[#6A6D78]">
          {passedCount}/{expt.milestoneCount} shipped
          {treasurySOL > 0 && ` · ${treasurySOL.toFixed(1)} SOL`}
        </span>
      </div>
    </Link>
  );
}

export default function BrowsePage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const client = useExptClient();

  useEffect(() => {
    let cancelled = false;

    async function fetchExperiments() {
      try {
        setLoading(true);
        const configs = await client.fetchAllExptConfigs();
        if (!cancelled) {
          setExperiments(configs);
        }
      } catch (err) {
        console.error("Failed to fetch experiments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchExperiments();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const filtered =
    FILTER_TO_STATUS[activeFilter] === undefined
      ? experiments
      : experiments.filter((e) => e.status === FILTER_TO_STATUS[activeFilter]);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1C1917]">
          Experiments{" "}
          <span className="text-[#6A6D78] text-lg font-normal">
            {loading ? "..." : filtered.length}
          </span>
        </h1>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-4 py-2 text-xs font-medium rounded-2xl transition-colors ${
              activeFilter === filter
                ? "bg-[#140E1C] text-[#F4F3EE]"
                : "bg-white text-[#6A6D78] hover:text-[#1C1917] hover:bg-[#DEDEE3] border border-[#DEDEE3]"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-3xl p-6 border border-[#DEDEE3] animate-pulse"
            >
              <div className="w-10 h-10 bg-[#DEDEE3] rounded-xl mb-4" />
              <div className="h-4 bg-[#DEDEE3] rounded w-3/4 mb-2" />
              <div className="h-3 bg-[#DEDEE3] rounded w-1/2 mb-4" />
              <div className="flex justify-between">
                <div className="h-4 bg-[#DEDEE3] rounded w-16" />
                <div className="h-3 bg-[#DEDEE3] rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Experiment Grid */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((expt) => (
            <ExperimentCard key={expt.address.toBase58()} expt={expt} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#DEDEE3] flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6A6D78"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <p className="text-sm text-[#6A6D78] mb-1">No experiments found</p>
          <p className="text-xs text-[#A1A1AA]">
            {activeFilter !== "All"
              ? `Try selecting a different filter`
              : `Be the first to create one`}
          </p>
          {activeFilter === "All" && (
            <Link
              href="/create"
              className="inline-flex items-center justify-center h-10 px-6 mt-6 text-sm font-medium rounded-full bg-[#140E1C] text-[#F4F3EE] hover:bg-[#2A2430] transition-colors"
            >
              Create an experiment
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
