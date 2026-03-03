/**
 * Mobile Wallet Adapter (MWA) utilities for Solana Seeker / Saga.
 *
 * Gracefully handles missing native module (e.g. when running in Expo Go
 * on iOS simulator where MWA isn't available). Falls back to a stub that
 * shows an alert.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { Alert, Platform } from "react-native";

const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
const CLUSTER = process.env.EXPO_PUBLIC_SOLANA_NETWORK || "devnet";
const APP_IDENTITY = {
  name: "Expt",
  uri: "https://expt.fun",
  icon: "favicon.png",
};

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, "confirmed");
  }
  return connection;
}

/**
 * Check if MWA is available (requires physical Android device with wallet app).
 */
function isMwaAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    require("@solana-mobile/mobile-wallet-adapter-protocol-web3js");
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to a mobile wallet and return the public key.
 * Shows an alert if MWA is not available (iOS / Expo Go).
 */
export async function connectWallet(): Promise<PublicKey | null> {
  if (!isMwaAvailable()) {
    Alert.alert(
      "Wallet Not Available",
      "Mobile Wallet Adapter requires a Solana wallet app on an Android device. " +
      "You can test this on a Solana Saga or Seeker device.",
      [{ text: "OK" }]
    );
    return null;
  }

  try {
    const { transact } =
      require("@solana-mobile/mobile-wallet-adapter-protocol-web3js");

    const result = await transact(async (wallet: any) => {
      const { accounts } = await wallet.authorize({
        cluster: CLUSTER,
        identity: APP_IDENTITY,
      });
      return accounts[0]?.address;
    });

    return result ? new PublicKey(result) : null;
  } catch (err) {
    console.error("Wallet connect failed:", err);
    return null;
  }
}

/**
 * Sign and send a transaction using the mobile wallet.
 */
export async function signAndSendTransaction(
  transaction: Transaction
): Promise<string | null> {
  if (!isMwaAvailable()) {
    Alert.alert("Wallet Not Available", "MWA requires an Android device.");
    return null;
  }

  try {
    const { transact } =
      require("@solana-mobile/mobile-wallet-adapter-protocol-web3js");
    const conn = getConnection();
    const { blockhash, lastValidBlockHeight } =
      await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    const signature = await transact(async (wallet: any) => {
      await wallet.authorize({
        cluster: CLUSTER,
        identity: APP_IDENTITY,
      });

      const signedTxs = await wallet.signAndSendTransactions({
        transactions: [transaction],
      });

      return signedTxs[0];
    });

    if (signature) {
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
    }

    return signature || null;
  } catch (err) {
    console.error("Sign and send failed:", err);
    return null;
  }
}
