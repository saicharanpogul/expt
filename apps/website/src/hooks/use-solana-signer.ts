"use client";

import { useMemo, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth/solana";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
} from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://localhost:8899";

const CHAIN_MAP: Record<string, `${string}:${string}`> = {
  localnet: "solana:devnet", // Privy doesn't have localnet, use devnet
  devnet: "solana:devnet",
  "mainnet-beta": "solana:mainnet",
};

const chain: `${string}:${string}` =
  CHAIN_MAP[process.env.NEXT_PUBLIC_SOLANA_NETWORK || "localnet"] ||
  "solana:devnet";

// Base58 encoder (Bitcoin/Solana alphabet)
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let output = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    output += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]];
  }
  return output;
}

export interface SolanaSigner {
  publicKey: PublicKey | null;
  connection: Connection;
  signAndSend: (
    tx: Transaction,
    extraSigners?: Keypair[]
  ) => Promise<string>;
  ready: boolean;
}

export function useSolanaSigner(): SolanaSigner {
  const { wallets } = useWallets();
  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  const wallet = wallets.find((w) => w.address);
  const publicKey = useMemo(
    () => (wallet ? new PublicKey(wallet.address) : null),
    [wallet]
  );

  const signAndSend = useCallback(
    async (tx: Transaction, extraSigners?: Keypair[]): Promise<string> => {
      if (!wallet) throw new Error("No Solana wallet connected");

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(wallet.address);

      if (extraSigners?.length) {
        tx.partialSign(...extraSigners);
      }

      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Privy returns { signature: Uint8Array }
      const result = await wallet.signAndSendTransaction!({
        chain,
        transaction: new Uint8Array(serialized),
      });

      // Encode raw bytes to base58 for Solana RPC
      const signature = toBase58(result.signature);
      console.log("TX signature:", signature);

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      return signature;
    },
    [wallet, connection]
  );

  return {
    publicKey,
    connection,
    signAndSend,
    ready: !!wallet,
  };
}

