import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";

import { IDL, type Expt } from "./idl";
import {
  EXPT_PROGRAM_ID,
  PRESALE_PROGRAM_ID,
  PRESALE_AUTHORITY,
  MEMO_PROGRAM_ID,
} from "./constants";
import {
  deriveExptConfigPda,
  deriveBuilderPda,
  deriveTreasuryPda,
  deriveVetoStakePda,
  deriveEscrowPda,
  deriveQuoteVault,
} from "./pda";
import {
  type CreateExptConfigInput,
  type InitializePresaleFromTreasuryInput,
  type SubmitMilestoneInput,
  type ParsedExptConfig,
  type ParsedPresaleState,
  type ParsedVetoStake,
  type ParsedBuilder,
  type RawExptConfig,
  type RawVetoStake,
  type RawBuilder,
  buildCreateExptConfigArgs,
  buildInitializePresaleFromTreasuryArgs,
  buildSubmitMilestoneArgs,
  parseExptConfig,
  parsePresaleState,
  parseVetoStake,
  parseBuilder,
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

  deriveExptConfigPda(builder: PublicKey, mint: PublicKey): [PublicKey, number] {
    return deriveExptConfigPda(builder, mint, this.programId);
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

  deriveBuilderPda(wallet: PublicKey): [PublicKey, number] {
    return deriveBuilderPda(wallet, this.programId);
  }

  // -----------------------------------------------------------------------
  // Account fetchers
  // -----------------------------------------------------------------------

  /**
   * Fetch and parse an ExptConfig by builder wallet and mint.
   */
  async fetchExptConfig(builder: PublicKey, mint: PublicKey): Promise<ParsedExptConfig | null> {
    const [pda] = this.deriveExptConfigPda(builder, mint);
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
  // Builder methods
  // -----------------------------------------------------------------------

  /**
   * Fetch and parse a Builder account by wallet address.
   */
  async fetchBuilder(wallet: PublicKey): Promise<ParsedBuilder | null> {
    const [pda] = this.deriveBuilderPda(wallet);
    try {
      const raw = await (this.program.account as any).builder.fetch(pda);
      return parseBuilder(raw as RawBuilder, pda);
    } catch {
      return null;
    }
  }

  /**
   * Create a builder profile.
   * Must be called before createExptConfig.
   */
  async createBuilder(
    wallet: PublicKey,
    xUsername: string,
    github?: string,
    telegram?: string,
  ): Promise<TransactionInstruction> {
    const [builderPda] = this.deriveBuilderPda(wallet);

    return await (this.program.methods as any)
      .createBuilder({
        xUsername,
        github: github ?? null,
        telegram: telegram ?? null,
      })
      .accounts({
        wallet,
        builder: builderPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  // -----------------------------------------------------------------------
  // Experiment methods
  // -----------------------------------------------------------------------

  /**
   * Create a new experiment.
   * The mint is created on-chain by this instruction.
   * Pass a fresh Keypair's publicKey as `mint` — add the Keypair as a signer.
   * Total supply is minted to treasury's ATA, then mint authority is revoked.
   */
  async createExptConfig(
    builder: PublicKey,
    mint: PublicKey,
    input: CreateExptConfigInput
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder, mint);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfigPda);
    const [builderPda] = this.deriveBuilderPda(builder);
    const args = buildCreateExptConfigArgs(input);

    // Derive treasury's ATA for the new mint
    const [treasuryToken] = PublicKey.findProgramAddressSync(
      [treasuryPda.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return await (this.program.methods as any)
      .createExptConfig(args)
      .accounts({
        builder,
        builderProfile: builderPda,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        mint,
        treasuryToken,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  /**
   * Initialize a Meteora presale using tokens from the treasury.
   * Must be called after createExptConfig.
   * Pass a fresh Keypair's publicKey as `base` — add the Keypair as a signer.
   */
  async initializePresaleFromTreasury(
    builder: PublicKey,
    mint: PublicKey,
    base: PublicKey,
    quoteMint: PublicKey,
    input: InitializePresaleFromTreasuryInput
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder, mint);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfigPda);
    const args = buildInitializePresaleFromTreasuryArgs(input);

    // Derive treasury's ATA for the experiment token
    const [treasuryToken] = PublicKey.findProgramAddressSync(
      [treasuryPda.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Derive Meteora presale PDAs
    const [presalePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("presale"), base.toBuffer(), mint.toBuffer(), quoteMint.toBuffer()],
      PRESALE_PROGRAM_ID
    );
    const [presaleVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), presalePda.toBuffer()],
      PRESALE_PROGRAM_ID
    );
    const [quoteVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), presalePda.toBuffer()],
      PRESALE_PROGRAM_ID
    );

    // Derive event authority PDA for Meteora's #[event_cpi] pattern
    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      PRESALE_PROGRAM_ID
    );

    return await (this.program.methods as any)
      .initializePresaleFromTreasury(args)
      .accounts({
        builder,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        treasuryToken,
        base,
        mint,
        quoteMint,
        presale: presalePda,
        presaleAuthority: PRESALE_AUTHORITY,
        presaleVault,
        quoteVault,
        baseTokenProgram: TOKEN_PROGRAM_ID,
        quoteTokenProgram: TOKEN_PROGRAM_ID,
        presaleProgram: PRESALE_PROGRAM_ID,
        eventAuthority,
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
    mint: PublicKey,
    input: SubmitMilestoneInput
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder, mint);
    const args = buildSubmitMilestoneArgs(input);

    return await (this.program.methods as any)
      .submitMilestone(args)
      .accounts({
        builder,
        mint,
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
   * Settle a veto stake after milestone resolution.
   * If milestone passed → stake burned (stays in treasury).
   * If milestone failed → stake returned to vetoer.
   * VetoStake account is closed in both cases.
   */
  async settleVetoStake(
    staker: PublicKey,
    exptConfig: PublicKey,
    milestoneIndex: number
  ): Promise<TransactionInstruction> {
    const [vetoStakePda] = this.deriveVetoStakePda(exptConfig, staker, milestoneIndex);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .settleVetoStake({ milestoneIndex })
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
   * Builder claims earned funds from the treasury.
   */
  async claimBuilderFunds(
    builder: PublicKey,
    mint: PublicKey
  ): Promise<TransactionInstruction> {
    const [exptConfigPda] = this.deriveExptConfigPda(builder, mint);
    const [treasuryPda] = this.deriveTreasuryPda(exptConfigPda);

    return await (this.program.methods as any)
      .claimBuilderFunds()
      .accounts({
        builder,
        mint,
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

    // Derive event_authority PDA for presale's #[event_cpi]
    const [presaleEventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      PRESALE_PROGRAM_ID
    );

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
        presaleEventAuthority,
        presaleProgram: PRESALE_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Unwrap WSOL from treasury ATA to native SOL.
   * Must be called after withdrawPresaleFunds and before claimBuilderFunds.
   * Permissionless — anyone can trigger this.
   */
  async unwrapTreasuryWsol(
    payer: PublicKey,
    exptConfig: PublicKey,
    treasuryWsolAta: PublicKey
  ): Promise<TransactionInstruction> {
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .unwrapTreasuryWsol()
      .accounts({
        payer,
        exptConfig,
        treasury: treasuryPda,
        treasuryWsolAta,
        tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
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
   * Note: Pool parameters (sqrtPrice, liquidity, price range) are computed
   * on-chain from treasury balances. Only activation_point is needed from caller.
   */
  async launchPool(
    payer: PublicKey,
    exptConfig: PublicKey,
    args: {
      activationPoint: BN | null;
    },
    dammAccounts: {
      positionNftMint: PublicKey;
      dammPoolAuthority: PublicKey;
      dammPool: PublicKey;
      dammPosition: PublicKey;
      positionNftAccount: PublicKey;
      tokenAMint: PublicKey;
      tokenBMint: PublicKey;
      tokenAVault: PublicKey;
      tokenBVault: PublicKey;
      treasuryTokenA: PublicKey;
      treasuryTokenB: PublicKey;
      tokenAProgram: PublicKey;
      tokenBProgram: PublicKey;
      token2022Program: PublicKey;
      dammV2Program: PublicKey;
      eventAuthority: PublicKey;
    }
  ): Promise<TransactionInstruction> {
    const [treasuryPda] = this.deriveTreasuryPda(exptConfig);

    return await (this.program.methods as any)
      .launchPool(args)
      .accounts({
        payer,
        exptConfig,
        treasury: treasuryPda,
        ...dammAccounts,
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
      dammPoolAuthority: PublicKey;
      dammPool: PublicKey;
      dammPosition: PublicKey;
      positionNftAccount: PublicKey;
      tokenAVault: PublicKey;
      tokenBVault: PublicKey;
      treasuryTokenA: PublicKey;
      treasuryTokenB: PublicKey;
      tokenAMint: PublicKey;
      tokenBMint: PublicKey;
      tokenAProgram: PublicKey;
      tokenBProgram: PublicKey;
      dammV2Program: PublicKey;
      eventAuthority: PublicKey;
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

  // -------------------------------------------------------------------------
  // Meteora Presale helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch and parse a Meteora Presale account by its PDA address.
   */
  async fetchPresaleState(
    presale: PublicKey
  ): Promise<ParsedPresaleState | null> {
    const connection = this.program.provider.connection;
    const info = await connection.getAccountInfo(presale);
    if (!info) return null;
    return parsePresaleState(info.data);
  }

  /**
   * Build createPermissionlessEscrow instruction.
   * Must be called once per depositor before their first deposit.
   */
  buildCreateEscrowIx(params: {
    presale: PublicKey;
    owner: PublicKey;
    payer: PublicKey;
    registryIndex?: number;
  }): TransactionInstruction {
    const disc = anchorDiscriminator("create_permissionless_escrow");

    const [escrowPda] = deriveEscrowPda(
      params.presale,
      params.owner,
      params.registryIndex ?? 0
    );

    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      PRESALE_PROGRAM_ID
    );

    return new TransactionInstruction({
      programId: PRESALE_PROGRAM_ID,
      keys: [
        { pubkey: params.presale, isSigner: false, isWritable: true },
        { pubkey: escrowPda, isSigner: false, isWritable: true },
        { pubkey: params.owner, isSigner: false, isWritable: false },
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        // #[event_cpi]
        { pubkey: eventAuthority, isSigner: false, isWritable: false },
        { pubkey: PRESALE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: disc,
    });
  }

  /**
   * Build deposit instruction for the Meteora presale.
   */
  buildDepositIx(params: {
    presale: PublicKey;
    quoteTokenVault: PublicKey;
    quoteMint: PublicKey;
    escrow: PublicKey;
    payerQuoteToken: PublicKey;
    payer: PublicKey;
    tokenProgram: PublicKey;
    maxAmount: BN;
  }): TransactionInstruction {
    const disc = anchorDiscriminator("deposit");

    // max_amount: u64 (LE)
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(params.maxAmount.toString()), 0);

    // RemainingAccountsInfo — empty for SPL Token
    const remainingInfo = serializeRemainingAccountsInfo([
      { accountsType: 1, length: 0 }, // TransferHookQuote, 0 accounts
    ]);

    const data = Buffer.concat([disc, amountBuf, remainingInfo]);

    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      PRESALE_PROGRAM_ID
    );

    return new TransactionInstruction({
      programId: PRESALE_PROGRAM_ID,
      keys: [
        { pubkey: params.presale, isSigner: false, isWritable: true },
        { pubkey: params.quoteTokenVault, isSigner: false, isWritable: true },
        { pubkey: params.quoteMint, isSigner: false, isWritable: false },
        { pubkey: params.escrow, isSigner: false, isWritable: true },
        { pubkey: params.payerQuoteToken, isSigner: false, isWritable: true },
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
        // #[event_cpi]
        { pubkey: eventAuthority, isSigner: false, isWritable: false },
        { pubkey: PRESALE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build withdraw instruction for the Meteora presale.
   * Allows a depositor to reclaim their SOL after a failed presale.
   */
  buildWithdrawIx(params: {
    presale: PublicKey;
    quoteTokenVault: PublicKey;
    quoteMint: PublicKey;
    escrow: PublicKey;
    payerQuoteToken: PublicKey;
    payer: PublicKey;
    tokenProgram: PublicKey;
    maxAmount: BN;
  }): TransactionInstruction {
    const disc = anchorDiscriminator("withdraw");

    // max_amount: u64 (LE)
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(params.maxAmount.toString()), 0);

    // RemainingAccountsInfo — empty for SPL Token
    const remainingInfo = serializeRemainingAccountsInfo([
      { accountsType: 1, length: 0 }, // TransferHookQuote, 0 accounts
    ]);

    const data = Buffer.concat([disc, amountBuf, remainingInfo]);

    const [eventAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("__event_authority")],
      PRESALE_PROGRAM_ID
    );

    return new TransactionInstruction({
      programId: PRESALE_PROGRAM_ID,
      keys: [
        { pubkey: params.presale, isSigner: false, isWritable: true },
        { pubkey: params.quoteTokenVault, isSigner: false, isWritable: true },
        { pubkey: params.quoteMint, isSigner: false, isWritable: false },
        { pubkey: params.escrow, isSigner: false, isWritable: true },
        { pubkey: params.payerQuoteToken, isSigner: false, isWritable: true },
        { pubkey: params.payer, isSigner: true, isWritable: true },
        { pubkey: params.tokenProgram, isSigner: false, isWritable: false },
        // #[event_cpi]
        { pubkey: eventAuthority, isSigner: false, isWritable: false },
        { pubkey: PRESALE_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Compute the 8-byte Anchor instruction discriminator. */
function anchorDiscriminator(ixName: string): Buffer {
  const hash = createHash("sha256").update(`global:${ixName}`).digest();
  return hash.subarray(0, 8);
}

/**
 * Borsh-serialize RemainingAccountsInfo.
 * Format: Vec<{accounts_type: enum(u32), length: u8}>
 */
function serializeRemainingAccountsInfo(
  slices: Array<{ accountsType: number; length: number }>
): Buffer {
  const buf = Buffer.alloc(4 + slices.length * 5);
  buf.writeUInt32LE(slices.length, 0);
  let offset = 4;
  for (const s of slices) {
    buf.writeUInt32LE(s.accountsType, offset);
    offset += 4;
    buf.writeUInt8(s.length, offset);
    offset += 1;
  }
  return buf;
}
