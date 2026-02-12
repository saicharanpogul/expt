"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { use } from "react";

// Mock data for admin experiment detail
const RAW_EXPERIMENT = {
  address: "7xKXAbC123def456ghi789Jkl012mnO",
  name: "Solana Pay Plugin",
  builder: "7xKXAbC123def456ghi789Jkl012mnO345pqR678stu901vwx",
  uri: "https://arweave.net/abc123",
  status: "Active",
  treasuryPda: "TREASAbC123def456ghi789Jkl012mnO345pqR678",
  treasuryBalance: 1.3,
  presaleTokenMint: "MINTAbC123def456ghi789Jkl012mnO345pqR678",
  poolAddress: "POOLAbC123def456ghi789Jkl012mnO345pqR678",
  maxRaiseAmount: 10_000_000_000,
  minCapAmount: 2_000_000_000,
  presaleDuration: 604800,
  vetoThresholdBps: 500,
  challengeWindowSeconds: 259200,
  milestones: [
    {
      index: 0,
      description: "Deploy payment SDK with merchant dashboard",
      deliverableType: 1,
      unlockBps: 3334,
      deadline: 1740864000,
      status: 2,
      deliverableHash: "QmAbC123def456ghi789Jkl012mnO345pqR678",
      submittedAt: 1739232000,
      resolvedAt: 1739577600,
    },
    {
      index: 1,
      description: "Integrate with 3 major e-commerce platforms",
      deliverableType: 0,
      unlockBps: 3333,
      deadline: 1743542400,
      status: 1,
      deliverableHash: "QmXyZ789abc012def345ghi678Jkl901mnO234",
      submittedAt: 1739404800,
      resolvedAt: null,
    },
    {
      index: 2,
      description: "Launch mainnet with real merchant onboarding",
      deliverableType: 2,
      unlockBps: 3333,
      deadline: 1746134400,
      status: 0,
      deliverableHash: null,
      submittedAt: null,
      resolvedAt: null,
    },
  ],
  vetoStakes: [] as { staker: string; amount: number; milestone: number }[],
  createdAt: 1739145600,
};

const STATUS_MAP: Record<number, string> = {
  0: "Pending",
  1: "Submitted",
  2: "Passed",
  3: "Failed",
  4: "Challenged",
};

const DELIVERABLE_MAP: Record<number, string> = {
  0: "URL",
  1: "GitHub",
  2: "Program ID",
  3: "Deployment",
};

export default function AdminExperimentDetailPage({
  params,
}: {
  params: Promise<{ hash: string; address: string }>;
}) {
  const { hash } = use(params);
  const expt = RAW_EXPERIMENT;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <Link
        href={`/internal/${hash}`}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {expt.name}
            </h1>
            <Badge variant="outline" className="text-xs">
              Admin View
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-secondary font-mono">
              {expt.address}
            </span>
            <button
              onClick={() => copyToClipboard(expt.address)}
              className="text-text-secondary hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Raw Account Data */}
      <div className="space-y-6">
        {/* Key Addresses */}
        <div className="bg-card rounded-3xl p-6 border border-border">
          <h3 className="text-sm font-medium mb-4">Key Addresses</h3>
          <div className="space-y-3 text-sm">
            {[
              { label: "Builder", value: expt.builder },
              { label: "Treasury PDA", value: expt.treasuryPda },
              { label: "Presale Token Mint", value: expt.presaleTokenMint },
              { label: "Pool Address", value: expt.poolAddress },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-text-secondary shrink-0">
                  {item.label}
                </span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[300px]">
                    {item.value}
                  </span>
                  <button
                    onClick={() => copyToClipboard(item.value)}
                    className="text-text-secondary hover:text-foreground shrink-0"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Numeric Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              label: "Treasury Balance",
              value: `${expt.treasuryBalance} SOL`,
            },
            {
              label: "Max Raise",
              value: `${expt.maxRaiseAmount / 1e9} SOL`,
            },
            {
              label: "Min Cap",
              value: `${expt.minCapAmount / 1e9} SOL`,
            },
            {
              label: "Presale Duration",
              value: `${expt.presaleDuration / 86400} days`,
            },
            {
              label: "Veto Threshold",
              value: `${expt.vetoThresholdBps / 100}%`,
            },
            {
              label: "Challenge Window",
              value: `${expt.challengeWindowSeconds / 3600}h`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-card rounded-2xl p-4 border border-border"
            >
              <p className="text-xs text-text-secondary mb-1">{item.label}</p>
              <p className="text-sm font-medium">{item.value}</p>
            </div>
          ))}
        </div>

        <Separator />

        {/* Milestones */}
        <div>
          <h3 className="text-sm font-medium mb-4">Milestones (Raw)</h3>
          <div className="space-y-3">
            {expt.milestones.map((ms) => (
              <div
                key={ms.index}
                className="bg-card rounded-2xl p-5 border border-border"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium">
                    Milestone {ms.index}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    status: {ms.status} ({STATUS_MAP[ms.status]})
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-text-secondary">Description:</span>{" "}
                    {ms.description}
                  </div>
                  <div>
                    <span className="text-text-secondary">Type:</span>{" "}
                    {ms.deliverableType} ({DELIVERABLE_MAP[ms.deliverableType]})
                  </div>
                  <div>
                    <span className="text-text-secondary">Unlock BPS:</span>{" "}
                    {ms.unlockBps} ({(ms.unlockBps / 100).toFixed(1)}%)
                  </div>
                  <div>
                    <span className="text-text-secondary">Deadline:</span>{" "}
                    {new Date(ms.deadline * 1000).toISOString()}
                  </div>
                  <div>
                    <span className="text-text-secondary">Submitted:</span>{" "}
                    {ms.submittedAt
                      ? new Date(ms.submittedAt * 1000).toISOString()
                      : "null"}
                  </div>
                  <div>
                    <span className="text-text-secondary">Resolved:</span>{" "}
                    {ms.resolvedAt
                      ? new Date(ms.resolvedAt * 1000).toISOString()
                      : "null"}
                  </div>
                  <div className="col-span-2">
                    <span className="text-text-secondary">Hash:</span>{" "}
                    <span className="font-mono">
                      {ms.deliverableHash || "null"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Veto Stakes */}
        <div>
          <h3 className="text-sm font-medium mb-4">Veto Stakes</h3>
          {expt.vetoStakes.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No active veto stakes.
            </p>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-text-secondary px-4 py-2">
                      Staker
                    </th>
                    <th className="text-left text-xs font-medium text-text-secondary px-4 py-2">
                      Amount
                    </th>
                    <th className="text-left text-xs font-medium text-text-secondary px-4 py-2">
                      Milestone
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expt.vetoStakes.map((stake, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">
                        {stake.staker}
                      </td>
                      <td className="px-4 py-2">{stake.amount} SOL</td>
                      <td className="px-4 py-2">{stake.milestone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Separator />

        {/* Admin Actions */}
        <div>
          <h3 className="text-sm font-medium mb-4">
            Permissionless Operations
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
            >
              Finalize Presale
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
            >
              Resolve Milestone
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
            >
              Claim Fees
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs"
            >
              Unwrap SOL
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
