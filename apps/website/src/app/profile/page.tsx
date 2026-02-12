import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Twitter, Wallet, ExternalLink } from "lucide-react";

export default function ProfilePage() {
  // Mock data (will be replaced with Privy auth state)
  const isConnected = false;

  if (!isConnected) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <div className="max-w-md mx-auto">
          <Wallet className="h-12 w-12 mx-auto mb-4 text-text-secondary" />
          <h2 className="text-lg font-medium mb-2">Connect your wallet</h2>
          <p className="text-sm text-text-secondary mb-6">
            Connect your wallet to view your profile and experiments.
          </p>
          <Button className="rounded-lg">Connect Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      {/* Identity */}
      <div className="bg-card rounded-3xl p-6 border border-border mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
            <p className="text-sm text-text-secondary mt-1 font-mono">
              7xKX...F3mp
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Builder
          </Badge>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Twitter className="h-4 w-4 text-text-secondary" />
            <span className="text-sm">Not linked</span>
          </div>
          <Button variant="outline" size="sm" className="rounded-lg text-xs h-8">
            <Twitter className="h-3.5 w-3.5 mr-1" />
            Link Twitter
          </Button>
        </div>
      </div>

      {/* Experiments */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Your Experiments</h2>
          <Button asChild size="sm" className="rounded-lg text-xs h-8">
            <Link href="/create">Create New</Link>
          </Button>
        </div>

        <div className="text-center py-12">
          <p className="text-sm text-text-secondary">
            No experiments yet.
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Start by creating your first experiment.
          </p>
        </div>
      </div>

      {/* Veto Stakes */}
      <div>
        <h2 className="text-lg font-medium mb-4">Your Veto Stakes</h2>
        <div className="text-center py-12">
          <p className="text-sm text-text-secondary">
            No active veto stakes.
          </p>
        </div>
      </div>
    </div>
  );
}
