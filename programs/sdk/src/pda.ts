import { PublicKey } from "@solana/web3.js";
import {
  EXPT_PROGRAM_ID,
  PRESALE_PROGRAM_ID,
  DAMM_V2_PROGRAM_ID,
  DAMM_SEEDS,
  SEEDS,
} from "./constants";

/**
 * Derive the ExptConfig PDA for a given builder wallet and mint.
 * Seeds: [b"expt_config", builder.key(), mint.key()]
 */
export function deriveExptConfigPda(
  builder: PublicKey,
  mint: PublicKey,
  programId: PublicKey = EXPT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EXPT_CONFIG, builder.toBuffer(), mint.toBuffer()],
    programId
  );
}

/**
 * Derive the Treasury PDA for a given ExptConfig.
 * Seeds: [b"treasury", expt_config.key()]
 */
export function deriveTreasuryPda(
  exptConfig: PublicKey,
  programId: PublicKey = EXPT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.TREASURY, exptConfig.toBuffer()],
    programId
  );
}

/**
 * Derive the VetoStake PDA for a given staker + milestone.
 * Seeds: [b"veto_stake", expt_config.key(), staker.key(), &[milestone_index]]
 */
export function deriveVetoStakePda(
  exptConfig: PublicKey,
  staker: PublicKey,
  milestoneIndex: number,
  programId: PublicKey = EXPT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEEDS.VETO_STAKE,
      exptConfig.toBuffer(),
      staker.toBuffer(),
      Buffer.from([milestoneIndex]),
    ],
    programId
  );
}

// ---------------------------------------------------------------------------
// Meteora Presale PDA helpers
// ---------------------------------------------------------------------------

/**
 * Derive the Meteora Presale PDA.
 * Seeds: ["presale", base, presaleMint, quoteMint]
 */
export function derivePresalePda(
  base: PublicKey,
  presaleMint: PublicKey,
  quoteMint: PublicKey,
  programId: PublicKey = PRESALE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("presale"),
      base.toBuffer(),
      presaleMint.toBuffer(),
      quoteMint.toBuffer(),
    ],
    programId
  );
}

/**
 * Derive the Presale base token vault PDA.
 * Seeds: ["base_vault", presale]
 */
export function derivePresaleVault(
  presale: PublicKey,
  programId: PublicKey = PRESALE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("base_vault"), presale.toBuffer()],
    programId
  );
}

/**
 * Derive the Presale quote token vault PDA.
 * Seeds: ["quote_vault", presale]
 */
export function deriveQuoteVault(
  presale: PublicKey,
  programId: PublicKey = PRESALE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("quote_vault"), presale.toBuffer()],
    programId
  );
}

/**
 * Derive the Escrow PDA for a depositor in a presale.
 * Seeds: ["escrow", presale, owner, [registryIndex]]
 */
export function deriveEscrowPda(
  presale: PublicKey,
  owner: PublicKey,
  registryIndex: number = 0,
  programId: PublicKey = PRESALE_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      presale.toBuffer(),
      owner.toBuffer(),
      Buffer.from([registryIndex]),
    ],
    programId
  );
}

// ---------------------------------------------------------------------------
// DAMM v2 PDA helpers
// ---------------------------------------------------------------------------

/**
 * Derive the DAMM v2 customizable pool PDA.
 * Seeds: ["cpool", max(tokenA, tokenB), min(tokenA, tokenB)]
 */
export function deriveDammPoolPda(
  tokenAMint: PublicKey,
  tokenBMint: PublicKey,
  programId: PublicKey = DAMM_V2_PROGRAM_ID
): [PublicKey, number] {
  const [maxKey, minKey] =
    tokenAMint.toBuffer().compare(tokenBMint.toBuffer()) > 0
      ? [tokenAMint, tokenBMint]
      : [tokenBMint, tokenAMint];
  return PublicKey.findProgramAddressSync(
    [DAMM_SEEDS.CUSTOMIZABLE_POOL, maxKey.toBuffer(), minKey.toBuffer()],
    programId
  );
}

/**
 * Derive the DAMM v2 position PDA.
 * Seeds: ["position", nftMint]
 */
export function deriveDammPositionPda(
  nftMint: PublicKey,
  programId: PublicKey = DAMM_V2_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DAMM_SEEDS.POSITION, nftMint.toBuffer()],
    programId
  );
}

/**
 * Derive the DAMM v2 position NFT account PDA.
 * Seeds: ["position_nft_account", nftMint]
 */
export function deriveDammPositionNftAccount(
  nftMint: PublicKey,
  programId: PublicKey = DAMM_V2_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DAMM_SEEDS.POSITION_NFT_ACCOUNT, nftMint.toBuffer()],
    programId
  );
}

/**
 * Derive the DAMM v2 token vault PDA.
 * Seeds: ["token_vault", mint, pool]
 */
export function deriveDammTokenVault(
  mint: PublicKey,
  pool: PublicKey,
  programId: PublicKey = DAMM_V2_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DAMM_SEEDS.TOKEN_VAULT, mint.toBuffer(), pool.toBuffer()],
    programId
  );
}
