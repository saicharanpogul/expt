import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/nav-bar";
import { Footer } from "@/components/footer";
import { Providers } from "@/components/providers";
import { Suspense } from "react";
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Expt — Earn Capital by Shipping",
  description:
    "Expt is a platform that lets builders raise small experimental capital from the public while preventing upfront extraction. Builders earn funds only by shipping, not by hype.",
  openGraph: {
    title: "Expt — Earn Capital by Shipping",
    description:
      "Raise experimental capital. Ship milestones. Earn trust. No extraction.",
    siteName: "expt.fun",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Suspense><NavBar /></Suspense>
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
