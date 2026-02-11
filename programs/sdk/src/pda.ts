import { PublicKey } from "@solana/web3.js";
import { EXPT_PROGRAM_ID, SEEDS } from "./constants";

/**
 * Derive the ExptConfig PDA for a given builder wallet.
 * Seeds: [b"expt_config", builder.key()]
 */
export function deriveExptConfigPda(
  builder: PublicKey,
  programId: PublicKey = EXPT_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EXPT_CONFIG, builder.toBuffer()],
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
