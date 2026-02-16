"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Wrench } from "lucide-react";
import { useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/create", label: "Create" },
  { href: "/profile", label: "Profile" },
];

const ADMIN_HASH = process.env.NEXT_PUBLIC_ADMIN_ROUTE_HASH || "";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function NavBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isLanding = pathname === "/";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { ready, authenticated, user, login, logout, connectWallet } =
    usePrivy();

  const debugActive = searchParams.get("debug") === ADMIN_HASH;

  const toggleDebug = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (debugActive) {
      params.delete("debug");
    } else {
      params.set("debug", ADMIN_HASH);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  }, [debugActive, pathname, searchParams, router]);

  // Build href with debug param preserved
  const linkHref = (base: string) =>
    debugActive ? `${base}?debug=${ADMIN_HASH}` : base;

  // Get the Solana wallet address from the Privy user
  const solanaWallet = user?.linkedAccounts?.find(
    (a) => a.type === "wallet" && a.chainType === "solana"
  );
  const walletAddress = (solanaWallet as { address?: string })?.address;

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
      <nav className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/ExptLogo.svg" alt="Expt" width={24} height={24} />
          <span className="text-sm font-semibold tracking-tight">Expt</span>
        </Link>

        {/* Desktop Nav — hidden on landing */}
        {!isLanding && (
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={linkHref(link.href)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  pathname === link.href
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isLanding ? (
            <Link
              href="/browse"
              className="inline-flex items-center justify-center h-9 px-4 text-xs font-medium rounded-lg border border-[#D4D4D4] text-[#1C1917] hover:bg-secondary transition-colors"
            >
              Launch App
            </Link>
          ) : (
            <>
              {ready && authenticated && walletAddress ? (
                <div className="hidden sm:flex items-center gap-2">
                  {/* Debug toggle */}
                  <button
                    onClick={toggleDebug}
                    title={
                      debugActive
                        ? "Debug mode ON — click to disable"
                        : "Enable debug mode"
                    }
                    className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                      debugActive
                        ? "bg-[#E09F3E]/15 text-[#D97706] border border-[#E09F3E]/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground font-mono bg-secondary px-3 py-1.5 rounded-lg">
                    {truncateAddress(walletAddress)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-lg h-8 w-8"
                    onClick={() => logout()}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="hidden sm:inline-flex rounded-lg text-xs h-8"
                  onClick={() =>
                    authenticated ? connectWallet() : login()
                  }
                  disabled={!ready}
                >
                  Connect Wallet
                </Button>
              )}
              {/* Mobile menu toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-lg h-8 w-8"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </Button>
            </>
          )}
        </div>
      </nav>

      {/* Mobile menu — only for non-landing pages */}
      {!isLanding && mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background px-6 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={linkHref(link.href)}
              className={`block px-3 py-2 text-sm rounded-lg transition-colors ${
                pathname === link.href
                  ? "font-semibold text-foreground bg-secondary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {ready && authenticated && walletAddress ? (
            <div className="flex items-center justify-between mt-3 px-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleDebug}
                  className={`flex items-center justify-center h-7 w-7 rounded-md transition-colors ${
                    debugActive
                      ? "bg-[#E09F3E]/15 text-[#D97706] border border-[#E09F3E]/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Wrench className="h-3 w-3" />
                </button>
                <span className="text-xs text-muted-foreground font-mono">
                  {truncateAddress(walletAddress)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => logout()}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full mt-3 rounded-lg text-xs"
              onClick={() =>
                authenticated ? connectWallet() : login()
              }
              disabled={!ready}
            >
              Connect Wallet
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
