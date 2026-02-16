import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="w-full max-w-2xl mx-auto text-center pt-20 pb-12 md:pt-32 md:pb-20 px-6">
        {/* Badge */}
        <span className="inline-flex items-center rounded-full bg-[#DEDEE3] px-4 py-1.5 text-xs font-medium text-[#6A6D78] tracking-wide uppercase mb-8">
          Devnet
        </span>

        {/* Headline */}
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.08] text-[#1C1917]">
          Ship first,
          <br />
          earn after.
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base md:text-lg text-[#57534E] max-w-md mx-auto leading-relaxed">
          Expt is a platform for builders to raise experimental capital and
          unlock funds only by shipping real milestones.
        </p>

        {/* CTA */}
        <div className="mt-10">
          <Link
            href="/browse"
            className="inline-flex items-center justify-center h-14 px-10 text-base font-medium rounded-full bg-[#140E1C] text-[#F4F3EE] hover:bg-[#2A2430] transition-colors"
          >
            Browse experiments
          </Link>
        </div>
      </section>

      {/* ── Product Demo ────────────────────────────────────── */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-[#DEDEE3] rounded-3xl p-3 md:p-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            {/* Mock experiment card preview */}
            <div className="p-6 md:p-8 border-b border-[#E7E5E4]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#140E1C] flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8.5L7 11.5L12.5 5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1C1917]">Solana Pay Plugin</p>
                    <p className="text-xs text-[#57534E]">by @builder_one · Milestone 1 of 3</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center rounded-full bg-[#140E1C]/10 text-[#140E1C] px-3 py-1 text-xs font-medium">
                  Active
                </span>
              </div>
            </div>
            {/* Mock milestone rows */}
            <div className="divide-y divide-[#E7E5E4]">
              {[
                { name: "Deploy payment SDK with merchant dashboard", status: "Passed", statusColor: "text-[#2D6A4F]", dotColor: "bg-[#2D6A4F]", unlock: "33.3%" },
                { name: "Integrate with 3 major e-commerce platforms", status: "In review", statusColor: "text-[#E09F3E]", dotColor: "bg-[#E09F3E]", unlock: "33.3%" },
                { name: "Launch mainnet with real merchant onboarding", status: "Pending", statusColor: "text-[#57534E]", dotColor: "bg-[#D4D4D4]", unlock: "33.4%" },
              ].map((ms) => (
                <div key={ms.name} className="flex items-center justify-between px-6 md:px-8 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-2 w-2 rounded-full ${ms.dotColor} shrink-0`} />
                    <span className="text-sm text-[#1C1917] truncate">{ms.name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className={`text-xs font-medium ${ms.statusColor}`}>{ms.status}</span>
                    <span className="text-xs text-[#A1A1AA]">{ms.unlock}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Bottom bar */}
            <div className="flex items-center justify-between px-6 md:px-8 py-4 bg-[#FAFAF9]">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#57534E]">Treasury</span>
                <span className="text-sm font-semibold text-[#1C1917]">1.3 SOL</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#57534E]">Veto window</span>
                <span className="text-sm font-semibold text-[#1C1917]">72h</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3 Steps ──────────────────────────────────────────── */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-4xl md:text-[56px] font-semibold tracking-tight leading-[1.1] text-center text-[#1C1917] mb-20">
          Earn capital in
          <br />
          3 simple steps
        </h2>

        {/* Step 1 */}
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16 mb-16 md:mb-24">
          <div className="flex-1 text-center md:text-left">
            <p className="text-xs font-medium text-[#57534E] uppercase tracking-widest mb-4">Step 1</p>
            <h3 className="text-2xl md:text-[32px] font-semibold tracking-tight leading-[1.2] text-[#1C1917]">
              Define your experiment
              <br />
              and set milestones
            </h3>
          </div>
          <div className="flex-1 max-w-md">
            <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-sm font-semibold text-[#1C1917] mb-1">Solana Pay Plugin</p>
              <p className="text-xs text-[#57534E] mb-4">A merchant payment SDK for Solana...</p>
              <div className="space-y-2">
                {["Deploy SDK", "Integrate platforms", "Launch mainnet"].map((ms, i) => (
                  <div key={ms} className="flex items-center justify-between bg-[#FAFAF9] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#A1A1AA] font-medium">{i + 1}</span>
                      <span className="text-sm text-[#1C1917]">{ms}</span>
                    </div>
                    <span className="text-xs text-[#57534E]">33%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#E7E5E4] mb-16 md:mb-24" />

        {/* Step 2 */}
        <div className="flex flex-col md:flex-row-reverse items-center gap-8 md:gap-16 mb-16 md:mb-24">
          <div className="flex-1 text-center md:text-left">
            <p className="text-xs font-medium text-[#57534E] uppercase tracking-widest mb-4">Step 2</p>
            <h3 className="text-2xl md:text-[32px] font-semibold tracking-tight leading-[1.2] text-[#1C1917]">
              Speculation already
              <br />
              exists. Redirect it.
            </h3>
          </div>
          <div className="flex-1 max-w-md">
            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-sm font-semibold text-[#1C1917] mb-1">Expt channels resources into liquidity & learning</p>
              <p className="text-xs text-[#57534E] mb-4">People launch tokens to extract.</p>
              <div className="space-y-2">
                {[
                  { label: "Farm Grants & Bounties", icon: "✕", color: "text-[#A1A1AA]", bg: "bg-[#E7E5E4]" },
                  { label: "Anon Token Launches", icon: "✕", color: "text-[#A1A1AA]", bg: "bg-[#E7E5E4]" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between bg-[#FAFAF9] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-7 w-7 rounded-lg ${item.bg} flex items-center justify-center text-xs ${item.color} font-medium`}>
                        {item.icon}
                      </span>
                      <span className="text-sm text-[#A1A1AA] line-through">{item.label}</span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between bg-[#140E1C] rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-lg bg-[#F4F3EE]/15 flex items-center justify-center text-xs text-[#F4F3EE] font-medium">
                      ✓
                    </span>
                    <span className="text-sm font-semibold text-[#F4F3EE]">A market for uncertainty</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[#E7E5E4] mb-16 md:mb-24" />

        {/* Step 3 */}
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-16">
          <div className="flex-1 text-center md:text-left">
            <p className="text-xs font-medium text-[#57534E] uppercase tracking-widest mb-4">Step 3</p>
            <h3 className="text-2xl md:text-[32px] font-semibold tracking-tight leading-[1.2] text-[#1C1917]">
              Ship milestones
              <br />
              and earn your capital
            </h3>
          </div>
          <div className="flex-1 max-w-md">
            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="space-y-3">
                {[
                  { label: "Milestone 1 passed", sol: "3.3 SOL unlocked", icon: "✓", color: "text-[#140E1C]", bg: "bg-[#140E1C]/10" },
                  { label: "Milestone 2 passed", sol: "3.3 SOL unlocked", icon: "✓", color: "text-[#140E1C]", bg: "bg-[#140E1C]/10" },
                  { label: "Milestone 3 shipped", sol: "3.4 SOL pending", icon: "→", color: "text-[#E09F3E]", bg: "bg-[#E09F3E]/10" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between bg-[#FAFAF9] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-7 w-7 rounded-lg ${item.bg} flex items-center justify-center text-xs ${item.color} font-medium`}>
                        {item.icon}
                      </span>
                      <span className="text-sm text-[#1C1917]">{item.label}</span>
                    </div>
                    <span className="text-xs text-[#57534E]">{item.sol}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Before / After Comparison ────────────────────────── */}
      <section className="w-full max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Before */}
          <div className="bg-white rounded-3xl p-8 md:p-10 flex flex-col items-center text-center min-h-[400px]">
            <h3 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-[1.2] text-[#1C1917] mb-8">
              Instead of extracting
              <br />
              capital upfront...
            </h3>
            <div className="space-y-3 w-full max-w-xs">
              {/* Mock "bad" scenario cards */}
              <div className="bg-[#1C1917] rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-5 rounded-full bg-[#E09F3E] flex items-center justify-center text-[10px] font-bold text-white">A</div>
                  <span className="text-xs text-[#A1A1AA]">@anon_dev · 2h ago</span>
                </div>
                <p className="text-xs text-white/80">Raised 50 SOL and vanished. Classic pump and dump.</p>
              </div>
              <div className="bg-[#1C1917] rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-5 w-5 rounded-full bg-[#457B9D] flex items-center justify-center text-[10px] font-bold text-white">K</div>
                  <span className="text-xs text-[#A1A1AA]">@kevinr · 1h ago</span>
                </div>
                <p className="text-xs text-white/80">No milestones, no accountability, no product. Just vibes.</p>
              </div>
            </div>
          </div>

          {/* After */}
          <div className="bg-white rounded-3xl p-8 md:p-10 flex flex-col items-center text-center min-h-[400px]">
            <h3 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-[1.2] text-[#1C1917] mb-8">
              Ship milestones
              <br />
              on Expt.
            </h3>
            <div className="w-full max-w-xs space-y-4">
              {[
                { name: "Milestone 1", votes: 12, pct: 100 },
                { name: "Milestone 2", votes: 8, pct: 72 },
                { name: "Milestone 3", votes: 3, pct: 30 },
              ].map((ms) => (
                <div key={ms.name} className="text-left">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-[#1C1917]">{ms.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-[#DEDEE3] rounded-full overflow-hidden">
                      <div className="h-full bg-[#140E1C] rounded-full transition-all" style={{ width: `${ms.pct}%` }} />
                    </div>
                    <span className="text-xs text-[#6A6D78] font-medium shrink-0">{ms.votes} supporters</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Showcase Statement ────────────────────────────────── */}
      <section className="w-full max-w-4xl mx-auto px-6 pb-24 text-center">
        <h2 className="text-3xl md:text-[48px] font-semibold tracking-tight leading-[1.15] text-[#1C1917]">
          Whether it&apos;s an SDK,
          <br />
          a tool, or a protocol, any
          <br />
          kind of project can be an experiment.
        </h2>
      </section>

      {/* ── Final CTA Section ────────────────────────────────── */}
      <section className="w-full bg-[#140E1C] py-24 md:py-32">
        <div className="max-w-2xl mx-auto text-center px-6">
          {/* Icon */}
          <div className="mb-8 flex justify-center">
            <Image
              src="/ExptLogo.svg"
              alt="Expt"
              width={40}
              height={40}
              className="invert opacity-80"
            />
          </div>

          <h2 className="text-3xl md:text-[48px] font-semibold tracking-tight leading-[1.15] text-white/90">
            Start shipping and earning
            <br />
            with Expt
          </h2>

          <div className="mt-10">
            <Link
              href="/create"
              className="inline-flex items-center justify-center h-14 px-10 text-base font-medium rounded-full bg-[#F4F3EE] text-[#140E1C] hover:bg-[#EAE1DA] transition-colors"
            >
              Create an experiment
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
