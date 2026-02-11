import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

import { IDL, type Expt } from "./idl";
import {
  EXPT_PROGRAM_ID,
  PRESALE_PROGRAM_ID,
  PRESALE_AUTHORITY,
  MEMO_PROGRAM_ID,
} from "./constants";
import {
  deriveExptConfigPda,
  deriveTreasuryPda,
  deriveVetoStakePda,
} from "./pda";
import {
  type CreateExptConfigInput,
  type SubmitMilestoneInput,
  type ParsedExptConfig,
  type ParsedVetoStake,
  type RawExptConfig,
  type RawVetoStake,
  buildCreateExptConfigArgs,
  buildSubmitMilestoneArgs,
  parseExptConfig,
  parseVetoStake,
} from "./types";

// ---------------------------------------------------------------------------
// ExptClient
// ---------------------------------------------------------------------------

export class ExptClient {
  public readonly program: Program<Expt>;
  public readonly programId: PublicKey;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.programId = programId ?? EXPT_PROGRAM_ID;
    this.program = new Program<Expt>(IDL as Expt, provider);
  }

  // -----------------------------------------------------------------------
  // PDA helpers (convenience pass-through)
  // -----------------------------------------------------------------------

  deriveExptConfigPda(builder: PublicKey): [PublicKey, number] {
    return deriveExptConfigPda(builder, this.programId);
  }

  deriveTreasuryPda(exptConfig: PublicKey): [PublicKey, number] {
    return deriveTreasuryPda(exptConfig, this.programId);
  }

  deriveVetoStakePda(
    exptConfig: PublicKey,
    staker: PublicKey,
    milestoneIndex: number
  ): [PublicKey, number] {
    return deriveVetoStakePda(exptConfig, staker, milestoneIndex, this.programId);
  }

  // -----------------------------------------------------------------------
  // Account fetchers
  // -----------------------------------------------------------------------

  /**
   * Fetch and parse an ExptConfig by builder wallet.
   */
  async fetchExptConfig(builder: PublicKey): Promise<ParsedExptConfig | null> {
    const [pda] = this.deriveExptConfigPda(builder);
    return this.fetchExptConfigByAddress(pda);
  }

  /**
   * Fetch and parse an ExptConfig by its PDA address.
   */
  async fetchExptConfigByAddress(
    address: PublicKey
  ): Promise<ParsedExptConfig | null> {
    const raw = await (
      this.program.account as any
    ).exptConfig.fetchNullable(address);
    if (!raw) return null;
    return parseExptConfig(raw as RawExptConfig, address);
  }

  /**
   * Fetch all ExptConfig accounts.
   */
  async fetchAllExptConfigs(): Promise<ParsedExptConfig[]> {
    const accounts = await (this.program.account as any).exptConfig.all();
    return accounts.map((a: any) =>
      parseExptConfig(a.account as RawExptConfig, a.publicKey)
    );
  }

  /**
   * Fetch and parse a VetoStake account.
   */
  async fetchVetoStake(
    exptConfig: PublicKey,
    staker: PublicKey,
    milestoneIndex: number
  ): Promise<ParsedVetoStake | null> {
    const [pda] = this.deriveVetoStakePda(exptConfig, staker, milestoneIndex);
    const raw = await (
      this.program.account as any
    ).vetoStake.fetchNullable(pda);
    if (!raw) return null;
    return parseVetoStake(raw as RawVetoStake, pda);
  }

  // -----------------------------------------------------------------------
  // Instruction builders
  // -----------------------------------------------------------------------

  /**
   * Create a new experiment.
   */
  async createExptConfig(
    builder: PublicKey,
    presale: PublicKey,
    mint: PublicKey,
    input: CreateExptConfigInput
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfigPda);
    const args = buildCreateExptConfigArgs(input);

    return await (this.program.methods as any)
      .createExptConfig(args)
      .accounts({
        builder,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        presale,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Finalize the presale. Permissionless — anyone can call.
   */
  async finalizePresale(
    payer: PublicKey,
    exptConfig: PublicKey,
    presale: PublicKey
  ): Promise<TransactionInstruction> {
    return await (this.program.methods as any)
      .finalizePresale()
      .accounts({
        payer,
        exptConfig,
        presale,
      })
      .instruction();
  }

  /**
   * Submit proof for a milestone.
   */
  async submitMilestone(
    builder: PublicKey,
    input: SubmitMilestoneInput
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder);
    const args = buildSubmitMilestoneArgs(input);

    return await (this.program.methods as any)
      .submitMilestone(args)
      .accounts({
        builder,
        exptConfig: exptConfigPda,
      })
      .instruction();
  }

  /**
   * Stake SOL against a milestone to veto it.
   */
  async initiateVeto(
    staker: PublicKey,
    exptConfig: PublicKey,
    milestoneIndex: number,
    amount: BN
  ): Promise<TransactionInstruction> {
    const [vetoStakePda] = this.deriveVetoStakePda(
      exptConfig,
      staker,
      milestoneIndex
    );
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .initiateVeto({ milestoneIndex, amount })
      .accounts({
        staker,
        exptConfig,
        vetoStake: vetoStakePda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Resolve a milestone after challenge window. Permissionless.
   */
  async resolveMilestone(
    payer: PublicKey,
    exptConfig: PublicKey,
    milestoneIndex: number
  ): Promise<TransactionInstruction> {
    return await (this.program.methods as any)
      .resolveMilestone({ milestoneIndex })
      .accounts({
        payer,
        exptConfig,
      })
      .instruction();
  }

  /**
   * Builder claims earned funds from the treasury.
   */
  async claimBuilderFunds(
    builder: PublicKey
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfigPda);

    return await (this.program.methods as any)
      .claimBuilderFunds()
      .accounts({
        builder,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  // -----------------------------------------------------------------------
  // Presale CPI instructions
  // -----------------------------------------------------------------------

  /**
   * Withdraw presale funds into the treasury PDA.
   * Permissionless — CPI into Meteora's creator_withdraw.
   */
  async withdrawPresaleFunds(
    payer: PublicKey,
    exptConfig: PublicKey,
    presale: PublicKey,
    treasuryQuoteToken: PublicKey,
    quoteTokenVault: PublicKey,
    quoteMint: PublicKey,
    tokenProgram: PublicKey
  ): Promise<TransactionInstruction> {
    const config = await (this.program.account as any).exptConfig.fetch(
      exptConfig
    );
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .withdrawPresaleFunds()
      .accounts({
        payer,
        exptConfig,
        treasury: treasuryPda,
        presale,
        presaleAuthority: PRESALE_AUTHORITY,
        treasuryQuoteToken,
        quoteTokenVault,
        quoteMint,
        tokenProgram,
        memoProgram: MEMO_PROGRAM_ID,
        presaleProgram: PRESALE_PROGRAM_ID,
      })
      .instruction();
  }

  // -----------------------------------------------------------------------
  // DAMM v2 instructions
  // -----------------------------------------------------------------------

  /**
   * Launch a DAMM v2 pool after presale succeeds.
   * Permissionless — anyone can trigger after finalize_presale.
   *
   * Note: This requires many DAMM v2 accounts. The caller must derive/provide
   * pool, position, vault, and config accounts from the DAMM v2 program.
   */
  async launchPool(
    payer: PublicKey,
    exptConfig: PublicKey,
    args: {
      tokenAAmount: BN;
      tokenBAmount: BN;
      activationPoint: BN;
      feeSchedulerMode: number;
      baseFeeNumerator: BN;
      feeSchedulerParam0: BN;
      feeSchedulerParam1: BN;
      feeSchedulerParam2: BN;
      hasAlphaVault: boolean;
      dynamicFee: {
        initialized: number;
        baseFeeRateCliff: BN;
        baseFeeRatePhaseTwo: BN;
        numberOfPeriod: number;
        periodFrequency: BN;
        reductionFactor: BN;
        feeSchedulerMode: number;
        padding0: number[];
        padding1: BN[];
      };
    },
    remainingAccounts: {
      pool: PublicKey;
      tokenAMint: PublicKey;
      tokenBMint: PublicKey;
      poolTokenAVault: PublicKey;
      poolTokenBVault: PublicKey;
      payerTokenA: PublicKey;
      payerTokenB: PublicKey;
      positionNftMint: PublicKey;
      position: PublicKey;
      poolAuthority: PublicKey;
      ammConfig: PublicKey;
      mintMetadata: PublicKey;
      tokenAProgram: PublicKey;
      tokenBProgram: PublicKey;
      associatedTokenProgram: PublicKey;
      tokenProgram: PublicKey;
      metadataProgram: PublicKey;
      rent: PublicKey;
      dammProgram: PublicKey;
    }
  ): Promise<TransactionInstruction> {
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .launchPool(args)
      .accounts({
        payer,
        exptConfig,
        treasury: treasuryPda,
        ...remainingAccounts,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Claim accrued trading fees from the DAMM v2 pool.
   * Permissionless — requires pool launched + ≥1 milestone passed.
   */
  async claimTradingFees(
    payer: PublicKey,
    exptConfig: PublicKey,
    dammAccounts: {
      pool: PublicKey;
      position: PublicKey;
      positionNftAccount: PublicKey;
      poolTokenAVault: PublicKey;
      poolTokenBVault: PublicKey;
      treasuryTokenA: PublicKey;
      treasuryTokenB: PublicKey;
      tokenAMint: PublicKey;
      tokenBMint: PublicKey;
      poolAuthority: PublicKey;
      tokenAProgram: PublicKey;
      tokenBProgram: PublicKey;
      dammProgram: PublicKey;
    }
  ): Promise<TransactionInstruction> {
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .claimTradingFees()
      .accounts({
        payer,
        exptConfig,
        treasury: treasuryPda,
        ...dammAccounts,
      })
      .instruction();
  }
}
