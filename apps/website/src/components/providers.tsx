"use client";

import { ReactNode } from "react";

// Privy provider will be added here once app ID is configured
// import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: ReactNode }) {
  // TODO: Wrap with PrivyProvider once NEXT_PUBLIC_PRIVY_APP_ID is set
  // <PrivyProvider
  //   appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  //   config={{
  //     loginMethods: ["wallet"],
  //     appearance: {
  //       theme: "light",
  //       accentColor: "#140E1C",
  //     },
  //     embeddedWallets: { createOnLogin: "off" },
  //     solanaClusters: [
  //       { name: "devnet", rpcUrl: "https://api.devnet.solana.com" },
  //     ],
  //   }}
  // >
  //   {children}
  // </PrivyProvider>
  return <>{children}</>;
}
