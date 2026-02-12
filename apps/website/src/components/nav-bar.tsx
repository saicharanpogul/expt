"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/create", label: "Create" },
  { href: "/profile", label: "Profile" },
];

export function NavBar() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
      <nav className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image src="/ExptLogo.svg" alt="Expt" width={24} height={24} />
          <span className="text-sm font-semibold tracking-tight">
            Expt
          </span>
        </Link>

        {/* Desktop Nav — hidden on landing */}
        {!isLanding && (
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
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
              <Button
                variant="default"
                size="sm"
                className="hidden sm:inline-flex rounded-lg text-xs h-8"
              >
                Connect Wallet
              </Button>
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
              href={link.href}
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
          <Button variant="default" size="sm" className="w-full mt-3 rounded-lg text-xs">
            Connect Wallet
          </Button>
        </div>
      )}
    </header>
  );
}

