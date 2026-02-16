"use client";

import { useMemo } from "react";
import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ExptClient } from "@expt/sdk";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://localhost:8899";

/**
 * Returns a read-only ExptClient for fetching on-chain data.
 * Does not require a connected wallet — uses a dummy wallet for reads.
 */
export function useExptClient(): ExptClient {
  return useMemo(() => {
    const connection = new Connection(RPC_URL, "confirmed");

    // Read-only provider (no signing needed for fetches)
    const dummyWallet = {
      publicKey: null,
      signTransaction: async () => {
        throw new Error("Read-only client");
      },
      signAllTransactions: async () => {
        throw new Error("Read-only client");
      },
    } as unknown as Wallet;

    const provider = new AnchorProvider(connection, dummyWallet, {
      commitment: "confirmed",
    });

    return new ExptClient(provider);
  }, []);
}
