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
│       │   ├── launch_pool.rs
│       │   ├── submit_milestone.rs
│       │   ├── initiate_veto.rs
│       │   ├── resolve_milestone.rs
│       │   ├── claim_builder_funds.rs
│       │   └── claim_trading_fees.rs
│       └── cpi_interfaces/
│           ├── presale.rs          # Meteora Presale CPI (creator_withdraw)
│           └── damm_v2.rs          # DAMM v2 CPI (pool, lock, fees)
└── apps/                           # Frontend applications
```

---

## Building

```bash
cd programs
anchor build
```

---

## License

MIT
