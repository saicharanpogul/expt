"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const FILTERS = ["All", "Presale", "Active", "Completed", "Failed"];

// Mock data (will be replaced with SDK data)
const EXPERIMENTS = [
  { address: "abc123", name: "Solana Pay Plugin", status: "Active", builder: "@builder_one", milestonesShipped: 1, milestoneCount: 3, raised: "5.2 SOL" },
  { address: "def456", name: "NFT Staking Kit", status: "Presale", builder: "@nft_dev", milestonesShipped: 0, milestoneCount: 2, raised: "0 SOL" },
  { address: "ghi789", name: "DAO Voting Tool", status: "Active", builder: "@dao_builder", milestonesShipped: 2, milestoneCount: 3, raised: "8.1 SOL" },
  { address: "jkl012", name: "DeFi Dashboard", status: "Presale", builder: "@defi_anon", milestonesShipped: 0, milestoneCount: 3, raised: "1.5 SOL" },
  { address: "mno345", name: "Token Launcher", status: "Completed", builder: "@token_dev", milestonesShipped: 3, milestoneCount: 3, raised: "10 SOL" },
  { address: "pqr678", name: "Wallet Tracker", status: "Completed", builder: "@tracker_dev", milestonesShipped: 2, milestoneCount: 2, raised: "4.7 SOL" },
  { address: "stu901", name: "Yield Aggregator", status: "Failed", builder: "@yield_dev", milestonesShipped: 0, milestoneCount: 3, raised: "2.3 SOL" },
  { address: "vwx234", name: "Bridge Monitor", status: "Active", builder: "@bridge_dev", milestonesShipped: 1, milestoneCount: 2, raised: "6.0 SOL" },
];

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-expt-success/10 text-expt-success border-expt-success/20",
  Presale: "bg-expt-warning/10 text-expt-warning border-expt-warning/20",
  Completed: "bg-expt-info/10 text-expt-info border-expt-info/20",
  Failed: "bg-expt-danger/10 text-expt-danger border-expt-danger/20",
};

export default function BrowsePage() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filtered =
    activeFilter === "All"
      ? EXPERIMENTS
      : EXPERIMENTS.filter((e) => e.status === activeFilter);

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Experiments{" "}
          <span className="text-text-secondary text-lg font-normal">
            {filtered.length}
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
                ? "bg-primary text-primary-foreground"
                : "bg-surface-glass text-text-secondary hover:text-foreground hover:bg-secondary border border-border"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Experiment Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((expt) => (
          <Link
            key={expt.address}
            href={`/experiment/${expt.address}`}
            className="group bg-card hover:bg-secondary rounded-3xl p-6 transition-colors border border-border"
          >
            {/* Icon */}
            <div className="w-10 h-10 mb-4 flex items-center justify-center text-text-secondary group-hover:text-foreground transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <path d="M8 12h8M12 8v8" />
              </svg>
            </div>

            {/* Content */}
            <h3 className="text-sm font-medium mb-1 group-hover:text-foreground">
              {expt.name}
            </h3>
            <p className="text-xs text-text-secondary mb-3">{expt.builder}</p>

            {/* Meta */}
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 font-normal ${STATUS_COLORS[expt.status] || ""}`}
              >
                {expt.status}
              </Badge>
              <span className="text-[10px] text-text-secondary">
                {expt.milestonesShipped}/{expt.milestoneCount} shipped
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-text-secondary">No experiments found.</p>
        </div>
      )}
    </div>
  );
}
