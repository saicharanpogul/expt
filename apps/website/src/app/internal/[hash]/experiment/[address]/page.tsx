"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
} from "lucide-react";
import { useState, useEffect, use, useCallback } from "react";
import { useExptClient } from "@/hooks/use-expt-client";
import { useSolanaSigner } from "@/hooks/use-solana-signer";
import {
  type ParsedExptConfig,
  type ParsedPresaleState,
  ExptStatus,
  MilestoneStatus,
  exptStatusLabel,
  milestoneStatusLabel,
  deriveQuoteVault,
  deriveDammPoolPda,
  deriveDammPositionPda,
  deriveDammPositionNftAccount,
  deriveDammTokenVault,
  DAMM_POOL_AUTHORITY,
  DAMM_V2_PROGRAM_ID,
  NATIVE_MINT as EXPT_NATIVE_MINT,
} from "@expt/sdk";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  TransactionInstruction,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT as SPL_NATIVE_MINT,
} from "@solana/spl-token";


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

const MS_STATUS_COLORS: Record<number, string> = {
  [MilestoneStatus.Pending]: "bg-[#DEDEE3] text-[#6A6D78] border-[#DEDEE3]",
  [MilestoneStatus.Submitted]:
    "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [MilestoneStatus.Challenged]:
    "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [MilestoneStatus.Passed]:
    "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [MilestoneStatus.Failed]:
    "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
};

// DAMM v2 swap2 instruction discriminator = sha256("global:swap2")[..8]
const SWAP2_DISCRIMINATOR = Buffer.from([65, 75, 63, 76, 235, 91, 91, 136]);

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatDate(ts: number | null): string {
  if (!ts || ts === 0) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export default function AdminExperimentDetailPage({
  params,
}: {
  params: Promise<{ hash: string; address: string }>;
}) {
  const { hash, address } = use(params);
  const client = useExptClient();
  const { publicKey, connection, signAndSend, ready } = useSolanaSigner();

  const [expt, setExpt] = useState<ParsedExptConfig | null>(null);
  const [presale, setPresale] = useState<ParsedPresaleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    success: boolean;
    message: string;
    sig?: string;
  } | null>(null);

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const isMainnet = network === "mainnet-beta" || network === "mainnet";
  const solscanTxUrl = (sig: string) =>
    `https://solscan.io/tx/${sig}${isMainnet ? "" : "?cluster=devnet"}`;
  const [resolveIdx, setResolveIdx] = useState("");
  const [submitIdx, setSubmitIdx] = useState("");
  const [submitDeliverable, setSubmitDeliverable] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapDirection, setSwapDirection] = useState<"buy" | "sell">("buy");
  const [swapAmount, setSwapAmount] = useState("");
  const [swapping, setSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{
    success: boolean;
    message: string;
    sig?: string;
  } | null>(null);
  const [swapBalances, setSwapBalances] = useState<{
    sol: number;
    token: number;
  } | null>(null);

  const fetchSwapBalances = useCallback(async () => {
    if (!publicKey || !expt || !connection) return;
    try {
      // SOL balance
      const solBal = await connection.getBalance(publicKey);
      // Token balance
      let tokenBal = 0;
      try {
        const tokenAta = await getAssociatedTokenAddress(expt.mint, publicKey);
        const tokenAcct = await connection.getTokenAccountBalance(tokenAta);
        tokenBal = Number(tokenAcct.value.uiAmount ?? 0);
      } catch {
        // ATA doesn't exist yet
      }
      setSwapBalances({
        sol: solBal / LAMPORTS_PER_SOL,
        token: tokenBal,
      });
    } catch {
      // ignore
    }
  }, [publicKey, expt, connection]);

  const fetchData = useCallback(async (silent = false) => {
    try {
      const pubkey = new PublicKey(address);
      const config = await client.fetchExptConfigByAddress(pubkey);
      if (!config) {
        setError("Experiment not found");
        return;
      }
      setExpt(config);

      const presaleState = await client.fetchPresaleState(config.presale);
      if (presaleState) setPresale(presaleState);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load"
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, [address, client]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runAction = async (
    name: string,
    buildTx: () => Promise<{ tx: Transaction; signers?: Keypair[] }>
  ) => {
    if (!publicKey) return;
    setActionLoading(name);
    setActionResult(null);
    try {
      const { tx, signers } = await buildTx();
      const sig = await signAndSend(tx, signers);
      setActionResult({
        success: true,
        message: `${name} succeeded`,
        sig,
      });
      fetchData(true);
    } catch (err: any) {
      console.error(`${name} error:`, err);
      setActionResult({
        success: false,
        message: err?.message || `${name} failed`,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-[#DEDEE3] rounded w-24" />
          <div className="h-8 bg-[#DEDEE3] rounded w-64" />
          <div className="h-40 bg-[#DEDEE3] rounded-3xl" />
        </div>
      </div>
    );
  }

  if (error || !expt) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <Link
          href={`/internal/${hash}`}
          className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Dashboard
        </Link>
        <div className="text-center py-20">
          <p className="text-sm text-[#6A6D78]">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const treasurySOL = Number(expt.totalTreasuryReceived) / LAMPORTS_PER_SOL;
  const vetoThresholdPct = expt.vetoThresholdBps / 100;
  const challengeHours =
    Number(expt.challengeWindow) / 3600;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <Link
        href={`/internal/${hash}`}
        className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
              {expt.name}
            </h1>
            <Badge
              variant="outline"
              className={`text-xs ${STATUS_COLORS[expt.status] || ""}`}
            >
              {exptStatusLabel(expt.status)}
            </Badge>
            <Badge
              variant="outline"
              className="text-xs border-[#DEDEE3] text-[#6A6D78]"
            >
              Admin View
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-[#6A6D78] font-mono">
              {address}
            </span>
            <button
              onClick={() => copyToClipboard(address)}
              className="text-[#6A6D78] hover:text-[#1C1917]"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Key Addresses */}
        <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3]">
          <h3 className="text-sm font-medium text-[#1C1917] mb-4">
            Key Addresses
          </h3>
          <div className="space-y-3 text-sm">
            {[
              { label: "Builder", value: expt.builder.toBase58() },
              { label: "Presale PDA", value: expt.presale.toBase58() },
              { label: "Mint", value: expt.mint.toBase58() },
              { label: "URI", value: expt.uri },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-4"
              >
                <span className="text-[#6A6D78] shrink-0">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs truncate max-w-[400px] text-[#1C1917]">
                    {item.value}
                  </span>
                  <button
                    onClick={() => copyToClipboard(item.value)}
                    className="text-[#6A6D78] hover:text-[#1C1917] shrink-0"
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
            { label: "Treasury Received", value: `${treasurySOL.toFixed(2)} SOL` },
            {
              label: "Min Cap",
              value: `${(Number(expt.presaleMinimumCap) / LAMPORTS_PER_SOL).toFixed(2)} SOL`,
            },
            { label: "Veto Threshold", value: `${vetoThresholdPct}%` },
            {
              label: "Challenge Window",
              value: `${challengeHours.toFixed(1)}h`,
            },
            {
              label: "Milestones",
              value: `${expt.milestones.filter((m) => m.status === MilestoneStatus.Passed).length}/${expt.milestoneCount}`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white rounded-2xl p-4 border border-[#DEDEE3]"
            >
              <p className="text-xs text-[#6A6D78] mb-1">{item.label}</p>
              <p className="text-sm font-medium text-[#1C1917]">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Presale State */}
        {presale && (
          <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3]">
            <h3 className="text-sm font-medium text-[#1C1917] mb-4">
              Presale State
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-[#6A6D78]">Total Deposit</p>
                <p className="font-medium text-[#1C1917]">
                  {(Number(presale.totalDeposit) / LAMPORTS_PER_SOL).toFixed(4)}{" "}
                  SOL
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6A6D78]">Start</p>
                <p className="font-medium text-[#1C1917]">
                  {formatDate(presale.presaleStartTime)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6A6D78]">End</p>
                <p className="font-medium text-[#1C1917]">
                  {formatDate(presale.presaleEndTime)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6A6D78]">Supply</p>
                <p className="font-medium text-[#1C1917]">
                  {(Number(presale.presaleSupply) / LAMPORTS_PER_SOL).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Milestones */}
        <div>
          <h3 className="text-sm font-medium text-[#1C1917] mb-4">
            Milestones
          </h3>
          <div className="space-y-3">
            {expt.milestones.map((ms) => (
              <div
                key={ms.index}
                className="bg-white rounded-2xl p-5 border border-[#DEDEE3]"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-[#1C1917]">
                    Milestone {ms.index}
                  </h4>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                      MS_STATUS_COLORS[ms.status] || ""
                    }`}
                  >
                    {milestoneStatusLabel(ms.status)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#6A6D78]">Description: </span>
                    <span className="text-[#1C1917]">{ms.description}</span>
                  </div>
                  <div>
                    <span className="text-[#6A6D78]">Unlock: </span>
                    <span className="text-[#1C1917]">
                      {(ms.unlockBps / 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6A6D78]">Deadline: </span>
                    <span className="text-[#1C1917]">
                      {ms.deadline ? formatDate(ms.deadline.getTime() / 1000) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6A6D78]">Submitted: </span>
                    <span className="text-[#1C1917]">
                      {ms.submittedAt
                        ? formatDate(ms.submittedAt.getTime() / 1000)
                        : "—"}
                    </span>
                  </div>
                  {ms.deliverable && (
                    <div className="col-span-2">
                      <span className="text-[#6A6D78]">Deliverable: </span>
                      <span className="font-mono text-[#1C1917]">
                        {ms.deliverable}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Admin Actions */}
        <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3]">
          <h3 className="text-sm font-medium text-[#1C1917] mb-4">
            Permissionless Operations
          </h3>
          <p className="text-xs text-[#6A6D78] mb-4">
            {ready
              ? "These actions can be triggered by anyone. They call permissionless on-chain instructions."
              : "Connect your wallet to execute actions."}
          </p>

          {ready && (() => {
            const hasPassedMilestone = expt.milestones.some(
              (ms) => ms.status === MilestoneStatus.Passed
            );
            const isPresaleActive = expt.status === ExptStatus.PresaleActive;
            const isActive = expt.status === ExptStatus.Active;
            const isFinalized = isActive || expt.status === ExptStatus.Completed;

            return (
            <div className="space-y-4">
              {/* State overview */}
              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${
                  isFinalized ? "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/20" : "bg-[#F4F3EE] text-[#6A6D78] border-[#DEDEE3]"
                }`}>
                  {isPresaleActive ? "Presale Active" : isFinalized ? "Presale Finalized ✓" : expt.statusLabel}
                </span>
                <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${
                  expt.presaleFundsWithdrawn ? "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/20" : "bg-[#F4F3EE] text-[#6A6D78] border-[#DEDEE3]"
                }`}>
                  {expt.presaleFundsWithdrawn ? "Funds Withdrawn ✓" : "Funds Not Withdrawn"}
                </span>
                <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${
                  expt.poolLaunched ? "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/20" : "bg-[#F4F3EE] text-[#6A6D78] border-[#DEDEE3]"
                }`}>
                  {expt.poolLaunched ? "Pool Launched ✓" : "Pool Not Launched"}
                </span>
                <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border ${
                  hasPassedMilestone ? "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/20" : "bg-[#F4F3EE] text-[#6A6D78] border-[#DEDEE3]"
                }`}>
                  {hasPassedMilestone ? "Milestone Passed ✓" : "No Milestones Passed"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Finalize Presale */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs border-[#DEDEE3]"
                  disabled={!!actionLoading || isFinalized}
                  title={isFinalized ? "Presale already finalized" : "Finalize the presale period"}
                  onClick={() =>
                    runAction("Finalize Presale", async () => {
                      const tx = new Transaction();
                      const ix = await client.finalizePresale(
                        publicKey!,
                        new PublicKey(address),
                        expt.presale
                      );
                      tx.add(ix);
                      return { tx };
                    })
                  }
                >
                  {actionLoading === "Finalize Presale" ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  {isFinalized ? "Finalized ✓" : "Finalize Presale"}
                </Button>

                {/* Withdraw Presale Funds */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs border-[#DEDEE3]"
                  disabled={!!actionLoading || !isFinalized || expt.presaleFundsWithdrawn}
                  title={
                    expt.presaleFundsWithdrawn
                      ? "Funds already withdrawn"
                      : !isFinalized
                        ? "Finalize presale first"
                        : "Withdraw presale funds to treasury"
                  }
                  onClick={() =>
                    runAction("Withdraw Presale Funds", async () => {
                      const tx = new Transaction();
                      const [quoteVault] = deriveQuoteVault(expt.presale);
                      const treasuryPda = client.deriveTreasuryPda(
                        new PublicKey(address)
                      )[0];
                      const treasuryQuoteToken =
                        await getAssociatedTokenAddress(
                          SPL_NATIVE_MINT,
                          treasuryPda,
                          true
                        );
                      const ix = await client.withdrawPresaleFunds(
                        publicKey!,
                        new PublicKey(address),
                        expt.presale,
                        treasuryQuoteToken,
                        quoteVault,
                        SPL_NATIVE_MINT,
                        TOKEN_PROGRAM_ID
                      );
                      tx.add(ix);
                      return { tx };
                    })
                  }
                >
                  {actionLoading === "Withdraw Presale Funds" ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  {expt.presaleFundsWithdrawn ? "Withdrawn ✓" : "Withdraw Presale Funds"}
                </Button>

                {/* Unwrap SOL */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs border-[#DEDEE3]"
                  disabled={!!actionLoading}
                  title="Unwrap WSOL in treasury to native SOL"
                  onClick={() =>
                    runAction("Unwrap SOL", async () => {
                      const tx = new Transaction();
                      const treasuryPda = client.deriveTreasuryPda(
                        new PublicKey(address)
                      )[0];
                      const wsolAta = await getAssociatedTokenAddress(
                        SPL_NATIVE_MINT,
                        treasuryPda,
                        true
                      );
                      const ix = await client.unwrapTreasuryWsol(
                        publicKey!,
                        new PublicKey(address),
                        wsolAta
                      );
                      tx.add(ix);
                      return { tx };
                    })
                  }
                >
                  {actionLoading === "Unwrap SOL" ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  Unwrap SOL
                </Button>

                {/* Launch Pool */}
                <Button
                  variant="outline"
                  size="sm"
                  className={`rounded-lg text-xs ${
                    expt.poolLaunched
                      ? "border-[#2D6A4F]/30 text-[#2D6A4F]"
                      : "border-[#E09F3E]/30 text-[#E09F3E] hover:bg-[#E09F3E]/10"
                  }`}
                  disabled={!!actionLoading || expt.poolLaunched}
                  title={expt.poolLaunched ? "Pool already launched" : "Launch the DAMM v2 pool"}
                  onClick={() =>
                    runAction("Launch Pool", async () => {
                      const BN = (await import("bn.js")).default;
                      const positionNftMintKp = Keypair.generate();
                      const tokenAMint = expt.mint;
                      const tokenBMint = SPL_NATIVE_MINT;
                      const [poolPda] = deriveDammPoolPda(tokenAMint, tokenBMint);
                      const [positionPda] = deriveDammPositionPda(positionNftMintKp.publicKey);
                      const [positionNftAccountPda] = deriveDammPositionNftAccount(positionNftMintKp.publicKey);
                      const [tokenAVault] = deriveDammTokenVault(tokenAMint, poolPda);
                      const [tokenBVault] = deriveDammTokenVault(tokenBMint, poolPda);
                      const treasuryPda = client.deriveTreasuryPda(new PublicKey(address))[0];
                      const treasuryTokenA = await getAssociatedTokenAddress(tokenAMint, treasuryPda, true);
                      const treasuryTokenB = await getAssociatedTokenAddress(tokenBMint, treasuryPda, true);
                      const [eventAuthority] = PublicKey.findProgramAddressSync(
                        [Buffer.from("__event_authority")],
                        DAMM_V2_PROGRAM_ID
                      );

                      // Pool params (sqrtPrice, liquidity, etc.) are computed on-chain
                      const activationPoint = new BN(Math.floor(Date.now() / 1000) + 60);

                      const tx = new Transaction();
                      const ix = await client.launchPool(
                        publicKey!,
                        new PublicKey(address),
                        { activationPoint },
                        {
                          positionNftMint: positionNftMintKp.publicKey,
                          dammPoolAuthority: DAMM_POOL_AUTHORITY,
                          dammPool: poolPda,
                          dammPosition: positionPda,
                          positionNftAccount: positionNftAccountPda,
                          tokenAMint,
                          tokenBMint,
                          tokenAVault,
                          tokenBVault,
                          treasuryTokenA,
                          treasuryTokenB,
                          tokenAProgram: TOKEN_PROGRAM_ID,
                          tokenBProgram: TOKEN_PROGRAM_ID,
                          token2022Program: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
                          dammV2Program: DAMM_V2_PROGRAM_ID,
                          eventAuthority,
                        }
                      );
                      tx.add(ix);
                      return { tx, signers: [positionNftMintKp] };
                    })
                  }
                >
                  {actionLoading === "Launch Pool" ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  {expt.poolLaunched ? "Pool Launched ✓" : "Launch Pool"}
                </Button>

                {/* Claim Trading Fees */}
                {expt.poolLaunched && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs border-[#DEDEE3]"
                    disabled={!!actionLoading || !hasPassedMilestone}
                    title={
                      !hasPassedMilestone
                        ? "Requires at least 1 milestone passed"
                        : "Claim accrued trading fees to treasury"
                    }
                    onClick={() =>
                      runAction("Claim Trading Fees", async () => {
                        const tokenAMint = expt.mint;
                        const tokenBMint = SPL_NATIVE_MINT;
                        const dammPool = expt.dammPool;
                        const [positionNftAccountPda] = deriveDammPositionNftAccount(expt.positionNftMint);
                        const [tokenAVault] = deriveDammTokenVault(tokenAMint, dammPool);
                        const [tokenBVault] = deriveDammTokenVault(tokenBMint, dammPool);
                        const [dammPosition] = deriveDammPositionPda(expt.positionNftMint);
                        const treasuryPda = client.deriveTreasuryPda(new PublicKey(address))[0];
                        const treasuryTokenA = await getAssociatedTokenAddress(tokenAMint, treasuryPda, true);
                        const treasuryTokenB = await getAssociatedTokenAddress(tokenBMint, treasuryPda, true);
                        const [eventAuthority] = PublicKey.findProgramAddressSync(
                          [Buffer.from("__event_authority")],
                          DAMM_V2_PROGRAM_ID
                        );
                        const tx = new Transaction();
                        const ix = await client.claimTradingFees(
                          publicKey!,
                          new PublicKey(address),
                          {
                            dammPoolAuthority: DAMM_POOL_AUTHORITY,
                            dammPool,
                            dammPosition,
                            positionNftAccount: positionNftAccountPda,
                            tokenAVault,
                            tokenBVault,
                            treasuryTokenA,
                            treasuryTokenB,
                            tokenAMint,
                            tokenBMint,
                            tokenAProgram: TOKEN_PROGRAM_ID,
                            tokenBProgram: TOKEN_PROGRAM_ID,
                            dammV2Program: DAMM_V2_PROGRAM_ID,
                            eventAuthority,
                          }
                        );
                        tx.add(ix);
                        return { tx };
                      })
                    }
                  >
                    {actionLoading === "Claim Trading Fees" ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    Claim Trading Fees
                    {!hasPassedMilestone && (
                      <span className="ml-1 text-[9px] text-[#9B2226]">(needs milestone)</span>
                    )}
                  </Button>
                )}

                {/* Swap Token */}
                {expt.poolLaunched && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs border-[#457B9D]/30 text-[#457B9D] hover:bg-[#457B9D]/10"
                    disabled={!!actionLoading}
                    onClick={() => {
                      setSwapOpen(true);
                      setSwapResult(null);
                      setSwapAmount("");
                      fetchSwapBalances();
                    }}
                  >
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    Swap
                  </Button>
                )}
              </div>
              {/* Submit Milestone (builder only) */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-[#6A6D78] font-medium">
                  Submit Proof{publicKey && expt.builder && !publicKey.equals(expt.builder) && (
                    <span className="ml-1 text-[#9B2226]">(requires builder wallet)</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Index"
                    value={submitIdx}
                    onChange={(e) => setSubmitIdx(e.target.value)}
                    className="w-20 h-8 text-xs rounded-lg border-[#DEDEE3]"
                    disabled={!!actionLoading}
                  />
                  <Input
                    type="text"
                    placeholder="Deliverable URL"
                    value={submitDeliverable}
                    onChange={(e) => setSubmitDeliverable(e.target.value)}
                    className="flex-1 h-8 text-xs rounded-lg border-[#DEDEE3]"
                    disabled={!!actionLoading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs border-[#457B9D]/30 text-[#457B9D] hover:bg-[#457B9D]/10"
                    disabled={
                      !!actionLoading ||
                      submitIdx === "" ||
                      !submitDeliverable.trim() ||
                      (!!publicKey && !!expt.builder && !publicKey.equals(expt.builder))
                    }
                    title={
                      publicKey && expt.builder && !publicKey.equals(expt.builder)
                        ? "Only the builder can submit proof"
                        : "Submit deliverable proof for this milestone"
                    }
                    onClick={() =>
                      runAction("Submit Milestone", async () => {
                        const tx = new Transaction();
                        const ix = await client.submitMilestone(
                          expt.builder,
                          expt.mint,
                          {
                            milestoneIndex: parseInt(submitIdx),
                            deliverable: submitDeliverable.trim(),
                          }
                        );
                        tx.add(ix);
                        return { tx };
                      })
                    }
                  >
                    {actionLoading === "Submit Milestone" ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    Submit Proof
                  </Button>
                </div>
              </div>

              {/* Resolve Milestone */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-[#6A6D78] font-medium">Resolve Milestone</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Milestone index"
                    value={resolveIdx}
                    onChange={(e) => setResolveIdx(e.target.value)}
                    className="w-36 h-8 text-xs rounded-lg border-[#DEDEE3]"
                    disabled={!!actionLoading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs border-[#DEDEE3]"
                    disabled={!!actionLoading || resolveIdx === ""}
                    onClick={() =>
                      runAction("Resolve Milestone", async () => {
                        const tx = new Transaction();
                        const ix = await client.resolveMilestone(
                          publicKey!,
                          new PublicKey(address),
                          parseInt(resolveIdx)
                        );
                        tx.add(ix);
                        return { tx };
                      })
                    }
                  >
                    {actionLoading === "Resolve Milestone" ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    Resolve Milestone
                  </Button>
                </div>
              </div>

              {/* Action result */}
              {actionResult && (
                <div
                  className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                    actionResult.success
                      ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                      : "bg-[#9B2226]/10 text-[#9B2226]"
                  }`}
                >
                  {actionResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="text-xs">{actionResult.message}</span>
                  {actionResult.sig && (
                    <a
                      href={solscanTxUrl(actionResult.sig)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-xs underline font-medium"
                    >
                      {actionResult.sig.slice(0, 8)}…
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
            );
          })()}

        </div>

        {/* Solscan Link */}
        <div className="text-center">
          <a
            href={`https://solscan.io/account/${address}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors"
          >
            View on Solscan <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* ── Swap Modal ── */}
      {expt && (
        <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg">Swap</DialogTitle>
              <DialogDescription className="text-xs text-[#6A6D78]">
                Trade on the DAMM v2 pool for this experiment.
              </DialogDescription>
            </DialogHeader>

            {/* Balances */}
            {swapBalances && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#F4F3EE] rounded-lg p-3">
                  <p className="text-[10px] text-[#6A6D78] mb-0.5">SOL Balance</p>
                  <p className="text-sm font-semibold text-[#1C1917] tabular-nums">
                    {swapBalances.sol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL
                  </p>
                </div>
                <div className="bg-[#F4F3EE] rounded-lg p-3">
                  <p className="text-[10px] text-[#6A6D78] mb-0.5">Token Balance</p>
                  <p className="text-sm font-semibold text-[#1C1917] tabular-nums">
                    {swapBalances.token.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                </div>
              </div>
            )}

            {/* Buy / Sell toggle */}
            <div className="flex gap-1 bg-[#F4F3EE] rounded-lg p-1">
              {(["buy", "sell"] as const).map((dir) => (
                <button
                  key={dir}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                    swapDirection === dir
                      ? dir === "buy"
                        ? "bg-[#2D6A4F] text-white"
                        : "bg-[#D32F2F] text-white"
                      : "text-[#6A6D78] hover:text-[#1C1917]"
                  }`}
                  onClick={() => {
                    setSwapDirection(dir);
                    setSwapResult(null);
                    setSwapAmount("");
                  }}
                >
                  {dir === "buy" ? "Buy Token" : "Sell Token"}
                </button>
              ))}
            </div>

            {/* Amount input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#6A6D78]">
                  {swapDirection === "buy" ? "Amount (SOL)" : "Amount (Tokens)"}
                </label>
                {swapBalances && (
                  <button
                    type="button"
                    className="text-[10px] text-[#457B9D] hover:text-[#457B9D]/80 font-medium"
                    onClick={() => {
                      if (swapDirection === "buy") {
                        // Use max SOL minus ~0.01 SOL for fees
                        const max = Math.max(0, swapBalances.sol - 0.01);
                        setSwapAmount(max.toFixed(4));
                      } else {
                        setSwapAmount(swapBalances.token.toString());
                      }
                    }}
                  >
                    MAX
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder={swapDirection === "buy" ? "e.g. 0.1" : "e.g. 1000"}
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                disabled={swapping}
                className="bg-white border-[#DEDEE3] rounded-lg h-10"
              />
              <p className="text-[10px] text-[#6A6D78]">
                {swapDirection === "buy"
                  ? "SOL → Experiment Token (ExactIn, min output = 0)"
                  : "Experiment Token → SOL (ExactIn, min output = 0)"}
              </p>
            </div>

            {/* Execute swap */}
            <Button
              disabled={swapping || !swapAmount || parseFloat(swapAmount) <= 0 || !ready}
              className={`w-full rounded-lg h-10 text-white ${
                swapDirection === "buy"
                  ? "bg-[#2D6A4F] hover:bg-[#2D6A4F]/90"
                  : "bg-[#D32F2F] hover:bg-[#D32F2F]/90"
              }`}
              onClick={async () => {
                if (!publicKey || !expt || !connection) return;
                setSwapping(true);
                setSwapResult(null);

                try {
                  const tokenAMint = expt.mint;
                  const tokenBMint = SPL_NATIVE_MINT;
                  const dammPool = expt.dammPool;
                  const [tokenAVault] = deriveDammTokenVault(tokenAMint, dammPool);
                  const [tokenBVault] = deriveDammTokenVault(tokenBMint, dammPool);
                  const [eventAuthority] = PublicKey.findProgramAddressSync(
                    [Buffer.from("__event_authority")],
                    DAMM_V2_PROGRAM_ID
                  );

                  const tx = new Transaction();

                  // Derive user ATAs
                  const userTokenA = await getAssociatedTokenAddress(tokenAMint, publicKey);
                  const userTokenB = await getAssociatedTokenAddress(tokenBMint, publicKey);

                  // Ensure user token A ATA exists
                  const tokenAInfo = await connection.getAccountInfo(userTokenA);
                  if (!tokenAInfo) {
                    tx.add(
                      createAssociatedTokenAccountInstruction(
                        publicKey, userTokenA, publicKey, tokenAMint
                      )
                    );
                  }

                  // Ensure user WSOL ATA exists
                  const tokenBInfo = await connection.getAccountInfo(userTokenB);
                  if (!tokenBInfo) {
                    tx.add(
                      createAssociatedTokenAccountInstruction(
                        publicKey, userTokenB, publicKey, tokenBMint
                      )
                    );
                  }

                  let inputAccount: PublicKey;
                  let outputAccount: PublicKey;
                  let amountInLamports: bigint;

                  if (swapDirection === "buy") {
                    // SOL → Token: wrap SOL to WSOL first
                    const solLamports = Math.floor(parseFloat(swapAmount) * LAMPORTS_PER_SOL);
                    tx.add(
                      SystemProgram.transfer({
                        fromPubkey: publicKey,
                        toPubkey: userTokenB,
                        lamports: solLamports,
                      }),
                      createSyncNativeInstruction(userTokenB)
                    );
                    inputAccount = userTokenB;
                    outputAccount = userTokenA;
                    amountInLamports = BigInt(solLamports);
                  } else {
                    // Token → SOL
                    // Amount is in token units (with 9 decimals)
                    const tokenLamports = Math.floor(parseFloat(swapAmount) * 1e9);
                    inputAccount = userTokenA;
                    outputAccount = userTokenB;
                    amountInLamports = BigInt(tokenLamports);
                  }

                  // Build swap2 instruction (same as E2E test)
                  const data = Buffer.alloc(8 + 8 + 8 + 1);
                  SWAP2_DISCRIMINATOR.copy(data, 0);
                  data.writeBigUInt64LE(amountInLamports, 8);  // amount_0 (input)
                  data.writeBigUInt64LE(BigInt(0), 16);         // amount_1 (min output)
                  data.writeUInt8(0, 24);                       // swap_mode = ExactIn

                  const swapIx = new TransactionInstruction({
                    programId: DAMM_V2_PROGRAM_ID,
                    keys: [
                      { pubkey: DAMM_POOL_AUTHORITY, isSigner: false, isWritable: false },
                      { pubkey: dammPool, isSigner: false, isWritable: true },
                      { pubkey: inputAccount, isSigner: false, isWritable: true },
                      { pubkey: outputAccount, isSigner: false, isWritable: true },
                      { pubkey: tokenAVault, isSigner: false, isWritable: true },
                      { pubkey: tokenBVault, isSigner: false, isWritable: true },
                      { pubkey: tokenAMint, isSigner: false, isWritable: false },
                      { pubkey: tokenBMint, isSigner: false, isWritable: false },
                      { pubkey: publicKey, isSigner: true, isWritable: false },
                      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                      { pubkey: DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: true },  // referral (no referral)
                      { pubkey: eventAuthority, isSigner: false, isWritable: false },
                      { pubkey: DAMM_V2_PROGRAM_ID, isSigner: false, isWritable: false }, // program self-ref
                    ],
                    data,
                  });
                  tx.add(swapIx);

                  const sig = await signAndSend(tx);
                  setSwapResult({
                    success: true,
                    message: `${swapDirection === "buy" ? "Bought" : "Sold"} successfully`,
                    sig,
                  });
                  setSwapAmount("");
                  fetchSwapBalances();
                } catch (err: any) {
                  console.error("Swap error:", err);
                  setSwapResult({
                    success: false,
                    message: err?.message || "Swap failed",
                  });
                } finally {
                  setSwapping(false);
                }
              }}
            >
              {swapping ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Swapping...
                </>
              ) : (
                swapDirection === "buy" ? "Buy Token" : "Sell Token"
              )}
            </Button>

            {/* Swap result */}
            {swapResult && (
              <div
                className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                  swapResult.success
                    ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                    : "bg-[#9B2226]/10 text-[#9B2226]"
                }`}
              >
                {swapResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="text-xs">{swapResult.message}</span>
                {swapResult.sig && (
                  <a
                    href={solscanTxUrl(swapResult.sig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs underline font-medium"
                  >
                    {swapResult.sig.slice(0, 8)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
