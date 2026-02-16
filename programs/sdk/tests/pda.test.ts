import { describe, it, expect } from "bun:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  deriveExptConfigPda,
  deriveTreasuryPda,
  deriveVetoStakePda,
  EXPT_PROGRAM_ID,
  SEEDS,
} from "../src";

describe("PDA Derivation", () => {
  const builder = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;

  describe("deriveExptConfigPda", () => {
    it("should derive deterministic PDA from builder key", () => {
      const [pda1, bump1] = deriveExptConfigPda(builder, mint);
      const [pda2, bump2] = deriveExptConfigPda(builder, mint);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it("should match manual findProgramAddressSync", () => {
      const [pda] = deriveExptConfigPda(builder, mint);
      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.EXPT_CONFIG, builder.toBuffer(), mint.toBuffer()],
        EXPT_PROGRAM_ID
      );
      expect(pda.equals(expected)).toBe(true);
    });

    it("should produce different PDAs for different builders", () => {
      const builder2 = Keypair.generate().publicKey;
      const [pda1] = deriveExptConfigPda(builder, mint);
      const [pda2] = deriveExptConfigPda(builder2, mint);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it("should use custom program ID when provided", () => {
      const customProgramId = Keypair.generate().publicKey;
      const [pdaDefault] = deriveExptConfigPda(builder, mint);
      const [pdaCustom] = deriveExptConfigPda(builder, mint, customProgramId);

      expect(pdaDefault.equals(pdaCustom)).toBe(false);
    });
  });

  describe("deriveTreasuryPda", () => {
    it("should derive deterministic PDA from exptConfig key", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const [pda1, bump1] = deriveTreasuryPda(exptConfig);
      const [pda2, bump2] = deriveTreasuryPda(exptConfig);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it("should match manual findProgramAddressSync", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const [pda] = deriveTreasuryPda(exptConfig);
      const [expected] = PublicKey.findProgramAddressSync(
        [SEEDS.TREASURY, exptConfig.toBuffer()],
        EXPT_PROGRAM_ID
      );
      expect(pda.equals(expected)).toBe(true);
    });
  });

  describe("deriveVetoStakePda", () => {
    const staker = Keypair.generate().publicKey;

    it("should derive deterministic PDA from exptConfig + staker + index", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const [pda1, bump1] = deriveVetoStakePda(exptConfig, staker, 0);
      const [pda2, bump2] = deriveVetoStakePda(exptConfig, staker, 0);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it("should produce different PDAs for different milestone indices", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const [pda0] = deriveVetoStakePda(exptConfig, staker, 0);
      const [pda1] = deriveVetoStakePda(exptConfig, staker, 1);
      const [pda2] = deriveVetoStakePda(exptConfig, staker, 2);

      expect(pda0.equals(pda1)).toBe(false);
      expect(pda1.equals(pda2)).toBe(false);
      expect(pda0.equals(pda2)).toBe(false);
    });

    it("should produce different PDAs for different stakers", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const staker2 = Keypair.generate().publicKey;
      const [pda1] = deriveVetoStakePda(exptConfig, staker, 0);
      const [pda2] = deriveVetoStakePda(exptConfig, staker2, 0);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it("should match manual findProgramAddressSync", () => {
      const [exptConfig] = deriveExptConfigPda(builder, mint);
      const milestoneIndex = 1;

      const [pda] = deriveVetoStakePda(exptConfig, staker, milestoneIndex);
      const [expected] = PublicKey.findProgramAddressSync(
        [
          SEEDS.VETO_STAKE,
          exptConfig.toBuffer(),
          staker.toBuffer(),
          Buffer.from([milestoneIndex]),
        ],
        EXPT_PROGRAM_ID
      );
      expect(pda.equals(expected)).toBe(true);
    });
  });
});
