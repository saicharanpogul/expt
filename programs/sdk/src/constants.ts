import { PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Program ID
// ---------------------------------------------------------------------------

export const EXPT_PROGRAM_ID = new PublicKey(
  "9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw"
);

// ---------------------------------------------------------------------------
// PDA Seeds
// ---------------------------------------------------------------------------

export const SEEDS = {
  EXPT_CONFIG: Buffer.from("expt_config"),
  TREASURY: Buffer.from("treasury"),
  VETO_STAKE: Buffer.from("veto_stake"),
  BUILDER: Buffer.from("builder"),
} as const;

// ---------------------------------------------------------------------------
// Limits (must match on-chain constants.rs)
// ---------------------------------------------------------------------------

export const MAX_MILESTONES = 3;
export const MAX_NAME_LEN = 32;
export const MAX_URI_LEN = 200;
export const MAX_MILESTONE_DESC_LEN = 128;
export const MAX_DELIVERABLE_LEN = 200;
export const MAX_RAISE_LAMPORTS = BigInt(10_000) * BigInt(1_000_000_000); // ~10k SOL
export const BPS_DENOMINATOR = 10_000;

// ---------------------------------------------------------------------------
// External Program IDs
// ---------------------------------------------------------------------------

export const PRESALE_PROGRAM_ID = new PublicKey(
  "presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj"
);

export const DAMM_V2_PROGRAM_ID = new PublicKey(
  "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG"
);

export const PRESALE_AUTHORITY = new PublicKey(
  "4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc"
);

export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

export const NATIVE_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112"
);

// ---------------------------------------------------------------------------
// DAMM v2 Constants
// ---------------------------------------------------------------------------

export const DAMM_POOL_AUTHORITY = new PublicKey(
  "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC"
);

export const DAMM_SEEDS = {
  CUSTOMIZABLE_POOL: Buffer.from("cpool"),
  POSITION: Buffer.from("position"),
  POSITION_NFT_ACCOUNT: Buffer.from("position_nft_account"),
  TOKEN_VAULT: Buffer.from("token_vault"),
} as const;
