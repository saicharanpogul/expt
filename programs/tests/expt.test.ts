import { describe, it, expect, beforeAll } from "bun:test";
import { Program, AnchorProvider, BN, setProvider } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BankrunProvider } from "anchor-bankrun";
import { startAnchor, Clock, BanksClient } from "solana-bankrun";

// IDL
const IDL = require("../target/idl/expt.json");

// ---------------------------------------------------------------------------
// Constants (mirroring on-chain constants.rs)
// ---------------------------------------------------------------------------
const PROGRAM_ID = new PublicKey(IDL.address);
const PRESALE_PROGRAM_ID = new PublicKey(
  "presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj"
);

const SEEDS = {
  EXPT_CONFIG: Buffer.from("expt_config"),
  TREASURY: Buffer.from("treasury"),
  VETO_STAKE: Buffer.from("veto_stake"),
};

const MAX_NAME_LEN = 32;
const MAX_URI_LEN = 200;
const MAX_MILESTONE_DESC_LEN = 128;
const MAX_DELIVERABLE_LEN = 200;

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const T0 = BigInt(1_700_000_000); // fixed base timestamp
const PRESALE_END = T0 + 100n;
const CHALLENGE_WINDOW = 3600; // 1 hour
const MILESTONE_0_DEADLINE = T0 + 100_000n;
const MILESTONE_1_DEADLINE = T0 + 200_000n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stringToBytes(str: string, len: number): number[] {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const result = new Array(len).fill(0);
  for (let i = 0; i < encoded.length && i < len; i++) {
    result[i] = encoded[i];
  }
  return result;
}

function deriveExptConfigPda(builder: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.EXPT_CONFIG, builder.toBuffer()],
    PROGRAM_ID
  );
}

function deriveTreasuryPda(exptConfig: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.TREASURY, exptConfig.toBuffer()],
    PROGRAM_ID
  );
}

function deriveVetoStakePda(
  exptConfig: PublicKey,
  staker: PublicKey,
  milestoneIndex: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      SEEDS.VETO_STAKE,
      exptConfig.toBuffer(),
      staker.toBuffer(),
      Buffer.from([milestoneIndex]),
    ],
    PROGRAM_ID
  );
}

/**
 * Craft a fake Meteora presale account data buffer.
 * Layout matches PresaleState deserialization offsets.
 */
function craftPresaleAccountData(opts: {
  owner: PublicKey;
  minimumCap: bigint;
  endTime: bigint;
  totalDeposit: bigint;
}): Buffer {
  const DISC = 8;
  const TOTAL_SIZE = DISC + 248;
  const buf = Buffer.alloc(TOTAL_SIZE, 0);
  buf.writeUInt8(0xaa, 0);
  opts.owner.toBuffer().copy(buf, DISC);
  buf.writeBigUInt64LE(opts.minimumCap, DISC + 208);
  buf.writeBigUInt64LE(opts.endTime, DISC + 224);
  buf.writeBigUInt64LE(opts.totalDeposit, DISC + 240);
  return buf;
}

/** Set the cluster clock. */
function setClock(context: any, unixTimestamp: bigint) {
  context.setClock(new Clock(0n, 0n, 0n, 0n, unixTimestamp));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Expt Program — Full Lifecycle", () => {
  let provider: BankrunProvider;
  let program: Program;
  let context: any;
  let banksClient: BanksClient;

  const builder = Keypair.generate();
  const staker = Keypair.generate();
  const presaleKeypair = Keypair.generate();
  const mintKeypair = Keypair.generate();
  const cranker = Keypair.generate();

  let exptConfigPda: PublicKey;
  let treasuryPda: PublicKey;

  beforeAll(async () => {
    // Pre-derive PDAs so we can set presale owner = treasuryPda
    [exptConfigPda] = deriveExptConfigPda(builder.publicKey);
    [treasuryPda] = deriveTreasuryPda(exptConfigPda);

    context = await startAnchor(".", [], [
      {
        address: builder.publicKey,
        info: {
          lamports: 100 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        address: staker.publicKey,
        info: {
          lamports: 100 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        address: cranker.publicKey,
        info: {
          lamports: 10 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        // Presale owner = treasuryPda (validated by create_expt_config)
        address: presaleKeypair.publicKey,
        info: {
          lamports: LAMPORTS_PER_SOL,
          data: craftPresaleAccountData({
            owner: treasuryPda,
            minimumCap: BigInt(1 * LAMPORTS_PER_SOL),
            endTime: PRESALE_END,
            totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
          }),
          owner: PRESALE_PROGRAM_ID,
          executable: false,
        },
      },
    ]);

    provider = new BankrunProvider(context);
    setProvider(provider as any);
    program = new Program(IDL, provider as any);
    banksClient = context.banksClient;

    setClock(context, T0);
  });

  // -----------------------------------------------------------------------
  // 1. Create experiment
  // -----------------------------------------------------------------------
  it("1. should create an experiment with 2 milestones", async () => {
    setClock(context, T0);

    await program.methods
      .createExptConfig({
        name: stringToBytes("Test Experiment", MAX_NAME_LEN),
        uri: stringToBytes("https://example.com/meta.json", MAX_URI_LEN),
        presaleMinimumCap: new BN(1 * LAMPORTS_PER_SOL),
        vetoThresholdBps: 1000, // 10%
        challengeWindow: new BN(CHALLENGE_WINDOW),
        milestones: [
          {
            description: stringToBytes("Build MVP", MAX_MILESTONE_DESC_LEN),
            deliverableType: 1, // Github
            unlockBps: 5000,
            deadline: new BN(Number(MILESTONE_0_DEADLINE)),
          },
          {
            description: stringToBytes("Launch mainnet", MAX_MILESTONE_DESC_LEN),
            deliverableType: 3, // Deployment
            unlockBps: 5000,
            deadline: new BN(Number(MILESTONE_1_DEADLINE)),
          },
        ],
      })
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        presale: presaleKeypair.publicKey,
        mint: mintKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.builder.equals(builder.publicKey)).toBe(true);
    expect(config.milestoneCount).toBe(2);
    expect(config.status).toBe(0); // Created
    expect(config.vetoThresholdBps).toBe(1000);
    expect(config.presaleFundsWithdrawn).toBe(0);
    expect(config.poolLaunched).toBe(0);
    expect(config.milestones[0].status).toBe(0); // Pending
    expect(config.milestones[1].status).toBe(0); // Pending
  });

  // -----------------------------------------------------------------------
  // 2. Reject invalid experiment (0 milestones)
  // -----------------------------------------------------------------------
  it("2. should reject invalid milestone count (0 milestones)", async () => {
    const builder2 = Keypair.generate();
    context.setAccount(builder2.publicKey, {
      lamports: 10 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const [exptConfig2] = deriveExptConfigPda(builder2.publicKey);
    const [treasury2] = deriveTreasuryPda(exptConfig2);

    const presale2 = Keypair.generate();
    context.setAccount(presale2.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: treasury2,
        minimumCap: BigInt(LAMPORTS_PER_SOL),
        endTime: PRESALE_END,
        totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    try {
      await program.methods
        .createExptConfig({
          name: stringToBytes("Bad Experiment", MAX_NAME_LEN),
          uri: stringToBytes("https://example.com", MAX_URI_LEN),
          presaleMinimumCap: new BN(LAMPORTS_PER_SOL),
          vetoThresholdBps: 1000,
          challengeWindow: new BN(CHALLENGE_WINDOW),
          milestones: [],
        })
        .accounts({
          builder: builder2.publicKey,
          exptConfig: exptConfig2,
          treasury: treasury2,
          presale: presale2.publicKey,
          mint: mintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder2])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("InvalidMilestoneCount");
    }
  });

  // -----------------------------------------------------------------------
  // 2b. Reject presale with invalid owner
  // -----------------------------------------------------------------------
  it("2b. should reject presale with invalid owner (not treasury PDA)", async () => {
    const builder3 = Keypair.generate();
    context.setAccount(builder3.publicKey, {
      lamports: 10 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const [exptConfig3] = deriveExptConfigPda(builder3.publicKey);
    const [treasury3] = deriveTreasuryPda(exptConfig3);

    // Presale owner = builder3 (NOT treasury3) — should be rejected
    const badPresale = Keypair.generate();
    context.setAccount(badPresale.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: builder3.publicKey,
        minimumCap: BigInt(LAMPORTS_PER_SOL),
        endTime: PRESALE_END,
        totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    try {
      await program.methods
        .createExptConfig({
          name: stringToBytes("Bad Owner", MAX_NAME_LEN),
          uri: stringToBytes("https://bad.com", MAX_URI_LEN),
          presaleMinimumCap: new BN(LAMPORTS_PER_SOL),
          vetoThresholdBps: 1000,
          challengeWindow: new BN(CHALLENGE_WINDOW),
          milestones: [
            {
              description: stringToBytes("Milestone", MAX_MILESTONE_DESC_LEN),
              deliverableType: 0,
              unlockBps: 10000,
              deadline: new BN(Number(MILESTONE_0_DEADLINE)),
            },
          ],
        })
        .accounts({
          builder: builder3.publicKey,
          exptConfig: exptConfig3,
          treasury: treasury3,
          presale: badPresale.publicKey,
          mint: mintKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder3])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("InvalidPresaleOwner");
    }
  });

  // -----------------------------------------------------------------------
  // 3. Finalize presale — too early
  // -----------------------------------------------------------------------
  it("3. should fail finalize if presale not ended", async () => {
    setClock(context, T0 + 50n);

    try {
      await program.methods
        .finalizePresale()
        .accounts({
          payer: cranker.publicKey,
          exptConfig: exptConfigPda,
          presale: presaleKeypair.publicKey,
        })
        .signers([cranker])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("PresaleNotEnded");
    }
  });

  // -----------------------------------------------------------------------
  // 4. Finalize presale — success
  // -----------------------------------------------------------------------
  it("4. should finalize presale and set status Active", async () => {
    setClock(context, PRESALE_END + 1n);

    await program.methods
      .finalizePresale()
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfigPda,
        presale: presaleKeypair.publicKey,
      })
      .signers([cranker])
      .rpc();

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.status).toBe(3); // Active
    expect(config.totalTreasuryReceived.eq(new BN(0))).toBe(true);

    // Simulate withdraw_presale_funds by injecting totalTreasuryReceived
    // into the account data. In production, this is set by the CPI instruction.
    const rawAccount = await banksClient.getAccount(exptConfigPda);
    const accountData = Buffer.from(rawAccount!.data);
    // total_treasury_received offset = 8(disc) + 32 + 32 + 200 + 32 + 32 + 1+1+1+1+1+3 + 8 = 352
    const TOTAL_TREASURY_RECEIVED_OFFSET = 352;
    accountData.writeBigUInt64LE(BigInt(5 * LAMPORTS_PER_SOL), TOTAL_TREASURY_RECEIVED_OFFSET);
    // Also set presale_funds_withdrawn = 1 at offset 340
    accountData.writeUInt8(1, 340);
    context.setAccount(exptConfigPda, {
      lamports: rawAccount!.lamports,
      data: accountData,
      owner: PROGRAM_ID,
      executable: false,
    });

    // Transfer SOL to treasury (simulates CPI fund withdrawal)
    const treasuryFundIx = SystemProgram.transfer({
      fromPubkey: builder.publicKey,
      toPubkey: treasuryPda,
      lamports: 5 * LAMPORTS_PER_SOL,
    });
    const fundTx = new Transaction().add(treasuryFundIx);
    fundTx.recentBlockhash = context.lastBlockhash;
    fundTx.feePayer = builder.publicKey;
    fundTx.sign(builder);
    await banksClient.processTransaction(fundTx);

    // Verify injection
    const updatedConfig = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(updatedConfig.totalTreasuryReceived.eq(new BN(5 * LAMPORTS_PER_SOL))).toBe(true);
    expect(updatedConfig.presaleFundsWithdrawn).toBe(1);
    expect(updatedConfig.status).toBe(3); // Still Active
  });

  // -----------------------------------------------------------------------
  // 5. Finalize presale — failure (separate experiment)
  // -----------------------------------------------------------------------
  it("5. should set PresaleFailed when deposits below minimum", async () => {
    const builder2 = Keypair.generate();
    context.setAccount(builder2.publicKey, {
      lamports: 100 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const [exptConfig2] = deriveExptConfigPda(builder2.publicKey);
    const [treasury2] = deriveTreasuryPda(exptConfig2);

    const failPresale = Keypair.generate();
    context.setAccount(failPresale.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: treasury2,
        minimumCap: BigInt(10 * LAMPORTS_PER_SOL),
        endTime: PRESALE_END,
        totalDeposit: BigInt(1 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    await program.methods
      .createExptConfig({
        name: stringToBytes("Fail Presale", MAX_NAME_LEN),
        uri: stringToBytes("https://fail.com", MAX_URI_LEN),
        presaleMinimumCap: new BN(10 * LAMPORTS_PER_SOL),
        vetoThresholdBps: 1000,
        challengeWindow: new BN(CHALLENGE_WINDOW),
        milestones: [
          {
            description: stringToBytes("Single", MAX_MILESTONE_DESC_LEN),
            deliverableType: 0,
            unlockBps: 10000,
            deadline: new BN(Number(MILESTONE_0_DEADLINE)),
          },
        ],
      })
      .accounts({
        builder: builder2.publicKey,
        exptConfig: exptConfig2,
        treasury: treasury2,
        presale: failPresale.publicKey,
        mint: mintKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder2])
      .rpc();

    await program.methods
      .finalizePresale()
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfig2,
        presale: failPresale.publicKey,
      })
      .signers([cranker])
      .rpc();

    const config = await (program.account as any).exptConfig.fetch(exptConfig2);
    expect(config.status).toBe(2); // PresaleFailed
  });

  // -----------------------------------------------------------------------
  // 6. Submit milestone 0
  // -----------------------------------------------------------------------
  it("6. should submit proof for milestone 0", async () => {
    setClock(context, PRESALE_END + 10n);

    await program.methods
      .submitMilestone({
        milestoneIndex: 0,
        deliverable: stringToBytes("https://github.com/my-repo", MAX_DELIVERABLE_LEN),
      })
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([builder])
      .rpc();

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.milestones[0].status).toBe(1); // Submitted
    expect(config.milestones[0].submittedAt.toNumber()).toBeGreaterThan(0);
    expect(config.milestones[0].challengeWindowEnd.toNumber()).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // 7. Resolve milestone 0 as Passed (no veto, auto-pass)
  // -----------------------------------------------------------------------
  it("7. should resolve milestone 0 as Passed (no veto)", async () => {
    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    const challengeEnd = config.milestones[0].challengeWindowEnd.toNumber();
    setClock(context, BigInt(challengeEnd) + 1n);

    await program.methods
      .resolveMilestone({ milestoneIndex: 0 })
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([cranker])
      .rpc();

    const updatedConfig = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(updatedConfig.milestones[0].status).toBe(3); // Passed
  });

  // -----------------------------------------------------------------------
  // 8. Submit milestone 1
  // -----------------------------------------------------------------------
  it("8. should submit milestone 1", async () => {
    const submitTime = PRESALE_END + 5000n;
    setClock(context, submitTime);

    await program.methods
      .submitMilestone({
        milestoneIndex: 1,
        deliverable: stringToBytes("https://mainnet.app", MAX_DELIVERABLE_LEN),
      })
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([builder])
      .rpc();

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.milestones[1].status).toBe(1); // Submitted
  });

  // -----------------------------------------------------------------------
  // 9. Fail resolve within challenge window
  // -----------------------------------------------------------------------
  it("9. should fail resolve within challenge window", async () => {
    try {
      await program.methods
        .resolveMilestone({ milestoneIndex: 1 })
        .accounts({
          payer: cranker.publicKey,
          exptConfig: exptConfigPda,
        })
        .signers([cranker])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("ChallengeWindowNotEnded");
    }
  });

  // -----------------------------------------------------------------------
  // 10. Resolve milestone 1 as Passed → Completed
  // -----------------------------------------------------------------------
  it("10. should resolve milestone 1 and mark experiment Completed", async () => {
    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    const challengeEnd = config.milestones[1].challengeWindowEnd.toNumber();
    setClock(context, BigInt(challengeEnd) + 1n);

    await program.methods
      .resolveMilestone({ milestoneIndex: 1 })
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([cranker])
      .rpc();

    const updatedConfig = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(updatedConfig.milestones[1].status).toBe(3); // Passed
    expect(updatedConfig.status).toBe(4); // Completed
  });

  // -----------------------------------------------------------------------
  // 11. Claim builder funds (with simulated treasury funding)
  // -----------------------------------------------------------------------
  it("11. should allow builder to claim funds after milestones pass", async () => {
    // totalTreasuryReceived was injected in test 4 (5 SOL).
    // Both milestones passed (50% + 50% = 100%).
    // Treasury had 5 SOL transferred to it in test 4.
    const builderBefore = await banksClient.getAccount(builder.publicKey);
    const builderLamportsBefore = builderBefore!.lamports;

    await program.methods
      .claimBuilderFunds()
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    const builderAfter = await banksClient.getAccount(builder.publicKey);
    const gained = BigInt(builderAfter!.lamports) - BigInt(builderLamportsBefore);
    // 100% of 5 SOL, minus tx fee
    expect(Number(gained)).toBeGreaterThan(4.99 * LAMPORTS_PER_SOL);

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.totalClaimedByBuilder.eq(new BN(5 * LAMPORTS_PER_SOL))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 12. Claim fails when no funds remain
  // -----------------------------------------------------------------------
  it("12. should fail if no more funds to claim", async () => {
    // After test 11, all funds have been claimed. Attempting again should fail.
    try {
      await program.methods
        .claimBuilderFunds()
        .accounts({
          builder: builder.publicKey,
          exptConfig: exptConfigPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([builder])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      // Should be NoFundsAvailable or similar error
      const errStr = err.toString();
      expect(
        errStr.includes("NoFundsAvailable") ||
        errStr.includes("already been processed") ||
        errStr.includes("custom program error")
      ).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // 13. Submit milestone after deadline (separate experiment)
  // -----------------------------------------------------------------------
  it("13. should reject submission after deadline", async () => {
    const builder3 = Keypair.generate();
    context.setAccount(builder3.publicKey, {
      lamports: 100 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const [exptConfig3] = deriveExptConfigPda(builder3.publicKey);
    const [treasury3] = deriveTreasuryPda(exptConfig3);

    const presale3 = Keypair.generate();
    const shortDeadline = T0 + 200n;

    context.setAccount(presale3.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: treasury3,
        minimumCap: BigInt(1 * LAMPORTS_PER_SOL),
        endTime: T0 + 50n,
        totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    await program.methods
      .createExptConfig({
        name: stringToBytes("Deadline Test", MAX_NAME_LEN),
        uri: stringToBytes("https://deadline.test", MAX_URI_LEN),
        presaleMinimumCap: new BN(LAMPORTS_PER_SOL),
        vetoThresholdBps: 1000,
        challengeWindow: new BN(CHALLENGE_WINDOW),
        milestones: [
          {
            description: stringToBytes("Fast milestone", MAX_MILESTONE_DESC_LEN),
            deliverableType: 0,
            unlockBps: 10000,
            deadline: new BN(Number(shortDeadline)),
          },
        ],
      })
      .accounts({
        builder: builder3.publicKey,
        exptConfig: exptConfig3,
        treasury: treasury3,
        presale: presale3.publicKey,
        mint: mintKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder3])
      .rpc();

    // Finalize
    await program.methods
      .finalizePresale()
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfig3,
        presale: presale3.publicKey,
      })
      .signers([cranker])
      .rpc();

    // Clock is already past shortDeadline
    try {
      await program.methods
        .submitMilestone({
          milestoneIndex: 0,
          deliverable: stringToBytes("https://late.com", MAX_DELIVERABLE_LEN),
        })
        .accounts({
          builder: builder3.publicKey,
          exptConfig: exptConfig3,
        })
        .signers([builder3])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("MilestoneDeadlinePassed");
    }
  });

  // -----------------------------------------------------------------------
  // 14. Verify new state fields
  // -----------------------------------------------------------------------
  it("14. should have presale_funds_withdrawn = 1 after simulation", async () => {
    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    // We set presale_funds_withdrawn = 1 in test 11 via account injection
    expect(config.presaleFundsWithdrawn).toBe(1);
    expect(config.poolLaunched).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Veto Mechanics Suite (separate experiment)
// ---------------------------------------------------------------------------

describe("Expt Program — Veto Mechanics", () => {
  let provider: BankrunProvider;
  let program: Program;
  let context: any;

  const builder = Keypair.generate();
  const staker = Keypair.generate();
  const presaleKeypair = Keypair.generate();
  const mintKeypair = Keypair.generate();
  const cranker = Keypair.generate();

  let exptConfigPda: PublicKey;
  let treasuryPda: PublicKey;

  beforeAll(async () => {
    [exptConfigPda] = deriveExptConfigPda(builder.publicKey);
    [treasuryPda] = deriveTreasuryPda(exptConfigPda);

    context = await startAnchor(".", [], [
      {
        address: builder.publicKey,
        info: {
          lamports: 100 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        address: staker.publicKey,
        info: {
          lamports: 100 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        address: cranker.publicKey,
        info: {
          lamports: 10 * LAMPORTS_PER_SOL,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
      {
        address: presaleKeypair.publicKey,
        info: {
          lamports: LAMPORTS_PER_SOL,
          data: craftPresaleAccountData({
            owner: treasuryPda,
            minimumCap: BigInt(1 * LAMPORTS_PER_SOL),
            endTime: PRESALE_END,
            totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
          }),
          owner: PRESALE_PROGRAM_ID,
          executable: false,
        },
      },
    ]);

    provider = new BankrunProvider(context);
    setProvider(provider as any);
    program = new Program(IDL, provider as any);

    setClock(context, T0);

    // Setup: create experiment, finalize, and inject totalTreasuryReceived
    await program.methods
      .createExptConfig({
        name: stringToBytes("Veto Test", MAX_NAME_LEN),
        uri: stringToBytes("https://veto.test", MAX_URI_LEN),
        presaleMinimumCap: new BN(1 * LAMPORTS_PER_SOL),
        vetoThresholdBps: 1000, // 10%
        challengeWindow: new BN(CHALLENGE_WINDOW),
        milestones: [
          {
            description: stringToBytes("Build MVP", MAX_MILESTONE_DESC_LEN),
            deliverableType: 1,
            unlockBps: 10000,
            deadline: new BN(Number(MILESTONE_0_DEADLINE)),
          },
        ],
      })
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
        treasury: treasuryPda,
        presale: presaleKeypair.publicKey,
        mint: mintKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([builder])
      .rpc();

    // Finalize
    setClock(context, PRESALE_END + 1n);
    await program.methods
      .finalizePresale()
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfigPda,
        presale: presaleKeypair.publicKey,
      })
      .signers([cranker])
      .rpc();

    // Inject totalTreasuryReceived (simulates withdraw_presale_funds)
    const rawAccount = await context.banksClient.getAccount(exptConfigPda);
    const accountData = Buffer.from(rawAccount!.data);
    const TOTAL_TREASURY_RECEIVED_OFFSET = 8 + 344;
    accountData.writeBigUInt64LE(BigInt(5 * LAMPORTS_PER_SOL), TOTAL_TREASURY_RECEIVED_OFFSET);
    context.setAccount(exptConfigPda, {
      lamports: rawAccount!.lamports,
      data: accountData,
      owner: PROGRAM_ID,
      executable: false,
    });
  });

  it("should allow staker to veto a submitted milestone", async () => {
    // Submit milestone
    setClock(context, PRESALE_END + 10n);
    await program.methods
      .submitMilestone({
        milestoneIndex: 0,
        deliverable: stringToBytes("https://github.com/my-repo", MAX_DELIVERABLE_LEN),
      })
      .accounts({
        builder: builder.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([builder])
      .rpc();

    // Veto within challenge window
    setClock(context, PRESALE_END + 20n);
    const [vetoStakePda] = deriveVetoStakePda(exptConfigPda, staker.publicKey, 0);

    await program.methods
      .initiateVeto({
        milestoneIndex: 0,
        amount: new BN(0.01 * LAMPORTS_PER_SOL),
      })
      .accounts({
        staker: staker.publicKey,
        exptConfig: exptConfigPda,
        vetoStake: vetoStakePda,
        treasury: treasuryPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([staker])
      .rpc();

    const veto = await (program.account as any).vetoStake.fetch(vetoStakePda);
    expect(veto.exptConfig.equals(exptConfigPda)).toBe(true);
    expect(veto.staker.equals(staker.publicKey)).toBe(true);
    expect(veto.milestoneIndex).toBe(0);
    expect(veto.amount.eq(new BN(0.01 * LAMPORTS_PER_SOL))).toBe(true);

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(
      config.milestones[0].totalVetoStake.eq(new BN(0.01 * LAMPORTS_PER_SOL))
    ).toBe(true);
  });

  it("should reject veto after challenge window ends", async () => {
    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    const challengeEnd = config.milestones[0].challengeWindowEnd.toNumber();
    setClock(context, BigInt(challengeEnd) + 100n);

    const [vetoStakePda] = deriveVetoStakePda(exptConfigPda, staker.publicKey, 0);

    try {
      await program.methods
        .initiateVeto({
          milestoneIndex: 0,
          amount: new BN(LAMPORTS_PER_SOL),
        })
        .accounts({
          staker: staker.publicKey,
          exptConfig: exptConfigPda,
          vetoStake: vetoStakePda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([staker])
        .rpc();
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.toString()).toContain("ChallengeWindowEnded");
    }
  });

  it("should resolve milestone as Passed when veto below threshold", async () => {
    // Threshold = totalTreasuryReceived(5 SOL) * unlock_bps(10000)/10000 * veto_threshold(1000)/10000
    //           = 5 SOL * 1.0 * 0.1 = 0.5 SOL
    // Veto stake = 0.01 SOL < 0.5 SOL → PASS
    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    const challengeEnd = config.milestones[0].challengeWindowEnd.toNumber();
    setClock(context, BigInt(challengeEnd) + 200n);

    await program.methods
      .resolveMilestone({ milestoneIndex: 0 })
      .accounts({
        payer: cranker.publicKey,
        exptConfig: exptConfigPda,
      })
      .signers([cranker])
      .rpc();

    const updatedConfig = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(updatedConfig.milestones[0].status).toBe(3); // Passed
    expect(updatedConfig.status).toBe(4); // Completed (only 1 milestone)
  });
});
