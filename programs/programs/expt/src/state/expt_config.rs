use crate::constants::*;
use anchor_lang::prelude::*;
use num_enum::{FromPrimitive, IntoPrimitive, TryFromPrimitive};

/// Status of an experiment
#[derive(Copy, Clone, Debug, PartialEq, Eq, IntoPrimitive, FromPrimitive)]
#[repr(u8)]
pub enum ExptStatus {
    /// Experiment created, presale not yet started
    #[num_enum(default)]
    Created,
    /// Presale is active on Meteora
    PresaleActive,
    /// Presale failed (minimum not met or builder withdrew)
    PresaleFailed,
    /// Presale succeeded, experiment is active
    Active,
    /// All milestones completed
    Completed,
}

/// Type of deliverable for a milestone
#[derive(Copy, Clone, Debug, PartialEq, Eq, IntoPrimitive, TryFromPrimitive)]
#[repr(u8)]
pub enum DeliverableType {
    /// URL to a live page
    Url,
    /// GitHub repository link
    Github,
    /// Deployed Solana program ID
    ProgramId,
    /// Live deployment link
    Deployment,
}

/// Status of a milestone
#[derive(Copy, Clone, Debug, PartialEq, Eq, IntoPrimitive, FromPrimitive)]
#[repr(u8)]
pub enum MilestoneStatus {
    /// Not yet submitted
    #[num_enum(default)]
    Pending,
    /// Builder submitted proof, challenge window open
    Submitted,
    /// Veto threshold reached, under challenge
    Challenged,
    /// Milestone passed (no veto or veto failed)
    Passed,
    /// Milestone failed (veto succeeded)
    Failed,
}

/// A single milestone definition and its runtime state.
/// Stored inline within ExptConfig (max 3).
#[zero_copy]
#[derive(Debug)]
pub struct Milestone {
    /// Human-readable description
    pub description: [u8; MAX_MILESTONE_DESC_LEN],
    /// Type of expected deliverable (DeliverableType as u8)
    pub deliverable_type: u8,
    /// Padding for alignment
    pub _padding0: [u8; 1],
    /// Percentage of treasury unlocked on pass (basis points)
    pub unlock_bps: u16,
    /// Padding for alignment
    pub _padding1: [u8; 4],
    /// Deadline timestamp (must deliver before this)
    pub deadline: u64,
    /// Current status (MilestoneStatus as u8)
    pub status: u8,
    /// Padding for alignment
    pub _padding2: [u8; 7],
    /// Timestamp when proof was submitted
    pub submitted_at: u64,
    /// Proof reference (URL, program ID, etc.)
    pub deliverable: [u8; MAX_DELIVERABLE_LEN],
    /// Total SOL staked in veto against this milestone
    pub total_veto_stake: u64,
    /// When the challenge window closes
    pub challenge_window_end: u64,
    /// Reserved for future use
    pub padding: [u8; 32],
}

// Milestone size: 128 + 1 + 1 + 2 + 4 + 8 + 1 + 7 + 8 + 200 + 8 + 8 + 32 = 408
const _: () = assert!(std::mem::size_of::<Milestone>() == 408);

impl anchor_lang::Space for Milestone {
    const INIT_SPACE: usize = std::mem::size_of::<Milestone>();
}

/// Main experiment configuration account.
/// PDA seeds: [b"expt_config", builder.key(), mint.key()]
#[account(zero_copy)]
#[derive(Debug)]
pub struct ExptConfig {
    /// Builder wallet (owner of this experiment)
    pub builder: Pubkey,
    /// Experiment name (UTF-8, null-padded)
    pub name: [u8; MAX_NAME_LEN],
    /// Metadata URI
    pub uri: [u8; MAX_URI_LEN],
    /// Meteora presale vault pubkey
    pub presale: Pubkey,
    /// Expt Coin mint
    pub mint: Pubkey,
    /// Treasury PDA bump seed
    pub treasury_bump: u8,
    /// Current experiment status (ExptStatus as u8)
    pub status: u8,
    /// Number of milestones (1-3)
    pub milestone_count: u8,
    /// Whether the DAMM v2 pool has been launched (0 = false, 1 = true)
    pub pool_launched: u8,
    /// Whether presale funds have been withdrawn to treasury (0 = false, 1 = true)
    pub presale_funds_withdrawn: u8,
    /// Padding for alignment
    pub _padding0: [u8; 3],
    /// Minimum SOL for presale success
    pub presale_minimum_cap: u64,
    /// Total SOL received into treasury
    pub total_treasury_received: u64,
    /// Total SOL claimed by builder so far
    pub total_claimed_by_builder: u64,
    /// Veto threshold in basis points
    pub veto_threshold_bps: u16,
    /// Padding for alignment
    pub _padding1: [u8; 6],
    /// Challenge window duration in seconds
    pub challenge_window: u64,
    /// Inline milestones
    pub milestones: [Milestone; MAX_MILESTONES],
    /// DAMM v2 pool address (set after launch_pool)
    pub damm_pool: Pubkey,
    /// Position NFT mint (for claiming fees)
    pub position_nft_mint: Pubkey,
    /// LP position PDA
    pub lp_position: Pubkey,
    /// Total token supply minted during experiment creation
    pub total_supply: u64,
    /// Builder PDA address (set during create_expt_config)
    pub builder_pda: Pubkey,
    /// Reserved for future use
    pub padding: [u8; 24],
}

// ExptConfig size:
// 32 + 32 + 200 + 32 + 32 + 1 + 1 + 1 + 1 + 1 + 3 + 8 + 8 + 8 + 2 + 6 + 8 + (408*3) + 32 + 32 + 32 + 8 + 32 + 24 = 1760
const _: () = assert!(std::mem::size_of::<ExptConfig>() == 1760);

impl ExptConfig {
    pub const SPACE: usize = 8 + std::mem::size_of::<ExptConfig>();

    /// Get a milestone by index (immutable)
    pub fn get_milestone(&self, index: u8) -> Result<&Milestone> {
        if index as usize >= self.milestone_count as usize {
            return Err(crate::errors::ExptError::InvalidMilestoneIndex.into());
        }
        Ok(&self.milestones[index as usize])
    }

    /// Get a mutable milestone by index
    pub fn get_milestone_mut(&mut self, index: u8) -> Result<&mut Milestone> {
        if index as usize >= self.milestone_count as usize {
            return Err(crate::errors::ExptError::InvalidMilestoneIndex.into());
        }
        Ok(&mut self.milestones[index as usize])
    }

    /// Calculate total unlocked BPS from all passed milestones
    pub fn total_unlocked_bps(&self) -> u16 {
        let passed: u8 = MilestoneStatus::Passed.into();
        let mut total: u16 = 0;
        for i in 0..self.milestone_count as usize {
            if self.milestones[i].status == passed {
                total = total.saturating_add(self.milestones[i].unlock_bps);
            }
        }
        total
    }

    /// Calculate the claimable amount for the builder
    pub fn claimable_amount(&self) -> Result<u64> {
        let unlocked_bps = self.total_unlocked_bps();
        let total_unlocked = (self.total_treasury_received as u128)
            .checked_mul(unlocked_bps as u128)
            .ok_or(crate::errors::ExptError::MathOverflow)?
            .checked_div(crate::constants::BPS_DENOMINATOR as u128)
            .ok_or(crate::errors::ExptError::MathOverflow)? as u64;

        let claimable = total_unlocked.saturating_sub(self.total_claimed_by_builder);
        Ok(claimable)
    }

    /// Check if all milestones are resolved (passed or failed)
    pub fn all_milestones_resolved(&self) -> bool {
        let passed: u8 = MilestoneStatus::Passed.into();
        let failed: u8 = MilestoneStatus::Failed.into();
        for i in 0..self.milestone_count as usize {
            let status = self.milestones[i].status;
            if status != passed && status != failed {
                return false;
            }
        }
        true
    }

    /// Check if at least one milestone has passed.
    /// Required for fee claiming (PRD §7: fees unlock only after ≥1 milestone passes).
    pub fn has_any_milestone_passed(&self) -> bool {
        let passed: u8 = MilestoneStatus::Passed.into();
        for i in 0..self.milestone_count as usize {
            if self.milestones[i].status == passed {
                return true;
            }
        }
        false
    }
}
