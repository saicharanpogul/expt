"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Lock, BarChart3, Users, Coins, Activity, ExternalLink } from "lucide-react";
import { useExptClient } from "@/hooks/use-expt-client";
import {
  type ParsedExptConfig,
  ExptStatus,
  exptStatusLabel,
} from "@expt/sdk";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

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

export default function AdminDashboardPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<string>("");
  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const client = useExptClient();

  useEffect(() => {
    params.then((p) => setHash(p.hash));
  }, [params]);

  // Check sessionStorage for existing auth
  useEffect(() => {
    const stored = sessionStorage.getItem("expt-admin-auth");
    if (stored === "true") {
      setAuthenticated(true);
    }
  }, []);

  // Fetch experiments once authenticated
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;

    async function fetchAll() {
      try {
        setLoading(true);
        const configs = await client.fetchAllExptConfigs();
        if (!cancelled) setExperiments(configs);
      } catch (err) {
        console.error("Failed to fetch experiments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [authenticated, client]);

  const handleAuth = () => {
    const adminPasscode = process.env.NEXT_PUBLIC_ADMIN_PASSCODE || "expt-admin-2026";
    if (passcode === adminPasscode) {
      setAuthenticated(true);
      sessionStorage.setItem("expt-admin-auth", "true");
      setError("");
    } else {
      setError("Invalid passcode.");
    }
  };

  if (!authenticated) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-sm mx-auto">
          <Lock className="h-12 w-12 mx-auto mb-4 text-[#6A6D78]" />
          <h2 className="text-lg font-medium mb-2 text-[#1C1917]">Admin Access</h2>
          <p className="text-sm text-[#6A6D78] mb-6">
            Enter the admin passcode to access the dashboard.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAuth();
            }}
          >
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Passcode"
              className="rounded-lg mb-3 border-[#DEDEE3]"
            />
            {error && (
              <p className="text-xs text-[#D32F2F] mb-3">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full rounded-lg text-xs bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE]"
            >
              Access Dashboard
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const activeCount = experiments.filter(
    (e) => e.status === ExptStatus.Active
  ).length;
  const totalSOL = experiments.reduce(
    (sum, e) => sum + Number(e.totalTreasuryReceived) / LAMPORTS_PER_SOL,
    0
  );
  const presaleCount = experiments.filter(
    (e) =>
      e.status === ExptStatus.Created ||
      e.status === ExptStatus.PresaleActive
  ).length;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
            Admin Dashboard
          </h1>
          <p className="text-sm text-[#6A6D78] mt-1">
            Live on-chain state
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-xs border-[#DEDEE3] text-[#6A6D78]"
        >
          Admin
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
          <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-medium">Total</span>
          </div>
          <p className="text-2xl font-semibold text-[#1C1917]">
            {loading ? "..." : experiments.length}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
          <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">Active</span>
          </div>
          <p className="text-2xl font-semibold text-[#1C1917]">
            {loading ? "..." : activeCount}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
          <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
            <Coins className="h-4 w-4" />
            <span className="text-xs font-medium">Total SOL</span>
          </div>
          <p className="text-2xl font-semibold text-[#1C1917]">
            {loading ? "..." : totalSOL.toFixed(2)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
          <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium">In Presale</span>
          </div>
          <p className="text-2xl font-semibold text-[#1C1917]">
            {loading ? "..." : presaleCount}
          </p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-3xl border border-[#DEDEE3] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#6A6D78]">Loading experiments...</div>
        ) : experiments.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6A6D78]">No experiments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#DEDEE3]">
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3">
                    Builder
                  </th>
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3">
                    Treasury
                  </th>
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3">
                    Milestones
                  </th>
                  <th className="text-left text-xs font-medium text-[#6A6D78] px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {experiments.map((expt) => {
                  const passedCount = expt.milestones.filter(
                    (m) => m.status === 3
                  ).length;
                  const treasurySOL =
                    Number(expt.totalTreasuryReceived) / LAMPORTS_PER_SOL;

                  return (
                    <tr
                      key={expt.address.toBase58()}
                      className="border-b border-[#DEDEE3] last:border-0 hover:bg-[#FAFAF9] transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-[#1C1917]">
                          {expt.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/profile/${expt.builder.toBase58()}`}
                          className="text-xs text-[#6A6D78] font-mono hover:text-[#1C1917] transition-colors"
                        >
                          {truncateAddress(expt.builder.toBase58())}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                            STATUS_COLORS[expt.status] || ""
                          }`}
                        >
                          {exptStatusLabel(expt.status)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[#1C1917]">
                          {treasurySOL.toFixed(2)} SOL
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-[#6A6D78]">
                          {passedCount}/{expt.milestoneCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/internal/${hash}/experiment/${expt.address.toBase58()}`}
                          className="text-xs text-[#140E1C] hover:underline inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
