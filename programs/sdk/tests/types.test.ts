import { describe, it, expect } from "bun:test";
import BN from "bn.js";
import {
  bytesToString,
  stringToBytes,
  exptStatusLabel,
  milestoneStatusLabel,
  deliverableTypeLabel,
  ExptStatus,
  MilestoneStatus,
  DeliverableType,
  buildCreateExptConfigArgs,
  buildSubmitMilestoneArgs,
  parseMilestone,
  parseVetoStake,
  type RawMilestone,
  type RawVetoStake,
  MAX_NAME_LEN,
  MAX_URI_LEN,
  MAX_MILESTONE_DESC_LEN,
  MAX_DELIVERABLE_LEN,
} from "../src";
import { PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// bytesToString / stringToBytes
// ---------------------------------------------------------------------------

describe("Byte Helpers", () => {
  describe("bytesToString", () => {
    it("should convert null-padded byte array to string", () => {
      const bytes = [72, 101, 108, 108, 111, 0, 0, 0]; // "Hello\0\0\0"
      expect(bytesToString(bytes)).toBe("Hello");
    });

    it("should handle empty bytes", () => {
      const bytes = [0, 0, 0, 0];
      expect(bytesToString(bytes)).toBe("");
    });

    it("should handle full array (no nulls)", () => {
      const bytes = [65, 66, 67]; // "ABC"
      expect(bytesToString(bytes)).toBe("ABC");
    });

    it("should handle Uint8Array input", () => {
      const arr = new Uint8Array([72, 105, 0]);
      expect(bytesToString(arr)).toBe("Hi");
    });
  });

  describe("stringToBytes", () => {
    it("should convert string to null-padded byte array", () => {
      const result = stringToBytes("Hi", 5);
      expect(result).toEqual([72, 105, 0, 0, 0]);
      expect(result.length).toBe(5);
    });

    it("should throw if string exceeds max length", () => {
      expect(() => stringToBytes("A".repeat(33), 32)).toThrow(
        "exceeds max length"
      );
    });

    it("should handle empty string", () => {
      const result = stringToBytes("", 4);
      expect(result).toEqual([0, 0, 0, 0]);
    });

    it("should round-trip with bytesToString", () => {
      const original = "My Experiment";
      const bytes = stringToBytes(original, MAX_NAME_LEN);
      const recovered = bytesToString(bytes);
      expect(recovered).toBe(original);
    });

    it("should handle UTF-8 multibyte characters", () => {
      const emoji = "🚀";
      const bytes = stringToBytes(emoji, 10);
      const recovered = bytesToString(bytes);
      expect(recovered).toBe(emoji);
    });
  });
});

// ---------------------------------------------------------------------------
// Enum labels
// ---------------------------------------------------------------------------

describe("Enum Labels", () => {
  describe("exptStatusLabel", () => {
    it("should return correct labels for all statuses", () => {
      expect(exptStatusLabel(ExptStatus.Created)).toBe("Created");
      expect(exptStatusLabel(ExptStatus.PresaleActive)).toBe("Presale Active");
      expect(exptStatusLabel(ExptStatus.PresaleFailed)).toBe("Presale Failed");
      expect(exptStatusLabel(ExptStatus.Active)).toBe("Active");
      expect(exptStatusLabel(ExptStatus.Completed)).toBe("Completed");
    });

    it("should return Unknown for invalid status", () => {
      expect(exptStatusLabel(99)).toBe("Unknown(99)");
    });
  });

  describe("milestoneStatusLabel", () => {
    it("should return correct labels for all statuses", () => {
      expect(milestoneStatusLabel(MilestoneStatus.Pending)).toBe("Pending");
      expect(milestoneStatusLabel(MilestoneStatus.Submitted)).toBe("Submitted");
      expect(milestoneStatusLabel(MilestoneStatus.Challenged)).toBe(
        "Challenged"
      );
      expect(milestoneStatusLabel(MilestoneStatus.Passed)).toBe("Passed");
      expect(milestoneStatusLabel(MilestoneStatus.Failed)).toBe("Failed");
    });
  });

  describe("deliverableTypeLabel", () => {
    it("should return correct labels for all types", () => {
      expect(deliverableTypeLabel(DeliverableType.Url)).toBe("URL");
      expect(deliverableTypeLabel(DeliverableType.Github)).toBe("GitHub");
      expect(deliverableTypeLabel(DeliverableType.ProgramId)).toBe(
        "Program ID"
      );
      expect(deliverableTypeLabel(DeliverableType.Deployment)).toBe(
        "Deployment"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Arg builders
// ---------------------------------------------------------------------------

describe("Arg Builders", () => {
  describe("buildCreateExptConfigArgs", () => {
    it("should convert input to on-chain args format", () => {
      const deadline = new Date("2025-06-01T00:00:00Z");
      const args = buildCreateExptConfigArgs({
        name: "My Experiment",
        uri: "https://example.com/metadata.json",
        presaleMinimumCap: new BN(1_000_000_000),
        vetoThresholdBps: 1000,
        challengeWindow: new BN(86400),
        milestones: [
          {
            description: "Build MVP",
            deliverableType: DeliverableType.Github,
            unlockBps: 5000,
            deadline,
          },
          {
            description: "Launch mainnet",
            deliverableType: DeliverableType.Deployment,
            unlockBps: 5000,
            deadline: Math.floor(deadline.getTime() / 1000) + 86400 * 30,
          },
        ],
      });

      // Name should be 32 bytes, null-padded
      expect(args.name.length).toBe(MAX_NAME_LEN);
      expect(bytesToString(args.name)).toBe("My Experiment");

      // URI should be 200 bytes
      expect(args.uri.length).toBe(MAX_URI_LEN);
      expect(bytesToString(args.uri)).toBe(
        "https://example.com/metadata.json"
      );

      // Milestones
      expect(args.milestones.length).toBe(2);
      expect(args.milestones[0].description.length).toBe(MAX_MILESTONE_DESC_LEN);
      expect(bytesToString(args.milestones[0].description)).toBe("Build MVP");
      expect(args.milestones[0].deliverableType).toBe(DeliverableType.Github);
      expect(args.milestones[0].unlockBps).toBe(5000);

      // Deadline should be unix timestamp
      expect(args.milestones[0].deadline.toNumber()).toBe(
        Math.floor(deadline.getTime() / 1000)
      );
    });
  });

  describe("buildSubmitMilestoneArgs", () => {
    it("should convert input to on-chain args format", () => {
      const args = buildSubmitMilestoneArgs({
        milestoneIndex: 0,
        deliverable: "https://github.com/my-repo",
      });

      expect(args.milestoneIndex).toBe(0);
      expect(args.deliverable.length).toBe(MAX_DELIVERABLE_LEN);
      expect(bytesToString(args.deliverable)).toBe(
        "https://github.com/my-repo"
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

describe("Parsers", () => {
  describe("parseMilestone", () => {
    it("should parse raw milestone into human-readable format", () => {
      const raw: RawMilestone = {
        description: stringToBytes("Build MVP", MAX_MILESTONE_DESC_LEN),
        deliverableType: DeliverableType.Github,
        unlockBps: 5000,
        deadline: new BN(1700000000),
        status: MilestoneStatus.Submitted,
        submittedAt: new BN(1699900000),
        deliverable: stringToBytes(
          "https://github.com/repo",
          MAX_DELIVERABLE_LEN
        ),
        totalVetoStake: new BN(500_000_000),
        challengeWindowEnd: new BN(1699986400),
      };

      const parsed = parseMilestone(raw, 0);

      expect(parsed.index).toBe(0);
      expect(parsed.description).toBe("Build MVP");
      expect(parsed.deliverableType).toBe(DeliverableType.Github);
      expect(parsed.deliverableTypeLabel).toBe("GitHub");
      expect(parsed.unlockBps).toBe(5000);
      expect(parsed.unlockPercent).toBe(50);
      expect(parsed.status).toBe(MilestoneStatus.Submitted);
      expect(parsed.statusLabel).toBe("Submitted");
      expect(parsed.submittedAt).toBeInstanceOf(Date);
      expect(parsed.deliverable).toBe("https://github.com/repo");
      expect(parsed.totalVetoStake.eq(new BN(500_000_000))).toBe(true);
      expect(parsed.challengeWindowEnd).toBeInstanceOf(Date);
    });

    it("should return null dates for zero timestamps", () => {
      const raw: RawMilestone = {
        description: stringToBytes("Pending", MAX_MILESTONE_DESC_LEN),
        deliverableType: DeliverableType.Url,
        unlockBps: 10000,
        deadline: new BN(1700000000),
        status: MilestoneStatus.Pending,
        submittedAt: new BN(0),
        deliverable: stringToBytes("", MAX_DELIVERABLE_LEN),
        totalVetoStake: new BN(0),
        challengeWindowEnd: new BN(0),
      };

      const parsed = parseMilestone(raw, 0);
      expect(parsed.submittedAt).toBeNull();
      expect(parsed.challengeWindowEnd).toBeNull();
    });
  });

  describe("parseVetoStake", () => {
    it("should parse raw veto stake into readable format", () => {
      const exptConfig = PublicKey.unique();
      const staker = PublicKey.unique();
      const address = PublicKey.unique();

      const raw: RawVetoStake = {
        exptConfig,
        staker,
        milestoneIndex: 1,
        amount: new BN(1_000_000_000),
      };

      const parsed = parseVetoStake(raw, address);
      expect(parsed.address.equals(address)).toBe(true);
      expect(parsed.exptConfig.equals(exptConfig)).toBe(true);
      expect(parsed.staker.equals(staker)).toBe(true);
      expect(parsed.milestoneIndex).toBe(1);
      expect(parsed.amount.eq(new BN(1_000_000_000))).toBe(true);
    });
  });
});
