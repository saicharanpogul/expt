"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  
  // Hide footer on landing page — the CTA section acts as a visual closer
  if (pathname === "/") return null;
  
  return (
    <footer className="border-t border-border mt-16">
      <div className="max-w-[1200px] mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          expt.fun — Earn capital by shipping
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/browse"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse
          </Link>
          <Link
            href="/create"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Create
          </Link>
          <a
            href="https://x.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Twitter
          </a>
        </div>
      </div>
    </footer>
  );
}
