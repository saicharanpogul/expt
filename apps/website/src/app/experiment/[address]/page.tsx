"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink, Clock, Shield, Coins } from "lucide-react";
import { useState } from "react";

// Mock data for a single experiment
const EXPERIMENT = {
  address: "abc123",
  name: "Solana Pay Plugin",
  builder: "@builder_one",
  builderAddress: "7xKX...F3mp",
  status: "Active",
  uri: "https://example.com/metadata.json",
  description:
    "A lightweight payment plugin for Solana that enables merchants to accept SOL and SPL tokens with zero integration friction.",
  presale: {
    raised: "5.2 SOL",
    target: "10 SOL",
    minCap: "2 SOL",
    duration: "7 days",
  },
  treasury: {
    balance: "1.3 SOL",
    totalReceived: "1.3 SOL",
    totalClaimed: "0.43 SOL",
  },
  vetoThreshold: "5%",
  challengeWindow: "72h",
  milestones: [
    {
      index: 0,
      description: "Deploy payment SDK with merchant dashboard",
      deliverableType: "GitHub",
      unlockPercent: 33,
      deadline: "2026-03-01",
      status: "Passed",
      deliverable: "https://github.com/example/repo",
      submittedAt: "2026-02-10",
    },
    {
      index: 1,
      description: "Integrate with 3 major e-commerce platforms",
      deliverableType: "URL",
      unlockPercent: 34,
      deadline: "2026-04-01",
      status: "Submitted",
      deliverable: "https://example.com/integrations",
      submittedAt: "2026-02-12",
    },
    {
      index: 2,
      description: "Launch mainnet with real merchant onboarding",
      deliverableType: "Deployment",
      unlockPercent: 33,
      deadline: "2026-05-01",
      status: "Pending",
      deliverable: "",
      submittedAt: null,
    },
  ],
};

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-expt-success/10 text-expt-success border-expt-success/20",
  Presale: "bg-expt-warning/10 text-expt-warning border-expt-warning/20",
  Completed: "bg-expt-info/10 text-expt-info border-expt-info/20",
  Failed: "bg-expt-danger/10 text-expt-danger border-expt-danger/20",
};

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  Passed: "bg-expt-success/10 text-expt-success border-expt-success/20",
  Submitted: "bg-expt-warning/10 text-expt-warning border-expt-warning/20",
  Pending: "bg-secondary text-text-secondary border-border",
  Challenged: "bg-expt-danger/10 text-expt-danger border-expt-danger/20",
  Failed: "bg-expt-danger/10 text-expt-danger border-expt-danger/20",
};

type Tab = "overview" | "milestones" | "treasury";

export default function ExperimentDetailPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const expt = EXPERIMENT;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href="/browse"
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Browse
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {expt.name}
            </h1>
            <Badge
              variant="outline"
              className={`text-xs ${STATUS_COLORS[expt.status] || ""}`}
            >
              {expt.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {expt.builder} · {expt.builderAddress}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 w-fit mb-8">
        {(["overview", "milestones", "treasury"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium rounded-lg capitalize transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Description */}
          <div className="bg-card rounded-3xl p-6 border border-border">
            <h3 className="text-sm font-medium mb-2">About</h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              {expt.description}
            </p>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card rounded-2xl p-5 border border-border">
              <div className="flex items-center gap-2 text-text-secondary mb-2">
                <Coins className="h-4 w-4" />
                <span className="text-xs font-medium">Presale</span>
              </div>
              <p className="text-lg font-semibold">{expt.presale.raised}</p>
              <p className="text-xs text-text-secondary">
                of {expt.presale.target} target
              </p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <div className="flex items-center gap-2 text-text-secondary mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Challenge Window</span>
              </div>
              <p className="text-lg font-semibold">{expt.challengeWindow}</p>
              <p className="text-xs text-text-secondary">for veto period</p>
            </div>
            <div className="bg-card rounded-2xl p-5 border border-border">
              <div className="flex items-center gap-2 text-text-secondary mb-2">
                <Shield className="h-4 w-4" />
                <span className="text-xs font-medium">Veto Threshold</span>
              </div>
              <p className="text-lg font-semibold">{expt.vetoThreshold}</p>
              <p className="text-xs text-text-secondary">of milestone value</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "milestones" && (
        <div className="space-y-4">
          {expt.milestones.map((milestone, i) => (
            <div
              key={milestone.index}
              className="bg-card rounded-3xl p-6 border border-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {/* Timeline dot */}
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        milestone.status === "Passed"
                          ? "bg-expt-success"
                          : milestone.status === "Submitted"
                          ? "bg-expt-warning"
                          : milestone.status === "Failed"
                          ? "bg-expt-danger"
                          : "bg-border"
                      }`}
                    />
                    <h3 className="text-sm font-medium">
                      Milestone {milestone.index + 1}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                        MILESTONE_STATUS_COLORS[milestone.status] || ""
                      }`}
                    >
                      {milestone.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-text-secondary ml-4 leading-relaxed">
                    {milestone.description}
                  </p>
                  <div className="mt-3 ml-4 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                    <span>
                      Unlock: {milestone.unlockPercent}%
                    </span>
                    <span>Type: {milestone.deliverableType}</span>
                    <span>Deadline: {milestone.deadline}</span>
                  </div>
                  {milestone.deliverable && (
                    <a
                      href={milestone.deliverable}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 ml-4 inline-flex items-center gap-1 text-xs text-expt-info hover:underline"
                    >
                      View deliverable <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0">
                  {milestone.status === "Submitted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-lg h-8"
                    >
                      Veto
                    </Button>
                  )}
                  {milestone.status === "Pending" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-lg h-8"
                    >
                      Submit Proof
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "treasury" && (
        <div className="space-y-6">
          {/* Balance card */}
          <div className="bg-surface-muted rounded-3xl p-8">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
              Treasury Balance
            </p>
            <p className="text-3xl font-semibold">{expt.treasury.balance}</p>
            <div className="mt-4 flex flex-wrap gap-6 text-xs text-text-secondary">
              <div>
                <p className="font-medium text-foreground mb-0.5">
                  {expt.treasury.totalReceived}
                </p>
                <p>Total received</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-0.5">
                  {expt.treasury.totalClaimed}
                </p>
                <p>Builder claimed</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Milestone unlock breakdown */}
          <div>
            <h3 className="text-sm font-medium mb-4">Unlock Schedule</h3>
            <div className="space-y-2">
              {expt.milestones.map((ms) => (
                <div
                  key={ms.index}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        ms.status === "Passed"
                          ? "bg-expt-success"
                          : "bg-border"
                      }`}
                    />
                    <span className="text-sm text-text-secondary">
                      Milestone {ms.index + 1}
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {ms.unlockPercent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
