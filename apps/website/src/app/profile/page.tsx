"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useExptClient } from "@/hooks/use-expt-client";
import {
  type ParsedExptConfig,
  exptStatusLabel,
  ExptStatus,
} from "@expt/sdk";
import { useState, useEffect } from "react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const STATUS_COLORS: Record<number, string> = {
  [ExptStatus.Created]: "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
  [ExptStatus.PresaleActive]: "bg-[#E09F3E]/10 text-[#E09F3E] border-[#E09F3E]/20",
  [ExptStatus.PresaleFailed]: "bg-[#D32F2F]/10 text-[#D32F2F] border-[#D32F2F]/20",
  [ExptStatus.Active]: "bg-[#140E1C]/10 text-[#140E1C] border-[#140E1C]/20",
  [ExptStatus.Completed]:
    "bg-[#6A6D78]/10 text-[#6A6D78] border-[#6A6D78]/20",
};

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function ProfilePage() {
  const { ready, authenticated, user, login, linkTwitter, connectWallet } = usePrivy();
  const client = useExptClient();

  const solanaWallet = user?.linkedAccounts?.find(
    (a) => a.type === "wallet" && a.chainType === "solana"
  );
  const walletAddress = (solanaWallet as { address?: string })?.address;
  const twitterAccount = user?.linkedAccounts?.find(
    (a) => a.type === "twitter_oauth"
  );
  const twitterUsername = (twitterAccount as { username?: string })?.username;
  const twitterName = (twitterAccount as { name?: string })?.name;
  const twitterPictureRaw = (twitterAccount as { profilePictureUrl?: string })?.profilePictureUrl;
  const twitterPicture = twitterPictureRaw?.replace("_normal", "_400x400");

  const isConnected = ready && authenticated && !!walletAddress;

  const [experiments, setExperiments] = useState<ParsedExptConfig[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected || !walletAddress) return;

    let cancelled = false;
    async function fetchMyExperiments() {
      try {
        setLoading(true);
        const allConfigs = await client.fetchAllExptConfigs();
        const mine = allConfigs.filter(
          (c) => c.builder.toBase58() === walletAddress
        );
        if (!cancelled) setExperiments(mine);
      } catch (err) {
        console.error("Failed to fetch experiments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMyExperiments();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, client]);

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
            Connect your wallet to view your profile and experiments.
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

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      {/* Identity */}
      <div className="bg-white rounded-3xl p-6 border border-[#DEDEE3] mb-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="shrink-0">
            {twitterPicture ? (
              <Image
                src={twitterPicture}
                alt={twitterName || twitterUsername || "Profile"}
                width={56}
                height={56}
                className="rounded-full border-2 border-[#DEDEE3]"
                unoptimized
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#140E1C] flex items-center justify-center text-[#F4F3EE] text-lg font-semibold">
                {(twitterUsername || walletAddress || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[#1C1917]">
                  {twitterName || "Profile"}
                </h1>
                <p className="text-sm text-[#6A6D78] mt-0.5 font-mono">
                  {walletAddress ? truncateAddress(walletAddress) : "—"}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-xs border-[#DEDEE3] text-[#6A6D78]"
              >
                Builder
              </Badge>
            </div>

            <div className="mt-4 flex items-center gap-4">
              {twitterUsername ? (
                <a
                  href={`https://x.com/${twitterUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                >
                  <svg className="h-4 w-4 text-[#1C1917]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="text-sm text-[#1C1917]">@{twitterUsername}</span>
                </a>
              ) : (
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-[#6A6D78]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="text-sm text-[#6A6D78]">Not linked</span>
                </div>
              )}
              {!twitterUsername && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg text-xs h-8 border-[#DEDEE3]"
                  onClick={() => linkTwitter()}
                >
                  <svg className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Link X
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Experiments */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-[#1C1917]">
            Your Experiments
          </h2>
          <Button
            asChild
            size="sm"
            className="rounded-lg text-xs h-8 bg-[#140E1C] hover:bg-[#2A2430] text-[#F4F3EE]"
          >
            <Link href="/create">Create New</Link>
          </Button>
        </div>

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
            <p className="text-xs text-[#A1A1AA] mt-1">
              Start by creating your first experiment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
