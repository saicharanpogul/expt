"use client";

import Link from "next/link";
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
import { ArrowLeft, ExternalLink, Clock, Shield, Coins, User, Copy, Check, Loader2, Wrench, CheckCircle2, XCircle } from "lucide-react";
import { ProofPreview } from "@/components/proof-preview";
import { useState, useEffect, use, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useExptClient } from "@/hooks/use-expt-client";
import { useSolanaSigner } from "@/hooks/use-solana-signer";
import {
  type ParsedExptConfig,
  type ParsedMilestone,
  type ParsedPresaleState,
  MilestoneStatus,
  milestoneStatusLabel,
  exptStatusLabel,
  ExptStatus,
  deriveDammPoolPda,
  deriveDammPositionPda,
  deriveDammPositionNftAccount,
  deriveDammTokenVault,
  deriveQuoteVault,
  DAMM_POOL_AUTHORITY,
  DAMM_V2_PROGRAM_ID,
  NATIVE_MINT as EXPT_NATIVE_MINT,
} from "@expt/sdk";
import { PublicKey, LAMPORTS_PER_SOL, Transaction, Keypair } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  NATIVE_MINT as SPL_NATIVE_MINT,
} from "@solana/spl-token";
import BN from "bn.js";

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
  [ExptStatus.PresaleActive]: "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [ExptStatus.PresaleFailed]: "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [ExptStatus.Active]: "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [ExptStatus.Completed]:
    "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
};

const MS_COLORS: Record<number, string> = {
  [MilestoneStatus.Passed]:
    "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [MilestoneStatus.Submitted]:
    "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [MilestoneStatus.Pending]:
    "bg-[#DEDEE3] text-[#6A6D78] border-[#DEDEE3]",
  [MilestoneStatus.Challenged]:
    "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [MilestoneStatus.Failed]:
    "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
};

const DOT_COLORS: Record<number, string> = {
  [MilestoneStatus.Passed]: "bg-[#140E1C]",
  [MilestoneStatus.Submitted]: "bg-[#E09F3E]",
  [MilestoneStatus.Pending]: "bg-[#DEDEE3]",
  [MilestoneStatus.Challenged]: "bg-[#D32F2F]",
  [MilestoneStatus.Failed]: "bg-[#D32F2F]",
};

type Tab = "overview" | "milestones" | "treasury";

function formatSOL(lamports: BN | number): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(2);
}

function formatDate(date: Date | null): string {
  if (!date || date.getTime() === 0) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/* ── Quick Trade Bar ─────────────────────────────────────────── */
function QuickTradeBar({
  mint,
  symbol,
  poolLaunched,
  dammPool,
}: {
  mint: string;
  symbol?: string;
  poolLaunched: boolean;
  dammPool?: string;
}) {
  const [copied, setCopied] = useState(false);
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const isMainnet = network === "mainnet-beta" || network === "mainnet";

  const copyCA = () => {
    navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const solscanUrl = `https://solscan.io/token/${mint}${isMainnet ? "" : "?cluster=devnet"}`;
  const jupUrl = `https://jup.ag/swap/SOL-${mint}`;
  const meteoraUrl = dammPool
    ? `${isMainnet ? "https://app.meteora.ag" : "https://devnet.meteora.ag"}/dammv2/${dammPool}`
    : null;

  return (
    <div className="bg-[#140E1C] rounded-2xl p-3 space-y-2 mb-6">
      {/* Row 1: ticker + CA + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Ticker badge */}
        {symbol && (
          <span className="h-8 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-[11px] font-semibold tracking-wide inline-flex items-center">
            ${symbol}
          </span>
        )}

        {/* CA copy */}
        <button
          onClick={copyCA}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all text-[11px] font-mono"
        >
          <span className="text-white/40 text-[10px] mr-0.5">CA</span>
          {truncateAddress(mint)}
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>

        <div className="w-px h-5 bg-white/10" />

        {/* Solscan */}
        <a
          href={solscanUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Solscan"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-all text-[11px] font-medium"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://solscan.io/favicon.ico" alt="" className="h-3.5 w-3.5 rounded-sm" />
          Solscan
        </a>

        {/* Jupiter */}
        <a
          href={jupUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Trade on Jupiter"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#C7F284]/15 text-[#C7F284] hover:bg-[#C7F284]/25 transition-all text-[11px] font-medium"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://jup.ag/favicon.ico" alt="" className="h-3.5 w-3.5 rounded-sm" />
          Trade on Jup
        </a>

        {/* Meteora LP — always visible */}
        {meteoraUrl ? (
          <a
            href={meteoraUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="View LP on Meteora"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#E09F3E]/15 text-[#E09F3E] hover:bg-[#E09F3E]/25 transition-all text-[11px] font-medium"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meteora.svg" alt="" className="h-3.5 w-3.5 rounded-sm" />
            Meteora LP
          </a>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/5 text-white/30 text-[11px] font-medium cursor-default"
            title="Pool not launched yet"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/meteora.svg" alt="" className="h-3.5 w-3.5 rounded-sm opacity-30" />
            Meteora LP
          </span>
        )}
      </div>

      {/* Row 2: market metrics */}
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        {poolLaunched ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">Price</span>
              <span className="text-white/50 font-medium text-[10px]">Coming soon</span>
            </div>
            <div className="w-px h-3.5 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">MCap</span>
              <span className="text-white/50 font-medium text-[10px]">Coming soon</span>
            </div>
            <div className="w-px h-3.5 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">Liquidity</span>
              <span className="text-white/50 font-medium text-[10px]">Coming soon</span>
            </div>
            <div className="w-px h-3.5 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-white/40">Pool</span>
              <span className="text-emerald-400 font-medium">Live</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Pool</span>
            <span className="text-amber-400/80 font-medium">Not launched</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const searchParams = useSearchParams();
  const ADMIN_HASH = process.env.NEXT_PUBLIC_ADMIN_ROUTE_HASH || "";
  const isDebug = ADMIN_HASH !== "" && searchParams.get("debug") === ADMIN_HASH;

  const tabParam = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam && ["overview", "milestones", "treasury"].includes(tabParam)
      ? tabParam
      : "overview"
  );

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState({}, "", url.toString());
  };
  const [expt, setExpt] = useState<ParsedExptConfig | null>(null);
  const [presale, setPresale] = useState<ParsedPresaleState | null>(null);
  const [metadata, setMetadata] = useState<{
    name?: string;
    symbol?: string;
    description?: string;
    image?: string;
    properties?: Record<string, any>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = useExptClient();
  const { publicKey, connection, signAndSend, ready } = useSolanaSigner();

  // Admin action state
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

  // Submit proof state
  const [submitProofOpen, setSubmitProofOpen] = useState(false);
  const [submitProofIdx, setSubmitProofIdx] = useState<number | null>(null);
  const [submitProofUrl, setSubmitProofUrl] = useState("");
  const [submitProofLoading, setSubmitProofLoading] = useState(false);
  const [submitProofResult, setSubmitProofResult] = useState<{
    success: boolean;
    message: string;
    sig?: string;
  } | null>(null);

  // Veto state
  const [vetoOpen, setVetoOpen] = useState(false);
  const [vetoIdx, setVetoIdx] = useState<number | null>(null);
  const [vetoDeadline, setVetoDeadline] = useState<Date | null>(null);
  const [vetoAmount, setVetoAmount] = useState("");
  const [vetoLoading, setVetoLoading] = useState(false);
  const [vetoResult, setVetoResult] = useState<{
    success: boolean;
    message: string;
    sig?: string;
  } | null>(null);

  // Treasury balance (actual SOL in the PDA)
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const pubkey = new PublicKey(address);
      const config = await client.fetchExptConfigByAddress(pubkey);
      if (!config) {
        setError("Experiment not found");
        return;
      }
      setExpt(config);
      // Fetch metadata from URI
      if (config.uri) {
        try {
          const res = await fetch(config.uri);
          if (res.ok) {
            const json = await res.json();
            setMetadata(json);
          }
        } catch {
          // metadata fetch failed, non-critical
        }
      }
      // Fetch presale state if in presale phase
      if (
        config.status === ExptStatus.Created ||
        config.status === ExptStatus.PresaleActive
      ) {
        const ps = await client.fetchPresaleState(config.presale);
        if (ps) setPresale(ps);
      }
      // Fetch actual treasury balance
      try {
        const [treasuryPda] = client.deriveTreasuryPda(pubkey);
        const bal = await connection.getBalance(treasuryPda);
        setTreasuryBalance(bal);
      } catch {
        setTreasuryBalance(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch experiment"
      );
    } finally {
      if (!silent) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Loading state
  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-[#DEDEE3] rounded w-24" />
          <div className="h-8 bg-[#DEDEE3] rounded w-64" />
          <div className="h-4 bg-[#DEDEE3] rounded w-48" />
          <div className="h-10 bg-[#DEDEE3] rounded w-80" />
          <div className="h-40 bg-[#DEDEE3] rounded-3xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !expt) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <Link
          href="/browse"
          className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Browse
        </Link>
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#DEDEE3] flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6A6D78"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8" />
            </svg>
          </div>
          <p className="text-sm text-[#6A6D78]">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const passedCount = expt.milestones.filter(
    (m) => m.status === MilestoneStatus.Passed
  ).length;
  const challengeDisplay = (() => {
    const s = Number(expt.challengeWindow);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    const h = s / 3600;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  })();

  return (
    <>
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      {/* Back */}
      <Link
        href="/browse"
        className="inline-flex items-center gap-1 text-xs text-[#6A6D78] hover:text-[#1C1917] transition-colors mb-6"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Browse
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            {/* Token image */}
            {metadata?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={metadata.image}
                alt={expt.name}
                className="w-10 h-10 rounded-xl object-cover border border-[#DEDEE3]"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#140E1C] to-[#E09F3E] flex items-center justify-center text-white font-bold text-sm">
                {expt.name.charAt(0)}
              </div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-[#1C1917]">
              {expt.name}
            </h1>
            <Badge
              variant="outline"
              className={`text-xs ${STATUS_COLORS[expt.status] || ""}`}
            >
              {exptStatusLabel(expt.status)}
            </Badge>
          </div>
          {/* Builder profile */}
          <Link
            href={`/profile/${expt.builder.toBase58()}`}
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-[#6A6D78] hover:text-[#1C1917] transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            <span>by</span>
            <span className="font-mono">{truncateAddress(expt.builder.toBase58())}</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* View Presale button */}
          {(expt.status === ExptStatus.Created ||
            expt.status === ExptStatus.PresaleActive) && (
            <Link href={`/experiment/${address}/presale`}>
              <Button
                variant="default"
                size="sm"
                className="text-xs rounded-lg h-8 bg-[#140E1C] text-white hover:bg-[#140E1C]/90"
              >
                View Presale
              </Button>
            </Link>
          )}

          {/* Progress pill */}
          <div className="flex items-center gap-3 bg-[#F4F3EE] rounded-full px-4 py-2">
            <span className="text-xs text-[#6A6D78]">Progress</span>
            <div className="w-24 h-1.5 bg-[#DEDEE3] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#140E1C] rounded-full"
                style={{
                  width: `${
                    expt.milestoneCount > 0
                      ? (passedCount / expt.milestoneCount) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="text-xs font-medium text-[#1C1917]">
              {passedCount}/{expt.milestoneCount}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions — trader bar */}
      <QuickTradeBar mint={expt.mint.toBase58()} symbol={metadata?.symbol} poolLaunched={expt.poolLaunched} dammPool={expt.poolLaunched ? expt.dammPool.toBase58() : undefined} />

      {/* Admin Debug Panel */}
      {isDebug && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">Admin Actions</span>
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Debug</Badge>
          </div>

          {/* Action Result */}
          {actionResult && (
            <div className={`text-xs p-2 rounded-lg mb-3 flex items-center gap-1.5 ${actionResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {actionResult.message}
              {actionResult.sig && (
                <a
                  href={solscanTxUrl(actionResult.sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 underline font-medium"
                >
                  {actionResult.sig.slice(0, 8)}…
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Finalize + Withdraw Presale */}
            {!expt.poolLaunched && !expt.presaleFundsWithdrawn && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                disabled={!!actionLoading || !ready}
                onClick={() =>
                  runAction("Finalize & Withdraw", async () => {
                    const exptConfigKey = new PublicKey(address);
                    const treasuryPda = client.deriveTreasuryPda(exptConfigKey)[0];
                    const quoteMint = SPL_NATIVE_MINT;
                    const [quoteVaultPda] = deriveQuoteVault(expt.presale);
                    const treasuryQuoteToken = await getAssociatedTokenAddress(quoteMint, treasuryPda, true);

                    const tx = new Transaction();

                    // 1. Finalize presale (skip if already Active)
                    const needsFinalize =
                      expt.status === ExptStatus.Created ||
                      expt.status === ExptStatus.PresaleActive;
                    if (needsFinalize) {
                      const finalizeIx = await client.finalizePresale(
                        publicKey!,
                        exptConfigKey,
                        expt.presale
                      );
                      tx.add(finalizeIx);
                    }

                    // 2. Create treasury WSOL ATA
                    const createAtaIx = createAssociatedTokenAccountInstruction(
                      publicKey!,
                      treasuryQuoteToken,
                      treasuryPda,
                      quoteMint
                    );
                    tx.add(createAtaIx);

                    // 3. Withdraw presale funds into treasury
                    const withdrawIx = await client.withdrawPresaleFunds(
                      publicKey!,
                      exptConfigKey,
                      expt.presale,
                      treasuryQuoteToken,
                      quoteVaultPda,
                      quoteMint,
                      TOKEN_PROGRAM_ID
                    );
                    tx.add(withdrawIx);

                    return { tx };
                  })
                }
              >
                {actionLoading === "Finalize & Withdraw" ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                {expt.status === ExptStatus.Active ? "Withdraw Funds" : "Finalize & Withdraw"}
              </Button>
            )}

            {/* Launch Pool */}
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
              disabled={!!actionLoading || expt.poolLaunched || !ready}
              onClick={() =>
                runAction("Launch Pool", async () => {
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
                className="rounded-lg text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                disabled={!!actionLoading || !ready}
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
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#F4F3EE] rounded-xl p-1 w-fit mb-8">
        {(["overview", "milestones", "treasury"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 text-xs font-medium rounded-lg capitalize transition-colors ${
              activeTab === tab
                ? "bg-white text-[#1C1917] shadow-sm"
                : "text-[#6A6D78] hover:text-[#1C1917]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* === OVERVIEW TAB === */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* About */}
          {(metadata || expt.uri) && (
            <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3]">
              <h3 className="text-sm font-medium mb-3 text-[#1C1917]">
                About
              </h3>
              {metadata ? (
                <div className="space-y-3">
                  {metadata.image && (
                    <img
                      src={metadata.image}
                      alt={metadata.name || "Experiment"}
                      className="w-16 h-16 rounded-xl object-cover border border-[#DEDEE3]"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    {metadata.name && (
                      <span className="text-sm font-medium text-[#1C1917]">
                        {metadata.name}
                      </span>
                    )}
                    {metadata.symbol && (
                      <span className="text-xs text-[#6A6D78] bg-[#F4F3EE] px-1.5 py-0.5 rounded">
                        ${metadata.symbol}
                      </span>
                    )}
                  </div>
                  {metadata.description && (
                    <p className="text-sm text-[#6A6D78] leading-relaxed">
                      {metadata.description}
                    </p>
                  )}
                  {metadata.properties?.category && (
                    <span className="inline-block text-[10px] text-[#6A6D78] bg-[#DEDEE3]/50 px-2 py-0.5 rounded-full">
                      {metadata.properties.category}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[#6A6D78] leading-relaxed">
                  {expt.uri}
                </p>
              )}
            </div>
          )}

          {/* Presale Context */}
          {(expt.status === ExptStatus.Created ||
            expt.status === ExptStatus.PresaleActive) &&
            presale && (
              <div className="bg-white rounded-3xl p-6 border border-[#E09F3E]/30">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-[#1C1917]">
                    Presale
                  </h3>
                  <Link href={`/experiment/${address}/presale`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] rounded-lg h-6 px-2 border-[#E09F3E]/30 text-[#E09F3E] hover:bg-[#E09F3E]/10"
                    >
                      View Presale →
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-[#6A6D78]">Raised</p>
                    <p className="text-sm font-medium text-[#1C1917]">
                      {formatSOL(presale.totalDeposit)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6A6D78]">Cap</p>
                    <p className="text-sm font-medium text-[#1C1917]">
                      {formatSOL(presale.presaleMaximumCap)} SOL
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6A6D78]">Start</p>
                    <p className="text-sm font-medium text-[#1C1917]">
                      {new Date(
                        presale.presaleStartTime * 1000
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6A6D78]">End</p>
                    <p className="text-sm font-medium text-[#1C1917]">
                      {new Date(
                        presale.presaleEndTime * 1000
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
              <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
                <Coins className="h-4 w-4" />
                <span className="text-xs font-medium">Treasury</span>
              </div>
              <p className="text-lg font-semibold text-[#1C1917]">
                {formatSOL(expt.totalTreasuryReceived)} SOL
              </p>
              <p className="text-xs text-[#6A6D78]">total received</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
              <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">Challenge Window</span>
              </div>
              <p className="text-lg font-semibold text-[#1C1917]">
                {challengeDisplay}
              </p>
              <p className="text-xs text-[#6A6D78]">for veto period</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#DEDEE3]">
              <div className="flex items-center gap-2 text-[#6A6D78] mb-2">
                <Shield className="h-4 w-4" />
                <span className="text-xs font-medium">Veto Threshold</span>
              </div>
              <p className="text-lg font-semibold text-[#1C1917]">
                {expt.vetoThresholdPercent}%
              </p>
              <p className="text-xs text-[#6A6D78]">of milestone value</p>
            </div>
          </div>

        </div>
      )}

      {/* === MILESTONES TAB === */}
      {activeTab === "milestones" && (
        <div className="space-y-4">
          {/* Action result alert (for Resolve, Claim, etc.) */}
          {actionResult && (
            <div
              className={`text-xs p-3 rounded-xl flex items-center gap-2 ${
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
              <span>{actionResult.message}</span>
              {actionResult.sig && (
                <a
                  href={solscanTxUrl(actionResult.sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 underline font-medium"
                >
                  {actionResult.sig.slice(0, 8)}…
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
          {expt.milestones.map((milestone) => (
            <div
              key={milestone.index}
              className="bg-white rounded-3xl p-6 border border-[#DEDEE3]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        DOT_COLORS[milestone.status] || "bg-[#DEDEE3]"
                      }`}
                    />
                    <h3 className="text-sm font-medium text-[#1C1917]">
                      Milestone {milestone.index + 1}
                    </h3>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                        MS_COLORS[milestone.status] || ""
                      }`}
                    >
                      {milestoneStatusLabel(milestone.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-[#6A6D78] ml-4 leading-relaxed">
                    {milestone.description}
                  </p>
                  <div className="mt-3 ml-4 flex flex-wrap items-center gap-3 text-xs text-[#6A6D78]">
                    <span>Unlock: {milestone.unlockPercent}%</span>
                    <span>Type: {milestone.deliverableTypeLabel}</span>
                    <span>Deadline: {formatDate(milestone.deadline)}</span>
                    {milestone.submittedAt && (
                      <span>
                        Submitted: {formatDate(milestone.submittedAt)}
                      </span>
                    )}
                  </div>
                  {milestone.deliverable && (
                    <ProofPreview
                      deliverable={milestone.deliverable}
                      deliverableType={milestone.deliverableType}
                      milestoneIndex={milestone.index}
                    />
                  )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-2">
                  {milestone.status === MilestoneStatus.Submitted && (() => {
                    const windowExpired = milestone.challengeWindowEnd
                      ? milestone.challengeWindowEnd.getTime() < Date.now()
                      : false;

                    return windowExpired ? (
                      <>
                        <span className="text-[10px] text-[#6A6D78]">Veto window closed</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs rounded-lg h-8 border-[#2D6A4F]/30 text-[#2D6A4F] hover:bg-[#2D6A4F]/10"
                          disabled={!ready || !publicKey || !!actionLoading}
                          onClick={() => {
                            const isBuilder = publicKey && expt?.builder && publicKey.equals(expt.builder);
                            const actionName = isBuilder ? "Resolve & Claim" : "Resolve Milestone";
                            runAction(actionName, async () => {
                              const tx = new Transaction();
                              const resolveIx = await client.resolveMilestone(
                                publicKey!,
                                new PublicKey(address),
                                milestone.index
                              );
                              tx.add(resolveIx);
                              if (isBuilder && expt) {
                                // Check treasury balance before adding claim ix
                                const [treasuryPda] = client.deriveTreasuryPda(new PublicKey(address));
                                const treasuryBalance = await connection.getBalance(treasuryPda);
                                if (treasuryBalance > 0) {
                                  const claimIx = await client.claimBuilderFunds(
                                    expt.builder,
                                    expt.mint
                                  );
                                  tx.add(claimIx);
                                }
                              }
                              return { tx };
                            });
                          }}
                        >
                          {(actionLoading === "Resolve & Claim" || actionLoading === "Resolve Milestone") ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : null}
                          {publicKey && expt?.builder && publicKey.equals(expt.builder)
                            ? "Resolve & Claim"
                            : "Resolve"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs rounded-lg h-8 border-[#DEDEE3]"
                        disabled={!ready || !publicKey}
                        title={
                          !ready || !publicKey
                            ? "Connect your wallet first"
                            : "Stake SOL to veto this milestone"
                        }
                        onClick={() => {
                          setVetoIdx(milestone.index);
                          setVetoDeadline(milestone.challengeWindowEnd);
                          setVetoAmount("");
                          setVetoResult(null);
                          setVetoOpen(true);
                        }}
                      >
                        Veto
                      </Button>
                    );
                  })()}
                  {milestone.status === MilestoneStatus.Passed && (() => {
                    const isBuilder = publicKey && expt?.builder && publicKey.equals(expt.builder);
                    if (!isBuilder || !expt) return null;
                    // Compute claimable: sum of unlockBps for Passed milestones × totalTreasuryReceived / 10000 - totalClaimed
                    const totalUnlockedBps = expt.milestones
                      .filter((m) => m.status === MilestoneStatus.Passed)
                      .reduce((sum, m) => sum + m.unlockBps, 0);
                    const totalTreasury = expt.totalTreasuryReceived.toNumber();
                    const totalUnlocked = Math.floor((totalTreasury * totalUnlockedBps) / 10000);
                    const totalClaimed = expt.totalClaimedByBuilder.toNumber();
                    if (totalUnlocked <= totalClaimed) return null;
                    // Also check actual treasury balance
                    if (treasuryBalance !== null && treasuryBalance === 0) return null;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs rounded-lg h-8 border-[#2D6A4F]/30 text-[#2D6A4F] hover:bg-[#2D6A4F]/10"
                        disabled={!!actionLoading}
                        onClick={() =>
                          runAction("Claim Builder Funds", async () => {
                            // Verify treasury actually has SOL
                            const [treasuryPda] = client.deriveTreasuryPda(new PublicKey(address));
                            const treasuryBalance = await connection.getBalance(treasuryPda);
                            if (treasuryBalance === 0) {
                              throw new Error("Treasury has no SOL balance to claim");
                            }
                            const tx = new Transaction();
                            const ix = await client.claimBuilderFunds(
                              expt.builder,
                              expt.mint
                            );
                            tx.add(ix);
                            return { tx };
                          })
                        }
                      >
                        {actionLoading === "Claim Builder Funds" ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : null}
                        Claim Funds
                      </Button>
                    );
                  })()}
                  {milestone.status === MilestoneStatus.Pending && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-lg h-8 border-[#DEDEE3]"
                      disabled={
                        !ready ||
                        !publicKey ||
                        (!!expt?.builder && !publicKey.equals(expt.builder))
                      }
                      title={
                        !ready || !publicKey
                          ? "Connect your wallet first"
                          : expt?.builder && !publicKey.equals(expt.builder)
                            ? "Only the builder can submit proof"
                            : "Submit deliverable proof"
                      }
                      onClick={() => {
                        setSubmitProofIdx(milestone.index);
                        setSubmitProofUrl("");
                        setSubmitProofResult(null);
                        setSubmitProofOpen(true);
                      }}
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

      {/* === TREASURY TAB === */}
      {activeTab === "treasury" && (
        <div className="space-y-6">
          {/* Balance card */}
          <div className="bg-[#F4F3EE] rounded-3xl p-8">
            <p className="text-xs font-medium text-[#6A6D78] uppercase tracking-wider mb-2">
              Treasury Balance
            </p>
            <p className="text-3xl font-semibold text-[#1C1917]">
              {formatSOL(
                new BN(expt.totalTreasuryReceived).sub(
                  new BN(expt.totalClaimedByBuilder)
                )
              )}{" "}
              SOL
            </p>
            <div className="mt-4 flex flex-wrap gap-6 text-xs text-[#6A6D78]">
              <div>
                <p className="font-medium text-[#1C1917] mb-0.5">
                  {formatSOL(expt.totalTreasuryReceived)} SOL
                </p>
                <p>Total received</p>
              </div>
              <div>
                <p className="font-medium text-[#1C1917] mb-0.5">
                  {formatSOL(expt.totalClaimedByBuilder)} SOL
                </p>
                <p>Builder claimed</p>
              </div>
            </div>
          </div>

          {/* Unlock Schedule */}
          <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3]">
            <h3 className="text-sm font-medium mb-4 text-[#1C1917]">
              Unlock Schedule
            </h3>
            <div className="space-y-2">
              {expt.milestones.map((ms) => (
                <div
                  key={ms.index}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        ms.status === MilestoneStatus.Passed
                          ? "bg-[#140E1C]"
                          : "bg-[#DEDEE3]"
                      }`}
                    />
                    <span className="text-sm text-[#6A6D78]">
                      Milestone {ms.index + 1}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-[#1C1917]">
                    {ms.unlockPercent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Submit Proof Dialog */}
      <Dialog open={submitProofOpen} onOpenChange={(open) => {
        setSubmitProofOpen(open);
        if (!open) {
          setSubmitProofResult(null);
          setSubmitProofUrl("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              Submit Proof — Milestone {submitProofIdx !== null ? submitProofIdx + 1 : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6A6D78]">
              Provide the deliverable URL for this milestone. This opens a challenge window during which token holders can veto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1C1917]">
                Deliverable URL
              </label>
              <Input
                type="text"
                placeholder="https://github.com/your-repo/release/v1.0"
                value={submitProofUrl}
                onChange={(e) => setSubmitProofUrl(e.target.value)}
                className="h-9 text-xs rounded-lg border-[#DEDEE3]"
                disabled={submitProofLoading}
              />
              <p className="text-[10px] text-[#6A6D78]">
                Max 200 characters. Link to your proof of completion.
              </p>
            </div>

            <Button
              className="w-full h-9 text-xs rounded-lg bg-[#140E1C] text-white hover:bg-[#140E1C]/90"
              disabled={
                submitProofLoading ||
                !submitProofUrl.trim() ||
                submitProofIdx === null
              }
              onClick={async () => {
                if (!expt || submitProofIdx === null || !publicKey) return;
                setSubmitProofLoading(true);
                setSubmitProofResult(null);
                try {
                  const tx = new Transaction();
                  const ix = await client.submitMilestone(
                    expt.builder,
                    expt.mint,
                    {
                      milestoneIndex: submitProofIdx,
                      deliverable: submitProofUrl.trim(),
                    }
                  );
                  tx.add(ix);
                  const sig = await signAndSend(tx);
                  setSubmitProofResult({
                    success: true,
                    message: `Proof submitted`,
                    sig,
                  });
                  fetchData();
                  setTimeout(() => setSubmitProofOpen(false), 1500);
                } catch (err: any) {
                  console.error("Submit proof error:", err);
                  setSubmitProofResult({
                    success: false,
                    message: err?.message || "Failed to submit proof",
                  });
                } finally {
                  setSubmitProofLoading(false);
                }
              }}
            >
              {submitProofLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Submit Proof
            </Button>

            {submitProofResult && (
              <div
                className={`text-xs p-2 rounded-lg flex items-center gap-1.5 ${
                  submitProofResult.success
                    ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                    : "bg-[#9B2226]/10 text-[#9B2226]"
                }`}
              >
                {submitProofResult.message}
                {submitProofResult.sig && (
                  <a
                    href={solscanTxUrl(submitProofResult.sig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline font-medium"
                  >
                    {submitProofResult.sig.slice(0, 8)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Veto Dialog */}
      <Dialog open={vetoOpen} onOpenChange={(open) => {
        setVetoOpen(open);
        if (!open) {
          setVetoResult(null);
          setVetoAmount("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              Veto Milestone {vetoIdx !== null ? vetoIdx + 1 : ""}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#6A6D78]">
              Stake SOL against this milestone. If enough holders veto, the milestone will be challenged and funds won&apos;t unlock.
            </DialogDescription>
          </DialogHeader>

          {vetoDeadline && (
            <div className="flex items-center gap-2 text-xs bg-[#E09F3E]/10 text-[#E09F3E] p-2.5 rounded-lg">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Veto window ends{" "}
                <strong>
                  {vetoDeadline.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  at{" "}
                  {vetoDeadline.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </span>
            </div>
          )}

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#1C1917]">
                Stake Amount (SOL)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.1"
                value={vetoAmount}
                onChange={(e) => setVetoAmount(e.target.value)}
                className="h-9 text-xs rounded-lg border-[#DEDEE3]"
                disabled={vetoLoading}
              />
              <p className="text-[10px] text-[#6A6D78]">
                SOL will be transferred to the treasury as your veto stake.
              </p>
            </div>

            <Button
              className="w-full h-9 text-xs rounded-lg bg-[#9B2226] text-white hover:bg-[#9B2226]/90"
              disabled={
                vetoLoading ||
                !vetoAmount ||
                Number(vetoAmount) <= 0 ||
                vetoIdx === null
              }
              onClick={async () => {
                if (!expt || vetoIdx === null || !publicKey) return;
                setVetoLoading(true);
                setVetoResult(null);
                try {
                  const amountLamports = new BN(
                    Math.floor(Number(vetoAmount) * LAMPORTS_PER_SOL)
                  );
                  const tx = new Transaction();
                  const ix = await client.initiateVeto(
                    publicKey,
                    new PublicKey(address),
                    vetoIdx,
                    amountLamports
                  );
                  tx.add(ix);
                  const sig = await signAndSend(tx);
                  setVetoResult({
                    success: true,
                    message: `Veto staked`,
                    sig,
                  });
                  fetchData();
                  setTimeout(() => setVetoOpen(false), 1500);
                } catch (err: any) {
                  console.error("Veto error:", err);
                  setVetoResult({
                    success: false,
                    message: err?.message || "Failed to veto",
                  });
                } finally {
                  setVetoLoading(false);
                }
              }}
            >
              {vetoLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Stake &amp; Veto
            </Button>

            {vetoResult && (
              <div
                className={`text-xs p-2 rounded-lg flex items-center gap-1.5 ${
                  vetoResult.success
                    ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                    : "bg-[#9B2226]/10 text-[#9B2226]"
                }`}
              >
                {vetoResult.message}
                {vetoResult.sig && (
                  <a
                    href={solscanTxUrl(vetoResult.sig)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline font-medium"
                  >
                    {vetoResult.sig.slice(0, 8)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
