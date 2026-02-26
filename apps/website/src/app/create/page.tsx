"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Twitter,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSolanaSigner } from "@/hooks/use-solana-signer";
import {
  executeCreateExperiment,
  type CreationStep as CreationStepType,
} from "@/lib/create-experiment";

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
  return (
    <Suspense fallback={
      <div className="max-w-[600px] mx-auto px-6 py-16 text-center">
        <div className="w-6 h-6 mx-auto border-2 border-[#DEDEE3] border-t-[#140E1C] rounded-full animate-spin" />
      </div>
    }>
      <CreatePageContent />
    </Suspense>
  );
}

function CreatePageContent() {
  const { ready, authenticated, user, login, linkTwitter, connectWallet } = usePrivy();

  // Derive auth state from Privy
  const solanaWallet = user?.linkedAccounts?.find(
    (a) => a.type === "wallet" && a.chainType === "solana"
  );
  const twitterAccount = user?.linkedAccounts?.find(
    (a) => a.type === "twitter_oauth"
  );
  const hasWallet = !!solanaWallet;
  const isConnected = ready && authenticated && hasWallet;
  const isTwitterLinked = !!twitterAccount;
  const searchParams = useSearchParams();
  const isAdmin = searchParams.get("debug") === process.env.NEXT_PUBLIC_ADMIN_ROUTE_HASH;

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [metadataUri, setMetadataUri] = useState<string | null>(null);
  const [raiseTarget, setRaiseTarget] = useState("");
  const [minCap, setMinCap] = useState("");
  const [creationSteps, setCreationSteps] = useState<CreationStepType[] | null>(null);
  const [creationDone, setCreationDone] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [exptAddress, setExptAddress] = useState<string | null>(null);
  const signer = useSolanaSigner();
  const [presaleHours, setPresaleHours] = useState("");
  const [presaleMinutes, setPresaleMinutes] = useState("");
  const [vetoThresholdBps, setVetoThresholdBps] = useState("500");
  const [challengeHours, setChallengeHours] = useState("72");
  const [challengeMinutes, setChallengeMinutes] = useState("0");

  const isTestMode = process.env.NEXT_PUBLIC_SOLANA_NETWORK !== "mainnet-beta";
  const minDurationSeconds = isTestMode ? 60 : 24 * 60 * 60; // 1 min test, 24h prod
  const totalPresaleSeconds = (Number(presaleHours) || 0) * 3600 + (Number(presaleMinutes) || 0) * 60;
  const presaleDurationValid = totalPresaleSeconds >= minDurationSeconds;
  const totalChallengeSeconds = (Number(challengeHours) || 0) * 3600 + (Number(challengeMinutes) || 0) * 60;
  const challengeWindowValid = totalChallengeSeconds >= minDurationSeconds;
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { description: "", deliverableType: "url", unlockBps: 3334, deadline: "" },
  ]);

  // Gate: wallet not connected
  if (!isConnected) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#DEDEE3] flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6A6D78"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="3" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-medium mb-2 text-[#1C1917]">
            Connect your wallet
          </h2>
          <p className="text-sm text-[#6A6D78] mb-6">
            You need to connect your wallet to create an experiment.
          </p>
          <Button
            className="rounded-full bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE] px-8"
            onClick={() => authenticated ? connectWallet() : login()}
            disabled={!ready}
          >
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  // Gate: Twitter not linked
  if (!isTwitterLinked) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#DEDEE3] flex items-center justify-center">
            <Twitter className="h-6 w-6 text-[#6A6D78]" />
          </div>
          <h2 className="text-lg font-medium mb-2 text-[#1C1917]">
            Link your Twitter
          </h2>
          <p className="text-sm text-[#6A6D78] mb-6">
            Builders must link their X (Twitter) account for social
            accountability before creating experiments.
          </p>
          <Button
            className="rounded-full bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE] px-8"
            onClick={() => linkTwitter()}
          >
            <Twitter className="h-4 w-4 mr-2" />
            Link Twitter via Privy
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
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    setMilestones(updated);
  };

  const totalUnlockBps = milestones.reduce((sum, m) => sum + m.unlockBps, 0);

  // --- Admin debug prefill ---
  const prefillTestData = () => {
    setName("Solana Pay Plugin");
    setSymbol("SPAY");
    setDescription("A merchant payment SDK for Solana. Milestone-funded experiment.");
    setRaiseTarget("5");
    setMinCap("1");
    setPresaleHours("0");
    setPresaleMinutes("2");
    setVetoThresholdBps("500");
    setChallengeHours("0");
    setChallengeMinutes("1");
    const now = new Date();
    const d1 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const d2 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const d3 = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 16);
    setMilestones([
      { description: "SDK core + docs", deliverableType: "github", unlockBps: 3334, deadline: fmt(d1) },
      { description: "Merchant dashboard", deliverableType: "deployment", unlockBps: 3333, deadline: fmt(d2) },
      { description: "Mainnet launch", deliverableType: "program_id", unlockBps: 3333, deadline: fmt(d3) },
    ]);
    // Skip metadata upload — use pre-uploaded debug URI
    setMetadataUri("https://ipfs.io/ipfs/QmNjDRsXCNY7jaF2fZnPwDYCyeVEvT6D2CX2LcbBiBhNWM");
  };

  // --- Per-step validation ---
  const step1Valid =
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    Number(raiseTarget) > 0 &&
    Number(minCap) > 0 &&
    Number(minCap) <= Number(raiseTarget) &&
    presaleDurationValid;

  const step2Valid =
    milestones.length >= 1 &&
    milestones.every((ms) => ms.description.trim().length > 0 && ms.deadline.length > 0) &&
    totalUnlockBps === 10000;

  const step3Valid =
    Number(vetoThresholdBps) > 0 &&
    Number(vetoThresholdBps) <= 10000 &&
    challengeWindowValid;

  const stepValid: Record<Step, boolean> = {
    1: step1Valid,
    2: step2Valid,
    3: step3Valid,
    4: true,
  };

  const handleCreate = async () => {
    if (!signer.publicKey) {
      alert("Please connect a Solana wallet first.");
      return;
    }

    try {
      setUploading(true);
      setCreationDone(false);
      setCreationError(null);
      setExptAddress(null);

      // --- 1. Upload metadata (if needed) ---
      let uri = metadataUri;
      if (!uri) {
        setCreationSteps([
          { label: "Uploading metadata", status: "processing" },
        ]);

        const formData = new FormData();
        formData.append("name", name);
        formData.append("symbol", symbol);
        formData.append("description", description);
        if (imageFile) formData.append("image", imageFile);

        const res = await fetch("/api/upload-metadata", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Metadata upload failed");
        }

        const data = await res.json();
        uri = data.uri;
        setMetadataUri(uri);
      }

      // --- 2. Execute on-chain transactions ---
      const result = await executeCreateExperiment(
        signer.connection,
        signer.publicKey,
        {
          name,
          uri: uri!,
          symbol,
          raiseTargetSol: Number(raiseTarget),
          minCapSol: Number(minCap),
          presaleDurationSeconds: totalPresaleSeconds,
          vetoThresholdBps: Number(vetoThresholdBps),
          challengeWindowSeconds: totalChallengeSeconds,
          milestones: milestones.map((m) => ({
            description: m.description,
            deliverableType: m.deliverableType,
            unlockBps: m.unlockBps,
            deadline: m.deadline,
          })),
        },
        signer.signAndSend,
        (steps) => setCreationSteps([...steps])
      );

      setExptAddress(result.exptConfigPda.toBase58());
      setCreationDone(true);
    } catch (err) {
      console.error("Create experiment error:", err);
      setCreationError(
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-[600px] mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-2 text-[#1C1917]">
        Create Experiment
      </h1>
      <p className="text-sm text-[#6A6D78] mb-8">
        Define your experiment, milestones, and veto parameters.
      </p>

      {/* Admin Debug Panel */}
      {isAdmin && (
        <div className="mb-6 p-4 rounded-xl border-2 border-dashed border-[#D97706] bg-[#FFFBEB]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#D97706]">🛠 Admin Debug</span>
              <span className="text-xs text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-full">test mode</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs rounded-lg border-[#D97706] text-[#D97706] hover:bg-[#FEF3C7]"
                onClick={prefillTestData}
              >
                Prefill All Fields
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs rounded-lg border-[#D97706] text-[#D97706] hover:bg-[#FEF3C7]"
                onClick={() => setStep(4 as Step)}
              >
                Skip to Review
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-[#140E1C]" : "bg-[#DEDEE3]"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-[#6A6D78] mb-6">
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
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Experiment Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Experiment"
              maxLength={32}
              className="rounded-lg border-[#DEDEE3]"
            />
            <p className="text-xs text-[#6A6D78] mt-1">
              {name.length}/32 characters
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Token Symbol
            </label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="EXPT"
              maxLength={10}
              className="rounded-lg border-[#DEDEE3]"
            />
            <p className="text-xs text-[#6A6D78] mt-1">
              {symbol.length}/10 characters
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your experiment..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#DEDEE3] bg-white text-[#1C1917] resize-none focus:outline-none focus:ring-2 focus:ring-[#140E1C]/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Image
            </label>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }
              }}
            />
            {imagePreview ? (
              <div className="relative group">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-lg border border-[#DEDEE3]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    if (imageInputRef.current) imageInputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-lg p-1.5 text-[#6A6D78] hover:text-[#D32F2F] transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full h-32 rounded-lg border-2 border-dashed border-[#DEDEE3] hover:border-[#140E1C]/30 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Plus className="h-5 w-5 text-[#A1A1AA]" />
                <span className="text-xs text-[#6A6D78]">Upload image</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
                Raise Target (SOL)
              </label>
              <Input
                type="number"
                value={raiseTarget}
                onChange={(e) => setRaiseTarget(e.target.value)}
                placeholder="10"
                min={0}
                className="rounded-lg border-[#DEDEE3]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
                Minimum Cap (SOL)
              </label>
              <Input
                type="number"
                value={minCap}
                onChange={(e) => setMinCap(e.target.value)}
                placeholder="2"
                min={0}
                className="rounded-lg border-[#DEDEE3]"
              />
            </div>
          </div>
          {minCap && raiseTarget && Number(minCap) > Number(raiseTarget) && (
            <p className="text-xs text-[#D32F2F]">
              Min cap cannot exceed raise target
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Presale Duration
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  value={presaleHours}
                  onChange={(e) => setPresaleHours(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#6A6D78] mt-1">Hours</p>
              </div>
              <div>
                <Input
                  type="number"
                  value={presaleMinutes}
                  onChange={(e) => setPresaleMinutes(e.target.value)}
                  placeholder="0"
                  min={0}
                  max={59}
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#6A6D78] mt-1">Minutes</p>
              </div>
            </div>
            {(presaleHours || presaleMinutes) && !presaleDurationValid && (
              <p className="text-xs text-[#D32F2F] mt-1.5">
                Minimum: {isTestMode ? "1 minute" : "24 hours"}
              </p>
            )}
            {isTestMode && (
              <p className="text-xs text-[#D97706] mt-1">⚡ Test mode — 1 min minimum</p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Milestones */}
      {step === 2 && (
        <div className="space-y-4">
          {milestones.map((ms, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-5 border border-[#DEDEE3] space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-[#1C1917]">
                  Milestone {i + 1}
                </h3>
                {milestones.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-[#6A6D78] hover:text-[#D32F2F]"
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
                className="rounded-lg border-[#DEDEE3]"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#6A6D78] block mb-1">
                    Deliverable Type
                  </label>
                  <select
                    value={ms.deliverableType}
                    onChange={(e) =>
                      updateMilestone(i, "deliverableType", e.target.value)
                    }
                    className="w-full h-9 px-3 text-sm rounded-lg border border-[#DEDEE3] bg-white text-[#1C1917]"
                  >
                    {DELIVERABLE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#6A6D78] block mb-1">
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
                    className="rounded-lg border-[#DEDEE3]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#6A6D78] block mb-1">
                  Deadline
                </label>
                <Input
                  type="datetime-local"
                  value={ms.deadline}
                  onChange={(e) =>
                    updateMilestone(i, "deadline", e.target.value)
                  }
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#A1A1AA] mt-1">
                  Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}) — stored as UTC on-chain
                </p>
              </div>
            </div>
          ))}

          {milestones.length < 3 && (
            <Button
              variant="outline"
              className="w-full rounded-lg text-xs border-[#DEDEE3]"
              onClick={addMilestone}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Milestone ({milestones.length}/3)
            </Button>
          )}

          <div
            className={`text-xs text-center ${
              totalUnlockBps === 10000 ? "text-[#140E1C]" : "text-[#D32F2F]"
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
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Veto Threshold
            </label>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Input
                  type="number"
                  value={vetoThresholdBps}
                  onChange={(e) => setVetoThresholdBps(e.target.value)}
                  placeholder="500"
                  min={1}
                  max={10000}
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#6A6D78] mt-1">Basis points</p>
              </div>
              <p className="text-sm font-medium text-[#1C1917] pb-6">
                = {(Number(vetoThresholdBps) / 100).toFixed(1)}%
              </p>
            </div>
            {Number(vetoThresholdBps) <= 0 && (
              <p className="text-xs text-[#D32F2F] mt-1">Must be greater than 0</p>
            )}
            {Number(vetoThresholdBps) > 10000 && (
              <p className="text-xs text-[#D32F2F] mt-1">Cannot exceed 10000 (100%)</p>
            )}
            <p className="text-xs text-[#A1A1AA] mt-1">
              Percentage of milestone value needed to veto
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-[#6A6D78] block mb-1.5">
              Challenge Window
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  type="number"
                  value={challengeHours}
                  onChange={(e) => setChallengeHours(e.target.value)}
                  placeholder="72"
                  min={0}
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#6A6D78] mt-1">Hours</p>
              </div>
              <div>
                <Input
                  type="number"
                  value={challengeMinutes}
                  onChange={(e) => setChallengeMinutes(e.target.value)}
                  placeholder="0"
                  min={0}
                  max={59}
                  className="rounded-lg border-[#DEDEE3]"
                />
                <p className="text-xs text-[#6A6D78] mt-1">Minutes</p>
              </div>
            </div>
            {(challengeHours || challengeMinutes) && !challengeWindowValid && (
              <p className="text-xs text-[#D32F2F] mt-1.5">
                Minimum: {isTestMode ? "1 minute" : "24 hours"}
              </p>
            )}
            {isTestMode && (
              <p className="text-xs text-[#D97706] mt-1">⚡ Test mode — 1 min minimum</p>
            )}
            <p className="text-xs text-[#A1A1AA] mt-1">
              Time supporters have to veto after milestone submission
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3] space-y-3">
            <h3 className="text-sm font-medium text-[#1C1917]">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Name</span>
                <span className="font-medium text-[#1C1917]">
                  {name || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Symbol</span>
                <span className="font-medium text-[#1C1917]">
                  {symbol || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Raise Target</span>
                <span className="font-medium text-[#1C1917]">
                  {raiseTarget || "—"} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Min Cap</span>
                <span className="font-medium text-[#1C1917]">
                  {minCap || "—"} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Presale Duration</span>
                <span className="font-medium text-[#1C1917]">
                  {Number(presaleHours) || 0}h {Number(presaleMinutes) || 0}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Milestones</span>
                <span className="font-medium text-[#1C1917]">
                  {milestones.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Veto Threshold</span>
                <span className="font-medium text-[#1C1917]">
                  {(Number(vetoThresholdBps) / 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A6D78]">Challenge Window</span>
                <span className="font-medium text-[#1C1917]">
                  {Number(challengeHours) || 0}h {Number(challengeMinutes) || 0}m
                </span>
              </div>
            </div>
          </div>

          {milestones.map((ms, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-4 border border-[#DEDEE3]"
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#DEDEE3]" />
                <span className="text-xs font-medium text-[#1C1917]">
                  Milestone {i + 1}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 border-[#DEDEE3]"
                >
                  {(ms.unlockBps / 100).toFixed(1)}%
                </Badge>
              </div>
              <p className="text-xs text-[#6A6D78] ml-3.5">
                {ms.description || "No description"}
              </p>
            </div>
          ))}

          {imagePreview && (
            <div className="bg-white rounded-2xl p-4 border border-[#DEDEE3]">
              <p className="text-xs font-medium text-[#1C1917] mb-2">Image</p>
              <img
                src={imagePreview}
                alt="Preview"
                className="w-20 h-20 object-cover rounded-lg border border-[#DEDEE3]"
              />
            </div>
          )}

          {metadataUri && (
            <div className="bg-[#F0FDF4] rounded-2xl p-4 border border-[#BBF7D0]">
              <p className="text-xs font-medium text-[#166534]">Metadata uploaded</p>
              <p className="text-xs text-[#166534] font-mono mt-1 break-all">{metadataUri}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#DEDEE3]">
        {step > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs text-[#6A6D78]"
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
            className="rounded-lg text-xs bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => setStep((step + 1) as Step)}
            disabled={!stepValid[step]}
          >
            Next
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        ) : (
          <Button
            size="sm"
            className="rounded-lg text-xs bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE] disabled:opacity-40"
            onClick={handleCreate}
            disabled={uploading || !signer.ready}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Creating...
              </>
            ) : !signer.ready ? (
              "Connect Wallet"
            ) : (
              "Create Experiment"
            )}
          </Button>
        )}
      </div>

      {/* Creation Progress Overlay */}
      {creationSteps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-[#1C1917] mb-6 text-center">
              {creationDone
                ? "\ud83c\udf89 Experiment Created!"
                : creationError
                ? "\u274c Creation Failed"
                : "Creating Experiment..."}
            </h2>

            <div className="space-y-4">
              {creationSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {s.status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
                    ) : s.status === "error" ? (
                      <XCircle className="h-5 w-5 text-[#D32F2F]" />
                    ) : s.status === "pending" ? (
                      <div className="h-5 w-5 rounded-full border-2 border-[#DEDEE3]" />
                    ) : (
                      <Loader2 className="h-5 w-5 text-[#140E1C] animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        s.status === "done"
                          ? "text-[#16A34A]"
                          : s.status === "error"
                          ? "text-[#D32F2F]"
                          : s.status === "pending"
                          ? "text-[#A1A1AA]"
                          : "text-[#1C1917]"
                      }`}
                    >
                      {s.label}
                    </p>
                    {s.status === "signing" && (
                      <p className="text-xs text-[#D97706]">Check your wallet...</p>
                    )}
                    {s.status === "confirming" && (
                      <p className="text-xs text-[#6A6D78]">Confirming...</p>
                    )}
                    {s.error && (
                      <p className="text-xs text-[#D32F2F] truncate">{s.error}</p>
                    )}
                    {s.signature && (
                      <a
                        href={`https://explorer.solana.com/tx/${s.signature}?cluster=custom&customUrl=${encodeURIComponent(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://localhost:8899")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#6A6D78] hover:text-[#140E1C] flex items-center gap-1 mt-0.5"
                      >
                        View tx <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {exptAddress && (
              <div className="mt-6 p-3 bg-[#F0FDF4] rounded-xl border border-[#BBF7D0]">
                <p className="text-xs font-medium text-[#166534]">Experiment Address</p>
                <p className="text-xs text-[#166534] font-mono mt-1 break-all">
                  {exptAddress}
                </p>
              </div>
            )}

            {(creationDone || creationError) && (
              <div className="mt-6 flex justify-center gap-3">
                {creationError && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg text-xs"
                    onClick={() => {
                      setCreationSteps(null);
                      setCreationError(null);
                    }}
                  >
                    Close
                  </Button>
                )}
                {creationDone && (
                  <Button
                    size="sm"
                    className="rounded-lg text-xs bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE]"
                    onClick={() => {
                      window.location.href = `/experiment/${exptAddress}`;
                    }}
                  >
                    View Experiment
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
