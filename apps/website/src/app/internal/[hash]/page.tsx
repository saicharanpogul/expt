"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Lock, BarChart3, Users, Coins, Activity, ExternalLink } from "lucide-react";

// Mock data (will be replaced with SDK reads)
const ADMIN_EXPERIMENTS = [
  {
    address: "7xKXAbC123def456ghi789Jkl012mnO",
    name: "Solana Pay Plugin",
    builder: "7xKX...F3mp",
    status: "Active",
    treasuryBalance: 1.3,
    milestones: "1/3",
    vetoStakes: 0,
    created: "2026-02-10",
  },
  {
    address: "8yLYBcD234efg567hij890Klm123noP",
    name: "NFT Staking Kit",
    builder: "8yLY...G4nq",
    status: "Presale",
    treasuryBalance: 0,
    milestones: "0/2",
    vetoStakes: 0,
    created: "2026-02-11",
  },
  {
    address: "9zMZCdE345fgh678ijk901Lmn234opQ",
    name: "DAO Voting Tool",
    builder: "9zMZ...H5or",
    status: "Active",
    treasuryBalance: 2.7,
    milestones: "2/3",
    vetoStakes: 1,
    created: "2026-02-09",
  },
  {
    address: "1aNA DeF456ghi789jkl012Mno345pqR",
    name: "Token Launcher",
    builder: "1aNA...I6ps",
    status: "Completed",
    treasuryBalance: 0,
    milestones: "3/3",
    vetoStakes: 0,
    created: "2026-02-05",
  },
  {
    address: "2bOBEfG567hij890klm123Nop456qrS",
    name: "Yield Aggregator",
    builder: "2bOB...J7qt",
    status: "Failed",
    treasuryBalance: 0,
    milestones: "0/3",
    vetoStakes: 3,
    created: "2026-02-07",
  },
];

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-expt-success/10 text-expt-success border-expt-success/20",
  Presale: "bg-expt-warning/10 text-expt-warning border-expt-warning/20",
  Completed: "bg-expt-info/10 text-expt-info border-expt-info/20",
  Failed: "bg-expt-danger/10 text-expt-danger border-expt-danger/20",
};

export default function AdminDashboardPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<string>("");

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
          <Lock className="h-12 w-12 mx-auto mb-4 text-text-secondary" />
          <h2 className="text-lg font-medium mb-2">Admin Access</h2>
          <p className="text-sm text-text-secondary mb-6">
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
              className="rounded-lg mb-3"
            />
            {error && (
              <p className="text-xs text-expt-danger mb-3">{error}</p>
            )}
            <Button type="submit" className="w-full rounded-lg text-xs">
              Access Dashboard
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const stats = {
    total: ADMIN_EXPERIMENTS.length,
    active: ADMIN_EXPERIMENTS.filter((e) => e.status === "Active").length,
    totalRaised: ADMIN_EXPERIMENTS.reduce(
      (sum, e) => sum + e.treasuryBalance,
      0
    ).toFixed(1),
    totalVetoStakes: ADMIN_EXPERIMENTS.reduce(
      (sum, e) => sum + e.vetoStakes,
      0
    ),
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Internal tool — all on-chain state
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Admin
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface-muted rounded-2xl p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-medium">Total</span>
          </div>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="bg-surface-muted rounded-2xl p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <Activity className="h-4 w-4" />
            <span className="text-xs font-medium">Active</span>
          </div>
          <p className="text-2xl font-semibold">{stats.active}</p>
        </div>
        <div className="bg-surface-muted rounded-2xl p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <Coins className="h-4 w-4" />
            <span className="text-xs font-medium">Treasury</span>
          </div>
          <p className="text-2xl font-semibold">{stats.totalRaised} SOL</p>
        </div>
        <div className="bg-surface-muted rounded-2xl p-5">
          <div className="flex items-center gap-2 text-text-secondary mb-2">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium">Veto Stakes</span>
          </div>
          <p className="text-2xl font-semibold">{stats.totalVetoStakes}</p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-card rounded-3xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Builder
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Treasury
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Milestones
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3">
                  Created
                </th>
                <th className="text-left text-xs font-medium text-text-secondary px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {ADMIN_EXPERIMENTS.map((expt) => (
                <tr
                  key={expt.address}
                  className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium">{expt.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-text-secondary font-mono">
                      {expt.builder}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                        STATUS_COLORS[expt.status] || ""
                      }`}
                    >
                      {expt.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm">
                      {expt.treasuryBalance} SOL
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-text-secondary">
                      {expt.milestones}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-text-secondary">
                      {expt.created}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/internal/${hash}/experiment/${expt.address}`}
                      className="text-xs text-expt-info hover:underline inline-flex items-center gap-1"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
