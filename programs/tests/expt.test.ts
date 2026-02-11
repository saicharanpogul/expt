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
// Timeline (all tests use monotonically increasing timestamps)
// ---------------------------------------------------------------------------
// T0         = NOW (create experiment)
// T1         = T0+100   (presale ends)
// T2         = T1+1     (finalize, submit milestone 0)
// T3         = T2+1     (initiate veto — within challenge window)
// T4         = T2+3700  (challenge window ends for milestone 0, resolve)
// T5         = T4+1     (submit + resolve milestone 1)
// T6         = T5+3700  (resolve milestone 1)
// T7         = T6+1     (claim builder funds)
// ---------------------------------------------------------------------------
const T0 = BigInt(1_700_000_000); // fixed base timestamp
const PRESALE_END = T0 + 100n;
const CHALLENGE_WINDOW = 3600; // 1 hour
const MILESTONE_0_DEADLINE = T0 + 100_000n; // far in the future
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

/** Set the cluster clock (monotonically forward only). */
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
            owner: builder.publicKey,
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

    [exptConfigPda] = deriveExptConfigPda(builder.publicKey);
    [treasuryPda] = deriveTreasuryPda(exptConfigPda);

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
          presale: presaleKeypair.publicKey,
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
  // 3. Finalize presale — too early
  // -----------------------------------------------------------------------
  it("3. should fail finalize if presale not ended", async () => {
    setClock(context, T0 + 50n); // before PRESALE_END

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
    expect(config.totalTreasuryReceived.eq(new BN(5 * LAMPORTS_PER_SOL))).toBe(true);
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

    const failPresale = Keypair.generate();
    context.setAccount(failPresale.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: builder2.publicKey,
        minimumCap: BigInt(10 * LAMPORTS_PER_SOL),
        endTime: PRESALE_END,
        totalDeposit: BigInt(1 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    const [exptConfig2] = deriveExptConfigPda(builder2.publicKey);
    const [treasury2] = deriveTreasuryPda(exptConfig2);

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
  // 7. Initiate veto on milestone 0 (within challenge window)
  // -----------------------------------------------------------------------
  it("7. should allow staker to veto a submitted milestone", async () => {
    // Clock is at PRESALE_END+10, challenge window ends at PRESALE_END+10+3600
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

  // -----------------------------------------------------------------------
  // 8. Reject veto after challenge window
  // -----------------------------------------------------------------------
  it("8. should reject veto after challenge window ends", async () => {
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

  // -----------------------------------------------------------------------
  // 9. Resolve milestone 0 as Passed (veto below threshold)
  // -----------------------------------------------------------------------
  it("9. should resolve milestone 0 as Passed (veto below threshold)", async () => {
    // Clock already past challenge window from test 8
    // Threshold = 5 SOL * 5000/10000 * 1000/10000 = 0.25 SOL
    // Veto = 0.01 SOL < 0.25 SOL → PASS
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
  });

  // -----------------------------------------------------------------------
  // 10. Submit milestone 1 + resolve (no challenge window test inline)
  // -----------------------------------------------------------------------
  it("10. should submit milestone 1 and fail resolve within window", async () => {
    // Submit
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

    // Try resolving immediately — should fail
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
  // 11. Resolve milestone 1 as Passed (no veto) → Completed
  // -----------------------------------------------------------------------
  it("11. should resolve milestone 1 and mark experiment Completed", async () => {
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
  // 12. Submit milestone after deadline (use separate experiment)
  // -----------------------------------------------------------------------
  it("12. should reject submission after deadline", async () => {
    // Use a separate experiment with a short deadline
    const builder3 = Keypair.generate();
    context.setAccount(builder3.publicKey, {
      lamports: 100 * LAMPORTS_PER_SOL,
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    const presale3 = Keypair.generate();
    const shortDeadline = T0 + 200n; // way in the past by now

    context.setAccount(presale3.publicKey, {
      lamports: LAMPORTS_PER_SOL,
      data: craftPresaleAccountData({
        owner: builder3.publicKey,
        minimumCap: BigInt(1 * LAMPORTS_PER_SOL),
        endTime: T0 + 50n,
        totalDeposit: BigInt(5 * LAMPORTS_PER_SOL),
      }),
      owner: PRESALE_PROGRAM_ID,
      executable: false,
    });

    const [exptConfig3] = deriveExptConfigPda(builder3.publicKey);
    const [treasury3] = deriveTreasuryPda(exptConfig3);

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
  // 13. Claim builder funds
  // -----------------------------------------------------------------------
  it("13. should allow builder to claim funds after milestones pass", async () => {
    // Transfer SOL to treasury via system transfer
    const transferIx = SystemProgram.transfer({
      fromPubkey: builder.publicKey,
      toPubkey: treasuryPda,
      lamports: 5 * LAMPORTS_PER_SOL,
    });

    const tx = new Transaction().add(transferIx);
    tx.recentBlockhash = context.lastBlockhash;
    tx.feePayer = builder.publicKey;
    tx.sign(builder);
    await banksClient.processTransaction(tx);

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
    expect(Number(gained)).toBeGreaterThan(4.99 * LAMPORTS_PER_SOL);

    const config = await (program.account as any).exptConfig.fetch(exptConfigPda);
    expect(config.totalClaimedByBuilder.eq(new BN(5 * LAMPORTS_PER_SOL))).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 14. Claim fails when no funds remain
  // -----------------------------------------------------------------------
  it("14. should fail if no more funds to claim", async () => {
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
      expect(err.toString()).toContain("NoFundsAvailable");
    }
  });
});
