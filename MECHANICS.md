# Expt.fun — Platform Mechanics

> Detailed technical reference for the on-chain milestone lifecycle, veto system,
> treasury mechanics, and UI interaction model. Use this as the source of truth
> when building user-facing documentation.

---

## 1. Experiment Lifecycle (State Machine)

```
Created → Presale → Active → Completed
                       ↓
                    Failed (if all milestones fail)
```

### Status Transitions

| From        | To          | Trigger                                      |
|-------------|-------------|----------------------------------------------|
| `Created`   | `Active`    | Presale succeeds + pool launched             |
| `Active`    | `Completed` | All milestones resolved                      |
| `Active`    | `Failed`    | All milestones fail (veto threshold reached) |

---

## 2. Milestone State Machine

Each milestone is independent and transitions through these states:

```
Pending → Submitted → Passed → (funds claimable)
                  ↓
              Challenged → Failed
```

### Status Definitions

| Status        | Meaning                                                      |
|---------------|--------------------------------------------------------------|
| `Pending`     | Not yet submitted. Waiting for builder to submit proof.      |
| `Submitted`   | Builder has submitted deliverable proof. Challenge window is open. |
| `Challenged`  | Veto threshold reached during the challenge window.          |
| `Passed`      | Challenge window expired without successful veto. Funds unlocked. |
| `Failed`      | Veto succeeded. Funds remain locked in treasury.             |

### Transition Details

| From          | To            | Condition                                         | Instruction              |
|---------------|---------------|---------------------------------------------------|--------------------------|
| `Pending`     | `Submitted`   | Builder submits deliverable URL                   | `submit_milestone`       |
| `Submitted`   | `Passed`      | Challenge window expired, veto threshold NOT met  | `resolve_milestone`      |
| `Submitted`   | `Challenged`  | Veto stake reaches threshold during window        | `initiate_veto` (auto)   |
| `Challenged`  | `Failed`      | Challenge window expires while challenged         | `resolve_milestone`      |

---

## 3. On-Chain Instructions

### 3.1 `submit_milestone`

**Caller:** Builder only (signer must match `expt_config.builder`)

**Input:**
- `milestone_index: u8` — which milestone to submit (0-indexed)
- `deliverable: String` — URL to the deliverable (max 256 chars)

**Effects:**
- Sets milestone status to `Submitted`
- Records `submitted_at` timestamp
- Sets `challenge_window_end = now + config.challenge_window`
- Stores the deliverable URL

**SDK:**
```typescript
client.submitMilestone(builder: PublicKey, mint: PublicKey, {
  milestoneIndex: number,
  deliverable: string
}): Promise<TransactionInstruction>
```

---

### 3.2 `initiate_veto`

**Caller:** Anyone with a connected wallet (any token holder)

**Input:**
- `milestone_index: u8` — which milestone to veto
- `amount: u64` — SOL lamports to stake against the milestone

**Preconditions:**
- Experiment status must be `Active`
- Milestone status must be `Submitted` or `Challenged`
- Current timestamp must be ≤ `milestone.challenge_window_end`
- Amount must be > 0

**Effects:**
- Transfers `amount` SOL from staker to the treasury PDA
- Creates or updates the staker's `VetoStake` PDA
- Increments `milestone.total_veto_stake`
- If total veto stake ≥ threshold → sets milestone status to `Challenged`

**Veto Threshold Formula:**
```
threshold = (total_treasury_received × milestone.unlock_bps × veto_threshold_bps)
            / (BPS_DENOMINATOR × BPS_DENOMINATOR)
```

Where `BPS_DENOMINATOR = 10000`

**SDK:**
```typescript
client.initiateVeto(
  staker: PublicKey,      // any wallet
  exptConfig: PublicKey,  // experiment PDA address
  milestoneIndex: number,
  amount: BN              // SOL in lamports
): Promise<TransactionInstruction>
```

---

### 3.3 `resolve_milestone`

**Caller:** Anyone (permissionless crank)

**Preconditions:**
- Current timestamp must be > `milestone.challenge_window_end`
- Milestone status must be `Submitted` or `Challenged`

**Effects:**
- If status was `Submitted` → sets to `Passed` (veto threshold was not met)
- If status was `Challenged` → sets to `Failed` (veto threshold was met)
- Updates overall experiment status if all milestones are now resolved

**SDK:**
```typescript
client.resolveMilestone(
  payer: PublicKey,            // pays tx fee, any wallet
  exptConfigAddress: PublicKey,
  milestoneIndex: number
): Promise<TransactionInstruction>
```

> **Note:** This is a permissionless "crank" instruction. Anyone can call it once 
> the challenge window has expired. The `payer` only pays the transaction fee and
> has no special authority.

---

### 3.4 `claim_builder_funds`

**Caller:** Builder only (signer must match `expt_config.builder`)

**Preconditions:**
- Experiment must be `Active` or `Completed`
- Claimable amount must be > 0

**Claimable Amount Formula:**
```
total_unlocked_bps = SUM(milestone.unlock_bps) for all Passed milestones
total_unlocked     = total_treasury_received × total_unlocked_bps / 10000
claimable          = total_unlocked − total_claimed_by_builder
```

**Effects:**
- Transfers `min(claimable, treasury_balance)` SOL from treasury to builder
- Updates `total_claimed_by_builder`
- Does NOT track per-milestone claims — it's a cumulative global counter

**SDK:**
```typescript
client.claimBuilderFunds(
  builder: PublicKey,
  mint: PublicKey
): Promise<TransactionInstruction>
```

---

## 4. Challenge Window

The challenge window is the time period after a milestone is submitted during which
community members can stake SOL to veto it.

### Configuration

- Set at experiment creation via `challenge_window` (seconds)
- Applied per-milestone when the builder submits proof
- `challenge_window_end = submitted_at + challenge_window`

### Behavior

| Window State | Allowed Actions                                |
|-------------|------------------------------------------------|
| **Open**    | `initiate_veto` — anyone can stake SOL to veto |
| **Closed**  | `resolve_milestone` — anyone can crank the resolution |

### Grace Period

There is no grace period. Once `challenge_window_end` passes:
- No more veto stakes are accepted (`ChallengeWindowEnded` error)
- The milestone can be immediately resolved

---

## 5. Treasury Model

### Sources of Funds

| Source                  | Amount     | Timing                             |
|------------------------|------------|-------------------------------------|
| Presale deposit split  | 25% of SOL | After presale finalization          |
| DAMM v2 trading fees   | 100% of fees | Continuous, after pool launch     |
| Veto stakes            | Full amount | During challenge windows            |

### Fund Allocation

- **Builder Funds:** Released proportionally based on passed milestone `unlock_bps`
- **Locked LP:** 75% of presale SOL + 100% of tokens go to DAMM v2 pool (permanently locked)
- **Veto Stakes:** Transferred to treasury. If milestone passes, stakes are effectively burned (remain in treasury, increasing builder's claimable pool)

### Key Fields

| Field                    | Type  | Description                                           |
|--------------------------|-------|-------------------------------------------------------|
| `total_treasury_received`| `u64` | Total SOL ever deposited into the treasury            |
| `total_claimed_by_builder`| `u64` | Cumulative SOL claimed by the builder                |

---

## 6. UI Interaction Model

### 6.1 Milestone Action Buttons

The experiment detail page shows context-aware action buttons for each milestone.
The button displayed depends on the milestone status, the challenge window, the
connected wallet, and the claimable balance.

#### Decision Matrix

| Milestone Status | Window State | Wallet       | Button           | Action                              |
|-----------------|-------------|--------------|------------------|-------------------------------------|
| `Pending`       | —           | Builder      | **Submit Proof** | Opens dialog → `submitMilestone`    |
| `Pending`       | —           | Non-builder  | *(disabled)*     | Tooltip: "Only the builder can submit" |
| `Submitted`     | Open        | Any          | **Veto**         | Opens dialog → `initiateVeto`       |
| `Submitted`     | Closed      | Builder      | **Resolve & Claim** | `resolveMilestone` + `claimBuilderFunds` in 1 tx |
| `Submitted`     | Closed      | Non-builder  | **Resolve**      | Permissionless crank → `resolveMilestone` |
| `Passed`        | —           | Builder (unclaimed) | **Claim Funds** | `claimBuilderFunds`            |
| `Passed`        | —           | Builder (claimed)   | *(none)*    | All funds already claimed           |
| `Passed`        | —           | Non-builder  | *(none)*         | Already resolved                    |
| `Challenged`    | Open        | Any          | **Veto**         | Can add more stake                  |
| `Challenged`    | Closed      | Any          | **Resolve**      | Crank → resolves as `Failed`        |
| `Failed`        | —           | Any          | *(none)*         | Terminal state                      |

#### Client-Side Claimable Check

To determine if the builder has unclaimed funds (for showing the "Claim Funds"
button on `Passed` milestones):

```typescript
const totalUnlockedBps = expt.milestones
  .filter((m) => m.status === MilestoneStatus.Passed)
  .reduce((sum, m) => sum + m.unlockBps, 0);

const totalTreasury = expt.totalTreasuryReceived.toNumber();
const totalUnlocked = Math.floor((totalTreasury * totalUnlockedBps) / 10000);
const totalClaimed = expt.totalClaimedByBuilder.toNumber();
const hasUnclaimedFunds = totalUnlocked > totalClaimed;
```

---

### 6.2 Veto Dialog

When a user clicks **Veto**, a dialog appears with:

1. **Veto Deadline** — displayed prominently with a clock icon, showing the
   `challengeWindowEnd` date and time
2. **SOL Amount Input** — the user enters how much SOL to stake
3. **Stake & Veto Button** — calls `initiateVeto` with the entered amount

The dialog shows loading, success (with Solscan link), and error states.

---

### 6.3 Submit Proof Dialog

When the builder clicks **Submit Proof**, a dialog appears with:

1. **Deliverable URL Input** — the builder enters the proof URL
2. **Submit Button** — calls `submitMilestone` with the URL and milestone index

---

### 6.4 Transaction Success Feedback

All transaction success messages display:
- A brief success message (e.g., "Proof submitted", "Veto staked")
- A **clickable Solscan link** showing the truncated signature (e.g., `4gF8xR2…`)
- The link opens in a new tab with the correct network param (`?cluster=devnet` for non-mainnet)

---

## 7. URL Routing & Deep Linking

### Experiment Detail Page

```
/experiment/{address}                    → Overview tab
/experiment/{address}?tab=milestones     → Milestones tab
/experiment/{address}?tab=treasury       → Treasury tab
```

### Internal Admin Page

```
/internal/{hash}/experiment/{address}    → Admin debug panel
```

---

## 8. Account PDAs

### Derivation Seeds

| PDA              | Seeds                                                  |
|------------------|--------------------------------------------------------|
| `ExptConfig`     | `["expt_config", builder, mint]`                       |
| `Treasury`       | `["treasury", expt_config]`                            |
| `VetoStake`      | `["veto_stake", expt_config, staker, milestone_index]` |

---

## 9. Error Codes (Relevant to Milestones)

| Error                    | Code   | Meaning                                       |
|--------------------------|--------|-----------------------------------------------|
| `MilestoneNotSubmitted`  | —      | Milestone is not in `Submitted`/`Challenged` state |
| `ChallengeWindowEnded`   | —      | Veto attempted after window expired           |
| `InvalidVetoStakeAmount` | —      | Veto amount is 0                              |
| `NoFundsAvailable`       | —      | No claimable SOL for the builder              |
| `Unauthorized`           | —      | Caller is not the builder                     |
| `InvalidStatus`          | —      | Experiment is not in the required status       |
| `MathOverflow`           | —      | Arithmetic overflow in calculations           |

---

## 10. Event Emissions

| Event                  | Emitted By           | Key Fields                                     |
|------------------------|----------------------|------------------------------------------------|
| `EvtMilestoneSubmitted` | `submit_milestone`   | expt_config, milestone_index, deliverable      |
| `EvtVetoInitiated`     | `initiate_veto`      | expt_config, milestone_index, staker, stake_amount, total_veto_stake |
| `EvtMilestoneResolved` | `resolve_milestone`  | expt_config, milestone_index, passed (bool)    |
| `EvtBuilderFundsClaimed` | `claim_builder_funds` | expt_config, builder, amount, total_claimed  |
