"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Clock,
  Coins,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useState, useEffect, use, useCallback, useRef } from "react";
import { useExptClient } from "@/hooks/use-expt-client";
import { useSolanaSigner } from "@/hooks/use-solana-signer";
import {
  type ParsedExptConfig,
  type ParsedPresaleState,
  ExptStatus,
  exptStatusLabel,
  deriveEscrowPda,
  deriveQuoteVault,
  NATIVE_MINT,
  PRESALE_PROGRAM_ID,
} from "@expt/sdk";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  NATIVE_MINT as SPL_NATIVE_MINT,
} from "@solana/spl-token";
import BN from "bn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatSOL(lamports: BN | number): string {
  const val =
    typeof lamports === "number" ? lamports : Number(lamports.toString());
  return (val / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

type PresalePhase = "not_started" | "active" | "ended";

function getPresalePhase(presale: ParsedPresaleState): PresalePhase {
  const now = Math.floor(Date.now() / 1000);
  if (now < presale.presaleStartTime) return "not_started";
  if (now > presale.presaleEndTime) return "ended";
  return "active";
}

const PHASE_LABELS: Record<PresalePhase, string> = {
  not_started: "Starts in",
  active: "Ends in",
  ended: "Ended",
};

const PHASE_COLORS: Record<PresalePhase, string> = {
  not_started: "bg-[#457B9D]/10 text-[#457B9D] border-[#457B9D]/20",
  active: "bg-[#2D6A4F]/10 text-[#2D6A4F] border-[#2D6A4F]/20",
  ended: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
};

// ---------------------------------------------------------------------------
// Countdown Hook
// ---------------------------------------------------------------------------

function useCountdown(targetTimestamp: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, targetTimestamp - now);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return { days, hours, minutes, seconds, isExpired: diff === 0 };
}

// ---------------------------------------------------------------------------
// Countdown Display
// ---------------------------------------------------------------------------

function CountdownTimer({
  label,
  targetTimestamp,
}: {
  label: string;
  targetTimestamp: number;
}) {
  const { days, hours, minutes, seconds, isExpired } =
    useCountdown(targetTimestamp);

  if (isExpired) {
    return (
      <div className="text-center">
        <p className="text-xs text-[#6A6D78] mb-2">{label}</p>
        <p className="text-lg font-semibold text-[#6A6D78]">—</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs text-[#6A6D78] mb-3">{label}</p>
      <div className="flex items-center justify-center gap-2">
        {[
          { value: days, label: "d" },
          { value: hours, label: "h" },
          { value: minutes, label: "m" },
          { value: seconds, label: "s" },
        ].map((unit) => (
          <div key={unit.label} className="flex items-baseline gap-0.5">
            <span className="text-2xl font-semibold text-[#1C1917] tabular-nums w-8 text-center">
              {String(unit.value).padStart(2, "0")}
            </span>
            <span className="text-xs text-[#6A6D78]">{unit.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PresalePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const client = useExptClient();
  const { publicKey, connection, signAndSend, ready } = useSolanaSigner();

  const [expt, setExpt] = useState<ParsedExptConfig | null>(null);
  const [presale, setPresale] = useState<ParsedPresaleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [committing, setCommitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txResult, setTxResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Polling ref for auto-refresh
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch experiment + presale data
  const fetchData = useCallback(async () => {
    try {
      const pubkey = new PublicKey(address);
      const config = await client.fetchExptConfigByAddress(pubkey);
      if (!config) {
        setError("Experiment not found");
        return;
      }
      setExpt(config);

      const presaleState = await client.fetchPresaleState(config.presale);
      if (presaleState) {
        setPresale(presaleState);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load presale data"
      );
    } finally {
      setLoading(false);
    }
  }, [address, client]);

  useEffect(() => {
    fetchData();
    // Poll every 15s to keep presale data fresh
    pollingRef.current = setInterval(fetchData, 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchData]);

  // Commit SOL handler
  const handleCommit = async () => {
    if (!publicKey || !expt || !presale || !amount) return;
    setCommitting(true);
    setTxResult(null);

    try {
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
      if (lamports <= 0) throw new Error("Amount must be greater than 0");

      const tx = new Transaction();

      // 1. Create WSOL ATA if needed
      const wsolAta = await getAssociatedTokenAddress(
        SPL_NATIVE_MINT,
        publicKey
      );
      const ataInfo = await connection.getAccountInfo(wsolAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            wsolAta,
            publicKey,
            SPL_NATIVE_MINT
          )
        );
      }

      // 2. Transfer SOL to WSOL ATA then sync
      tx.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: wsolAta,
          lamports,
        }),
        createSyncNativeInstruction(wsolAta)
      );

      // 3. Create escrow if needed
      const [escrowPda] = deriveEscrowPda(expt.presale, publicKey, 0);
      const escrowInfo = await connection.getAccountInfo(escrowPda);
      if (!escrowInfo) {
        tx.add(
          client.buildCreateEscrowIx({
            presale: expt.presale,
            owner: publicKey,
            payer: publicKey,
          })
        );
      }

      // 4. Deposit
      const [quoteVault] = deriveQuoteVault(expt.presale);
      tx.add(
        client.buildDepositIx({
          presale: expt.presale,
          quoteTokenVault: quoteVault,
          quoteMint: presale.quoteMint,
          escrow: escrowPda,
          payerQuoteToken: wsolAta,
          payer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          maxAmount: new BN(lamports),
        })
      );

      const sig = await signAndSend(tx);
      setTxResult({
        success: true,
        message: `Committed ${amount} SOL — ${sig.slice(0, 8)}...`,
      });
      setAmount("");
      // Refresh data
      fetchData();
    } catch (err: any) {
      console.error("Commit error:", err);
      setTxResult({
        success: false,
        message: err?.message || "Transaction failed",
      });
    } finally {
      setCommitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="max-w-[800px] mx-auto px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-[#DEDEE3] rounded w-24" />
          <div className="h-8 bg-[#DEDEE3] rounded w-64" />
          <div className="h-40 bg-[#DEDEE3] rounded-3xl" />
          <div className="h-40 bg-[#DEDEE3] rounded-3xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !expt) {
    return (
      <div className="max-w-[800px] mx-auto px-6 py-8">
        <Link
          href={`/experiment/${address}`}
          className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Experiment
        </Link>
        <div className="text-center py-20">
          <p className="text-sm text-[#6A6D78]">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  // Presale not found
  if (!presale) {
    return (
      <div className="max-w-[800px] mx-auto px-6 py-8">
        <Link
          href={`/experiment/${address}`}
          className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Experiment
        </Link>
        <div className="text-center py-20">
          <p className="text-sm text-[#6A6D78]">
            Presale account not found on-chain.
          </p>
        </div>
      </div>
    );
  }

  const phase = getPresalePhase(presale);
  const targetTimestamp =
    phase === "not_started"
      ? presale.presaleStartTime
      : presale.presaleEndTime;

  const raisedLamports = Number(presale.totalDeposit.toString());
  const maxCapLamports = Number(presale.presaleMaximumCap.toString());
  const minCapLamports = Number(presale.presaleMinimumCap.toString());
  const progressPercent =
    maxCapLamports > 0
      ? Math.min(100, (raisedLamports / maxCapLamports) * 100)
      : 0;
  const minCapPercent =
    maxCapLamports > 0 ? (minCapLamports / maxCapLamports) * 100 : 0;
  const isMinCapMet = raisedLamports >= minCapLamports;

  return (
    <div className="max-w-[800px] mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href={`/experiment/${address}`}
        className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Experiment
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
            {expt.name}
          </h1>
          <Link
            href={`/profile/${expt.builder.toBase58()}`}
            className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#6A6D78] hover:text-[#1C1917] transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            <span>by</span>
            <span className="font-mono">
              {truncateAddress(expt.builder.toBase58())}
            </span>
          </Link>
        </div>
        <Badge
          variant="outline"
          className={`text-xs w-fit ${PHASE_COLORS[phase]}`}
        >
          {phase === "not_started"
            ? "Not Started"
            : phase === "active"
            ? "Active"
            : isMinCapMet
            ? "Succeeded"
            : "Failed"}
        </Badge>
      </div>

      {/* Countdown */}
      <div className="bg-white rounded-3xl p-8 border border-[#DEDEE3] mb-6">
        <CountdownTimer
          label={PHASE_LABELS[phase]}
          targetTimestamp={targetTimestamp}
        />
      </div>

      {/* Progress */}
      <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3] mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-[#6A6D78]" />
            <span className="text-xs font-medium text-[#6A6D78]">
              Raised
            </span>
          </div>
          <span className="text-sm font-semibold text-[#1C1917]">
            {formatSOL(presale.totalDeposit)} /{" "}
            {formatSOL(presale.presaleMaximumCap)} SOL
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative w-full h-3 bg-[#DEDEE3] rounded-full overflow-hidden mb-2">
          <div
            className="absolute top-0 left-0 h-full bg-[#140E1C] rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Min cap marker */}
          {minCapPercent > 0 && minCapPercent < 100 && (
            <div
              className="absolute top-0 h-full w-0.5 bg-[#E09F3E]"
              style={{ left: `${minCapPercent}%` }}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-[#6A6D78]">
          <span>
            Min cap: {formatSOL(presale.presaleMinimumCap)} SOL{" "}
            {isMinCapMet ? (
              <span className="text-[#2D6A4F]">✓ met</span>
            ) : (
              <span className="text-[#E09F3E]">not met</span>
            )}
          </span>
          <span>{progressPercent.toFixed(1)}%</span>
        </div>
      </div>

      {/* Parameters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          {
            label: "Start",
            value: new Date(
              presale.presaleStartTime * 1000
            ).toLocaleDateString(),
          },
          {
            label: "End",
            value: new Date(
              presale.presaleEndTime * 1000
            ).toLocaleDateString(),
          },
          {
            label: "Token Supply",
            value: formatSOL(presale.presaleSupply),
          },
          {
            label: "Status",
            value: exptStatusLabel(expt.status),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-2xl p-4 border border-[#DEDEE3]"
          >
            <p className="text-xs text-[#6A6D78] mb-1">{item.label}</p>
            <p className="text-sm font-medium text-[#1C1917]">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Commit Form */}
      {phase === "active" && (
        <div className="bg-[#F4F3EE] rounded-3xl p-8">
          <h3 className="text-sm font-medium text-[#1C1917] mb-4">
            Commit SOL
          </h3>

          {!ready ? (
            <p className="text-sm text-[#6A6D78]">
              Connect your wallet to commit SOL.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount in SOL"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={committing}
                    className="bg-white border-[#DEDEE3] rounded-lg h-10"
                  />
                </div>
                <Button
                  onClick={handleCommit}
                  disabled={committing || !amount || parseFloat(amount) <= 0}
                  className="bg-[#140E1C] text-white hover:bg-[#140E1C]/90 rounded-lg h-10 px-6"
                >
                  {committing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Committing...
                    </>
                  ) : (
                    "Commit"
                  )}
                </Button>
              </div>

              {/* Transaction result */}
              {txResult && (
                <div
                  className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                    txResult.success
                      ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                      : "bg-[#9B2226]/10 text-[#9B2226]"
                  }`}
                >
                  {txResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{txResult.message}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ended state */}
      {phase === "ended" && (
        <div className="bg-[#F4F3EE] rounded-3xl p-8">
          {isMinCapMet ? (
            /* Presale succeeded */
            <div className="text-center">
              <CheckCircle2 className="h-6 w-6 text-[#2D6A4F] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#1C1917]">
                Presale succeeded!
              </p>
              <p className="text-xs text-[#6A6D78] mt-1">
                Minimum cap was met — experiment is now active.
              </p>
            </div>
          ) : (
            /* Presale failed — withdraw */
            <div>
              <div className="text-center mb-6">
                <Clock className="h-6 w-6 text-[#6A6D78] mx-auto mb-2" />
                <p className="text-sm font-medium text-[#1C1917]">
                  Presale failed
                </p>
                <p className="text-xs text-[#6A6D78] mt-1">
                  Minimum cap was not met. You can withdraw your committed SOL.
                </p>
              </div>

              {!ready ? (
                <p className="text-sm text-[#6A6D78] text-center">
                  Connect your wallet to withdraw.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount in SOL"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        disabled={withdrawing}
                        className="bg-white border-[#DEDEE3] rounded-lg h-10"
                      />
                    </div>
                    <Button
                      onClick={async () => {
                        if (!publicKey || !expt || !presale || !withdrawAmount)
                          return;
                        setWithdrawing(true);
                        setTxResult(null);

                        try {
                          const lamports = Math.floor(
                            parseFloat(withdrawAmount) * LAMPORTS_PER_SOL
                          );
                          if (lamports <= 0)
                            throw new Error("Amount must be greater than 0");

                          const tx = new Transaction();

                          // WSOL ATA
                          const wsolAta = await getAssociatedTokenAddress(
                            SPL_NATIVE_MINT,
                            publicKey
                          );
                          const ataInfo =
                            await connection.getAccountInfo(wsolAta);
                          if (!ataInfo) {
                            tx.add(
                              createAssociatedTokenAccountInstruction(
                                publicKey,
                                wsolAta,
                                publicKey,
                                SPL_NATIVE_MINT
                              )
                            );
                          }

                          const [escrowPda] = deriveEscrowPda(
                            expt.presale,
                            publicKey,
                            0
                          );
                          const [quoteVault] = deriveQuoteVault(expt.presale);

                          tx.add(
                            client.buildWithdrawIx({
                              presale: expt.presale,
                              quoteTokenVault: quoteVault,
                              quoteMint: presale.quoteMint,
                              escrow: escrowPda,
                              payerQuoteToken: wsolAta,
                              payer: publicKey,
                              tokenProgram: TOKEN_PROGRAM_ID,
                              maxAmount: new BN(lamports),
                            })
                          );

                          const sig = await signAndSend(tx);
                          setTxResult({
                            success: true,
                            message: `Withdrew ${withdrawAmount} SOL — ${sig.slice(0, 8)}...`,
                          });
                          setWithdrawAmount("");
                          fetchData();
                        } catch (err: any) {
                          console.error("Withdraw error:", err);
                          setTxResult({
                            success: false,
                            message: err?.message || "Withdraw failed",
                          });
                        } finally {
                          setWithdrawing(false);
                        }
                      }}
                      disabled={
                        withdrawing ||
                        !withdrawAmount ||
                        parseFloat(withdrawAmount) <= 0
                      }
                      className="bg-[#D32F2F] text-white hover:bg-[#D32F2F]/90 rounded-lg h-10 px-6"
                    >
                      {withdrawing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Withdrawing...
                        </>
                      ) : (
                        "Withdraw"
                      )}
                    </Button>
                  </div>

                  {/* Transaction result */}
                  {txResult && (
                    <div
                      className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                        txResult.success
                          ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                          : "bg-[#9B2226]/10 text-[#9B2226]"
                      }`}
                    >
                      {txResult.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0" />
                      )}
                      <span>{txResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Not started state */}
      {phase === "not_started" && (
        <div className="bg-[#F4F3EE] rounded-3xl p-8 text-center">
          <Clock className="h-6 w-6 text-[#6A6D78] mx-auto mb-2" />
          <p className="text-sm font-medium text-[#1C1917]">
            Presale hasn&apos;t started yet.
          </p>
          <p className="text-xs text-[#6A6D78] mt-1">
            Come back when the countdown reaches zero.
          </p>
        </div>
      )}
    </div>
  );
}
