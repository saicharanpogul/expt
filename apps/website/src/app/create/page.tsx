"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Twitter, ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";

type Step = 1 | 2 | 3 | 4;

interface MilestoneInput {
  description: string;
  deliverableType: "url" | "github" | "program_id" | "deployment";
  unlockBps: number;
  deadline: string;
}

const DELIVERABLE_TYPES = [
  { value: "url", label: "URL" },
  { value: "github", label: "GitHub" },
  { value: "program_id", label: "Program ID" },
  { value: "deployment", label: "Deployment" },
];

export default function CreatePage() {
  // Auth state (will be replaced with Privy)
  const isConnected = false;
  const isTwitterLinked = false;
  const hasTweeted = false;

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [raiseTarget, setRaiseTarget] = useState("");
  const [minCap, setMinCap] = useState("");
  const [presaleDuration, setPresaleDuration] = useState("");
  const [vetoThresholdBps, setVetoThresholdBps] = useState("500");
  const [challengeWindow, setChallengeWindow] = useState("72");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { description: "", deliverableType: "url", unlockBps: 3334, deadline: "" },
  ]);

  // Gate checks
  if (!isConnected) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="mx-auto mb-4 text-text-secondary"
          >
            <rect x="3" y="11" width="18" height="11" rx="3" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="text-lg font-medium mb-2">Connect your wallet</h2>
          <p className="text-sm text-text-secondary mb-6">
            You need to connect your wallet to create an experiment.
          </p>
          <Button className="rounded-lg">Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (!isTwitterLinked) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <Twitter className="h-12 w-12 mx-auto mb-4 text-text-secondary" />
          <h2 className="text-lg font-medium mb-2">Link your Twitter</h2>
          <p className="text-sm text-text-secondary mb-6">
            Builders must link their X (Twitter) account for social
            accountability before creating experiments.
          </p>
          <Button className="rounded-lg">
            <Twitter className="h-4 w-4 mr-2" />
            Link Twitter via Privy
          </Button>
        </div>
      </div>
    );
  }

  if (!hasTweeted) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <Twitter className="h-12 w-12 mx-auto mb-4 text-text-secondary" />
          <h2 className="text-lg font-medium mb-2">Declare your experiment</h2>
          <p className="text-sm text-text-secondary mb-4">
            Tweet to declare that you&apos;re launching your building guild/sprint on
            expt.fun. This creates public accountability.
          </p>
          <div className="bg-card rounded-2xl p-4 border border-border text-left mb-6">
            <p className="text-sm text-text-secondary italic">
              &quot;I&apos;m launching my experiment on @expt_fun 🧪
              <br />
              Building: [your project name]
              <br />
              Raising: [amount] SOL
              <br />
              #expt #solana&quot;
            </p>
          </div>
          <Button className="rounded-lg w-full" asChild>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                "I'm launching my experiment on @expt_fun 🧪\n\nBuilding: \nRaising:  SOL\n\n#expt #solana"
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Tweet Declaration
            </a>
          </Button>
          <p className="text-xs text-text-secondary mt-3">
            After tweeting, paste the tweet URL below to verify.
          </p>
          <Input
            placeholder="https://x.com/your_handle/status/..."
            className="mt-2 rounded-lg"
          />
          <Button variant="outline" className="mt-2 rounded-lg w-full text-xs">
            Verify Tweet
          </Button>
        </div>
      </div>
    );
  }

  const addMilestone = () => {
    if (milestones.length >= 3) return;
    setMilestones([
      ...milestones,
      { description: "", deliverableType: "url", unlockBps: 3333, deadline: "" },
    ]);
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const updateMilestone = (
    index: number,
    field: keyof MilestoneInput,
    value: string | number
  ) => {
    const updated = [...milestones];
    (updated[index] as Record<string, unknown>)[field] = value;
    setMilestones(updated);
  };

  const totalUnlockBps = milestones.reduce((sum, m) => sum + m.unlockBps, 0);

  return (
    <div className="max-w-[600px] mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">
        Create Experiment
      </h1>
      <p className="text-sm text-text-secondary mb-8">
        Define your experiment, milestones, and veto parameters.
      </p>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-border"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-text-secondary mb-6">
        Step {step} of 4 —{" "}
        {step === 1
          ? "Basic Info"
          : step === 2
          ? "Milestones"
          : step === 3
          ? "Veto Rules"
          : "Review"}
      </p>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Experiment Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Experiment"
              maxLength={32}
              className="rounded-lg"
            />
            <p className="text-xs text-text-secondary mt-1">
              {name.length}/32 characters
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Metadata URI
            </label>
            <Input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="https://..."
              className="rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Raise Target (SOL)
              </label>
              <Input
                type="number"
                value={raiseTarget}
                onChange={(e) => setRaiseTarget(e.target.value)}
                placeholder="10"
                className="rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Minimum Cap (SOL)
              </label>
              <Input
                type="number"
                value={minCap}
                onChange={(e) => setMinCap(e.target.value)}
                placeholder="2"
                className="rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Presale Duration (days)
            </label>
            <Input
              type="number"
              value={presaleDuration}
              onChange={(e) => setPresaleDuration(e.target.value)}
              placeholder="7"
              className="rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Step 2: Milestones */}
      {step === 2 && (
        <div className="space-y-4">
          {milestones.map((ms, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl p-5 border border-border space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Milestone {i + 1}</h3>
                {milestones.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-text-secondary hover:text-expt-danger"
                    onClick={() => removeMilestone(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <Input
                value={ms.description}
                onChange={(e) =>
                  updateMilestone(i, "description", e.target.value)
                }
                placeholder="What will you deliver?"
                className="rounded-lg"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Deliverable Type
                  </label>
                  <select
                    value={ms.deliverableType}
                    onChange={(e) =>
                      updateMilestone(i, "deliverableType", e.target.value)
                    }
                    className="w-full h-9 px-3 text-sm rounded-lg border border-border bg-background"
                  >
                    {DELIVERABLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-1">
                    Unlock %
                  </label>
                  <Input
                    type="number"
                    value={ms.unlockBps / 100}
                    onChange={(e) =>
                      updateMilestone(
                        i,
                        "unlockBps",
                        Number(e.target.value) * 100
                      )
                    }
                    className="rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-1">
                  Deadline
                </label>
                <Input
                  type="date"
                  value={ms.deadline}
                  onChange={(e) => updateMilestone(i, "deadline", e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>
          ))}

          {milestones.length < 3 && (
            <Button
              variant="outline"
              className="w-full rounded-lg text-xs"
              onClick={addMilestone}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Milestone ({milestones.length}/3)
            </Button>
          )}

          <div
            className={`text-xs text-center ${
              totalUnlockBps === 10000
                ? "text-expt-success"
                : "text-expt-danger"
            }`}
          >
            Total unlock: {(totalUnlockBps / 100).toFixed(1)}%{" "}
            {totalUnlockBps !== 10000 && "(must equal 100%)"}
          </div>
        </div>
      )}

      {/* Step 3: Veto Rules */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Veto Threshold (basis points)
            </label>
            <Input
              type="number"
              value={vetoThresholdBps}
              onChange={(e) => setVetoThresholdBps(e.target.value)}
              placeholder="500"
              className="rounded-lg"
            />
            <p className="text-xs text-text-secondary mt-1">
              {(Number(vetoThresholdBps) / 100).toFixed(1)}% of milestone value
              needed to veto
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Challenge Window (hours)
            </label>
            <Input
              type="number"
              value={challengeWindow}
              onChange={(e) => setChallengeWindow(e.target.value)}
              placeholder="72"
              className="rounded-lg"
            />
            <p className="text-xs text-text-secondary mt-1">
              Time supporters have to veto after milestone submission
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl p-5 border border-border space-y-3">
            <h3 className="text-sm font-medium">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Name</span>
                <span className="font-medium">{name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Raise Target</span>
                <span className="font-medium">{raiseTarget || "—"} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Min Cap</span>
                <span className="font-medium">{minCap || "—"} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Presale Duration</span>
                <span className="font-medium">
                  {presaleDuration || "—"} days
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Milestones</span>
                <span className="font-medium">{milestones.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Veto Threshold</span>
                <span className="font-medium">
                  {(Number(vetoThresholdBps) / 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Challenge Window</span>
                <span className="font-medium">{challengeWindow}h</span>
              </div>
            </div>
          </div>

          {milestones.map((ms, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl p-4 border border-border"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-border" />
                <span className="text-xs font-medium">Milestone {i + 1}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {(ms.unlockBps / 100).toFixed(1)}%
                </Badge>
              </div>
              <p className="text-xs text-text-secondary ml-3.5">
                {ms.description || "No description"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
        {step > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => setStep((step - 1) as Step)}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>
        ) : (
          <div />
        )}

        {step < 4 ? (
          <Button
            size="sm"
            className="rounded-lg text-xs"
            onClick={() => setStep((step + 1) as Step)}
          >
            Next
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        ) : (
          <Button size="sm" className="rounded-lg text-xs">
            Create Experiment
          </Button>
        )}
      </div>
    </div>
  );
}
