/**
 * Mobile Wallet Adapter (MWA) utilities for Solana Seeker / Saga.
 *
 * Provides wallet connection, signing, and transaction sending
 * via the Solana Mobile wallet standard.
 */

import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("devnet");
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
 * Connect to a mobile wallet and return the public key.
 */
export async function connectWallet(): Promise<PublicKey | null> {
  try {
    const result = await transact(async (wallet: Web3MobileWallet) => {
      const { accounts } = await wallet.authorize({
        cluster: "devnet",
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
  try {
    const conn = getConnection();
    const { blockhash, lastValidBlockHeight } =
      await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    const signature = await transact(
      async (wallet: Web3MobileWallet) => {
        await wallet.authorize({
          cluster: "devnet",
          identity: APP_IDENTITY,
        });

        const signedTxs = await wallet.signAndSendTransactions({
          transactions: [transaction],
        });

        return signedTxs[0];
      }
    );

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
