"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, use } from "react";
import { useExptClient } from "@/hooks/use-expt-client";
import {
  type ParsedExptConfig,
  ExptStatus,
  exptStatusLabel,
} from "@expt/sdk";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ArrowLeft, ExternalLink } from "lucide-react";

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
  [ExptStatus.PresaleActive]:
    "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [ExptStatus.PresaleFailed]:
    "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [ExptStatus.Active]: "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [ExptStatus.Completed]:
    "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
};

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function PublicProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const client = useExptClient();
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchBuilderExperiments() {
      try {
        // Validate address
        new PublicKey(address);
      } catch {
        setValid(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const allConfigs = await client.fetchAllExptConfigs();
        const builderExpts = allConfigs.filter(
          (c) => c.builder.toBase58() === address
        );
        if (!cancelled) setExperiments(builderExpts);
      } catch (err) {
        console.error("Failed to fetch experiments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBuilderExperiments();
    return () => {
      cancelled = true;
    };
  }, [address, client]);

  if (!valid) {
    return (
      <div className="max-w-[800px] mx-auto px-6 py-16 text-center">
        <p className="text-sm text-[#6A6D78]">Invalid wallet address.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      {/* Back */}
      <Link
        href="/browse"
        className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Browse
      </Link>

      {/* Header */}
      <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3] mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#140E1C] flex items-center justify-center text-[#F4F3EE] text-lg font-semibold shrink-0">
            {address.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[#1C1917]">
                  Builder
                </h1>
                <p className="text-sm text-[#6A6D78] mt-0.5 font-mono">
                  {truncateAddress(address)}
                </p>
              </div>
              <a
                href={`https://solscan.io/account/${address}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors flex items-center gap-1"
              >
                Solscan <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Experiments */}
      <div className="mb-6">
        <h2 className="text-lg font-medium text-[#1C1917] mb-4">
          Experiments{" "}
          <span className="text-sm font-normal text-[#6A6D78]">
            {loading ? "..." : experiments.length}
          </span>
        </h2>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-5 border border-[#DEDEE3] animate-pulse"
              >
                <div className="h-4 bg-[#DEDEE3] rounded w-48 mb-2" />
                <div className="h-3 bg-[#DEDEE3] rounded w-32" />
              </div>
            ))}
          </div>
        ) : experiments.length > 0 ? (
          <div className="space-y-3">
            {experiments.map((expt) => {
              const passedCount = expt.milestones.filter(
                (m) => m.status === 3
              ).length;
              return (
                <Link
                  key={expt.address.toBase58()}
                  href={`/experiment/${expt.address.toBase58()}`}
                  className="block bg-white rounded-2xl p-5 border border-[#DEDEE3] hover:bg-[#FAFAF9] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-[#1C1917]">
                        {expt.name}
                      </h3>
                      <p className="text-xs text-[#6A6D78] mt-0.5">
                        {passedCount}/{expt.milestoneCount} milestones shipped
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                          STATUS_COLORS[expt.status] || ""
                        }`}
                      >
                        {exptStatusLabel(expt.status)}
                      </Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-[#6A6D78]" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-[#F4F3EE] rounded-2xl">
            <p className="text-sm text-[#6A6D78]">No experiments yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
