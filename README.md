# Expt

**Purpose:** Earn capital by shipping

> **Expt does not guarantee success. It guarantees non-extraction.**

---

## What is Expt?

Expt is a Solana protocol that lets builders raise **small experimental capital** from the public while preventing upfront extraction. Builders earn funds **only by shipping**, not by hype.

- Capital is raised publicly via presale
- Funds are locked into permanent liquidity
- Builders earn via milestone unlocks + trading fees
- Community can veto dishonest milestone claims

Everything stays liquid. Everything stays observable.

---

## Complete Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                          EXPT LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ① CREATE               ② PRESALE              ③ FINALIZE          │
│  ┌──────────┐           ┌──────────┐           ┌──────────┐        │
│  │ Builder  │──────────▶│ Meteora  │──────────▶│ Anyone   │        │
│  │ creates  │           │ Presale  │           │ finalizes│        │
│  │ presale  │           │ Vault    │           │ presale  │        │
│  │ + config │           │          │           │          │        │
│  └──────────┘           └──────────┘           └────┬─────┘        │
│  owner = Treasury PDA    Supporters deposit          │              │
│                                                      ▼              │
│                         ⑤ LAUNCH POOL          ④ WITHDRAW          │
│                         ┌──────────┐           ┌──────────┐        │
│                         │ DAMM v2  │◀──────────│ Treasury │        │
│                         │ Pool     │           │ receives │        │
│                         │ created  │           │ funds    │        │
│                         └────┬─────┘           └──────────┘        │
│                75% → LP      │                  75% stays for LP    │
│                Locked forever │                  25% → milestones   │
│                              ▼                                      │
│  ⑥ TRADING            ⑦ MILESTONES           ⑧ CLAIM FEES         │
│  ┌──────────┐         ┌──────────┐           ┌──────────┐         │
│  │ Token is │────────▶│ Builder  │           │ Trading  │         │
│  │ freely   │  fees   │ submits  │           │ fees →   │         │
│  │ tradable │──┐      │ proof    │           │ Treasury │         │
│  └──────────┘  │      └────┬─────┘           └──────────┘         │
│                │           │                  unlocks after        │
│                │           ▼                  ≥1 milestone passes  │
│                │      ⑨ VETO / RESOLVE                             │
│                │      ┌──────────┐           ⑩ BUILDER CLAIMS     │
│                │      │ Community│           ┌──────────┐         │
│                └─────▶│ can veto │──────────▶│ Builder  │         │
│                       │ or pass  │  passed   │ earns %  │         │
│                       └──────────┘           └──────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step

| # | Step | Actor | Method | Description |
|---|------|-------|--------|-------------|
| 1 | **Create Presale** | Builder | Meteora SDK | Create presale vault with `owner = Treasury PDA` |
| 2 | **Create Experiment** | Builder | `create_expt_config` | Define milestones, veto params; validates presale owner = Treasury PDA |
| 3 | **Deposit** | Supporters | Meteora directly | Commit SOL to presale vault |
| 4 | **Finalize Presale** | Anyone | `finalize_presale` | Check min cap met → status `Active` or `PresaleFailed` |
| 5 | **Withdraw Funds** | Anyone | `withdraw_presale_funds` | CPI `creator_withdraw` → Treasury PDA; 75/25 split |
| 6 | **Launch Pool** | Anyone | `launch_pool` | Create DAMM v2 pool, add 75% as LP, permanently lock |
| 7 | **Trading** | Public | DAMM v2 | Token is freely tradable; fees accumulate in treasury |
| 8 | **Submit Milestone** | Builder | `submit_milestone` | Provide proof reference; opens challenge window |
| 9 | **Veto** | Holders | `initiate_veto` | Stake tokens to challenge dishonest claims |
| 10 | **Resolve Milestone** | Anyone | `resolve_milestone` | Auto-pass if no veto; fail if threshold reached |
| 11 | **Claim Funds** | Builder | `claim_builder_funds` | Withdraw earned % from treasury |
| 12 | **Claim Fees** | Anyone | `claim_trading_fees` | Collect LP trading fees → treasury (after ≥1 milestone) |

---

## Architecture

### On-Chain Accounts

```
ExptConfig (PDA)                 Treasury (PDA)
seeds: [expt_config, builder]    seeds: [treasury, expt_config]
┌─────────────────────────┐      ┌─────────────────────────┐
│ builder: Pubkey          │      │ Owns position NFT       │
│ name, uri               │      │ Receives presale funds   │
│ presale: Pubkey          │      │ Receives trading fees    │
│ mint: Pubkey             │      │ Pays builder milestones  │
│ status: u8               │      └─────────────────────────┘
│ milestone_count: u8      │
│ pool_launched: u8        │
│ presale_funds_withdrawn  │      VetoStake (PDA)
│ presale_minimum_cap: u64 │      seeds: [veto_stake, config, milestone, staker]
│ total_treasury_received  │      ┌─────────────────────────┐
│ total_claimed_by_builder │      │ staker: Pubkey           │
│ veto_threshold_bps: u16  │      │ milestone_index: u8      │
│ challenge_window: u64    │      │ amount: u64              │
│ milestones: [Milestone;3]│      └─────────────────────────┘
│ damm_pool: Pubkey        │
│ position_nft_mint: Pubkey│
│ lp_position: Pubkey      │
└─────────────────────────┘
```

### External Integrations

| Integration | Program ID | Usage |
|-------------|-----------|-------|
| **Meteora Presale Vault** | `presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj` | Presale management, fund collection |
| **Meteora DAMM v2** | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | LP pool creation, permanent lock, fee collection |

Both integrations use **raw CPI** — no external crate dependencies. Instruction discriminators are computed at compile time via const SHA-256.

---

## Program Instructions

### Core Lifecycle

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `create_expt_config` | Builder | Initialize experiment with milestones, veto params. Validates presale owner = Treasury PDA |
| `finalize_presale` | Anyone | Read presale state, set `Active` if min cap met |
| `withdraw_presale_funds` | Anyone | CPI `creator_withdraw` on Meteora. 25% → treasury, 75% reserved for LP |
| `launch_pool` | Anyone | CPI DAMM v2: create pool + add LP (75%) + permanent lock |

### Milestone Management

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `submit_milestone` | Builder | Submit proof, open challenge window |
| `initiate_veto` | Any holder | Stake tokens to veto a milestone |
| `resolve_milestone` | Anyone | Pass if no veto; fail if threshold reached |
| `claim_builder_funds` | Builder | Withdraw earned % from treasury |

### Fee Management

| Instruction | Signer | Description |
|-------------|--------|-------------|
| `claim_trading_fees` | Anyone | CPI `claim_position_fee` on DAMM v2. Requires ≥1 milestone passed |
| `unwrap_treasury_wsol` | Anyone | Close treasury WSOL ATA → native SOL. Required between withdraw and claim |

---

## Treasury Model

The Treasury PDA is the economic core of each experiment:

**Inflows:**
- 25% of presale funds (via `withdraw_presale_funds`)
- 100% of DAMM v2 trading fees (via `claim_trading_fees`)

**Outflows:**
- Builder milestone claims (via `claim_builder_funds`)
- 75% of presale funds → LP (via `launch_pool`)

**Rules:**
- No manual admin withdrawals
- Funds unlock only via passed milestones
- Trading fees unlock only after ≥1 milestone passes

---

## Fee Structure (DAMM v2)

| Parameter | Value |
|-----------|-------|
| Fee scheduler | Exponential decay |
| Initial fee | 50% (anti-sniper) |
| Settled fee | 1% |
| Decay duration | 10 minutes |
| Dynamic fees | Enabled (volatility-based) |
| Fee collection | Token B (SOL) only |
| LP lock | Permanent (irrevocable) |

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| Builder steals presale funds | Presale `owner` must = Treasury PDA (validated in `create_expt_config`) |
| Builder claims without shipping | Milestone veto system with token-staked challenges |
| LP rug pull | LP is **permanently locked** — no one can withdraw liquidity |
| Double withdrawal | `presale_funds_withdrawn` flag (one-time only) |
| Premature fee extraction | Trading fees gated behind ≥1 milestone passing |
| Admin key extraction | No admin-only instructions. All permissionless after setup |

---

## Failure Mode

If a builder stops shipping:

- No milestones pass → no treasury unlocks
- Treasury remains locked forever
- Supporters exit via DAMM v2 liquidity
- Experiment effectively dies through natural decay

**No rage quit. No rug. Just decay.**

---

## Project Structure

```
expt.fun/
├── PRD.md                          # Product Requirements Document
├── README.md                       # This file
├── programs/                       # Anchor workspace
│   └── programs/expt/src/
│       ├── lib.rs                  # Program entry point (10 instructions)
│       ├── constants.rs            # Seeds, limits, program IDs
│       ├── errors.rs               # Custom error types
│       ├── events.rs               # On-chain event definitions
│       ├── state/
│       │   ├── expt_config.rs      # ExptConfig (zero_copy, 1728 bytes)
│       │   └── veto_stake.rs       # VetoStake account
│       ├── instructions/
│       │   ├── create_expt_config.rs
│       │   ├── finalize_presale.rs
│       │   ├── withdraw_presale_funds.rs
│       │   ├── unwrap_treasury_wsol.rs
│       │   ├── launch_pool.rs
│       │   ├── submit_milestone.rs
│       │   ├── initiate_veto.rs
│       │   ├── resolve_milestone.rs
│       │   ├── claim_builder_funds.rs
│       │   └── claim_trading_fees.rs
│       └── cpi_interfaces/
│           ├── presale.rs          # Meteora Presale CPI (creator_withdraw)
│           └── damm_v2.rs          # DAMM v2 CPI (pool, lock, fees)
│   ├── sdk/                        # TypeScript SDK
│   │   └── src/
│   │       ├── client.ts           # ExptClient — instruction builders
│   │       ├── constants.ts        # Program IDs, PDAs, seeds
│   │       ├── types.ts            # Parsed types, enums, helpers
│   │       └── idl/expt.json       # Anchor IDL (auto-synced)
│   └── tests/
│       └── localnet-e2e.ts         # Full lifecycle E2E test
└── apps/                           # Frontend applications
```

---

## E2E Testing

The localnet E2E test validates the **full experiment lifecycle** against real Meteora presale and DAMM v2 programs deployed on a local validator. It exercises every on-chain instruction in the correct order, including cross-program invocations.

### Test Phases

| Phase | Description | What It Validates |
|-------|-------------|-------------------|
| **1. Create Presale** | Initialize a Meteora presale vault with `owner = Treasury PDA`, mint base tokens, and deposit them | Presale account created with correct owner; base token supply deposited |
| **2. Deposit** | Create an escrow and deposit 5 SOL (WSOL) into the presale | Escrow created; quote tokens transferred into the presale vault |
| **3. Create Expt & Finalize** | Call `create_expt_config` to define milestones, then `finalize_presale` after presale ends | ExptConfig PDA initialized; status transitions to `Active` when min cap is met |
| **4. Withdraw Presale Funds** | Call `withdraw_presale_funds` — CPI into Meteora's `creator_withdraw` | WSOL appears in treasury ATA; 25% recorded as `total_treasury_received` |
| **4.5. Launch DAMM v2 Pool** | CPI into DAMM v2: create pool with concentrated ±10× price range, add 75% as LP, permanently lock position | Pool account created on-chain; `pool_launched` flag set; LP permanently locked |
| **4.6. Trading** | Execute 3 swaps on the pool (sell tokens, buy tokens, sell tokens) using the `depositor` wallet | All 3 trades succeed; fees accrue in the pool vaults |
| **5. Milestone Submit & Resolve** | Submit proof for each milestone, wait for challenge window, then resolve | Milestones pass without veto; status becomes `Completed` after all milestones resolve |
| **5.5. Unwrap Treasury WSOL** | Call `unwrap_treasury_wsol` to close the WSOL ATA → native SOL | Treasury PDA holds native SOL; WSOL ATA is closed |
| **6. Claim Builder Funds** | Builder calls `claim_builder_funds` to withdraw earned percentage | Builder receives 25% of presale (1.25 SOL); `total_claimed_by_builder` matches |
| **7. Claim Trading Fees** | CPI `claim_position_fee` into DAMM v2 to collect accrued trading fees | Non-zero fees collected (Token A); treasury balances increase |

### Key Metrics (5 SOL deposited)

| Metric | Value |
|--------|-------|
| Total presale deposit | 5 SOL |
| Treasury received (25%) | 1.25 SOL |
| LP allocation (75%) | 0.9375 SOL (+ 1M presale tokens) |
| Builder claimed | 1.25 SOL |
| Trading fees collected | ~213M raw Token A units |

### DAMM v2 Pool Configuration

| Parameter | Value |
|-----------|-------|
| Pool type | Customizable (concentrated liquidity) |
| Price range | **±10× from initial price** (not full range) |
| `sqrt_price` | `sqrt(token_b / token_a) × 2^64` (Q64.64) |
| `sqrt_min_price` | `sqrt_price / √10` |
| `sqrt_max_price` | `sqrt_price × √10` |
| Liquidity | `amount_b × 2^128 / (sqrt_price - sqrt_min_price)` |
| Activation | Timestamp-based, 30s delay after creation |
| LP lock | 100% permanently locked |
| Fee type | Exponential time scheduler (flat 0.05%) |

> **Why concentrated range?** Using the full Q64.64 range (`MIN_SQRT_PRICE` to `MAX_SQRT_PRICE`) spreads liquidity too thin — even 1 lamport swaps cause `PriceRangeViolation`. A ±10× range concentrates liquidity around the actual price, enabling practical trading.

### Edge Case Tests (Bankrun)

In addition to the happy-path E2E test, the following edge cases are tested in isolation:

| Test | Expected Behavior |
|------|-------------------|
| Duplicate `submit_milestone` | Rejects with `MilestoneNotPending` |
| Double `finalize_presale` | Rejects with `InvalidStatus` |
| `submit_milestone` with invalid index | Rejects with `InvalidMilestoneIndex` |
| `resolve_milestone` before challenge window | Rejects with `ChallengeWindowOpen` |
| Presale failure (min cap not met) | Status → `PresaleFailed`; `submit_milestone` and `claim_builder_funds` both blocked |
| Veto exceeds threshold | Milestone → `Vetoed (5)` |
| Veto below threshold | Milestone → `Passed` |

### Running the E2E Test

```bash
# 1. Start local validator with Meteora programs
solana-test-validator \
  --bpf-program presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj presale.so \
  --bpf-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG damm_v2.so

# 2. Build and deploy expt program
cd programs
anchor build -p expt
solana program deploy target/deploy/expt.so --url localhost

# 3. Run the E2E test
bun run tests/localnet-e2e.ts
```

> **Note:** The test takes ~3 minutes due to presale timing (start/end delays), pool activation wait (35s), and milestone challenge windows.

---

## Building

```bash
cd programs
anchor build
```

---

## License

MIT
