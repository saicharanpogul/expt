use anchor_lang::prelude::*;

#[error_code]
#[derive(PartialEq)]
pub enum ExptError {
    #[msg("Invalid experiment name")]
    InvalidName,

    #[msg("Invalid metadata URI")]
    InvalidUri,

    #[msg("Invalid presale parameters")]
    InvalidPresaleParams,

    #[msg("Invalid milestone configuration")]
    InvalidMilestoneConfig,

    #[msg("Milestone unlock BPS exceed 100%")]
    MilestoneUnlockBpsOverflow,

    #[msg("Invalid milestone count")]
    InvalidMilestoneCount,

    #[msg("Invalid milestone deadline")]
    InvalidMilestoneDeadline,

    #[msg("Raise amount exceeds maximum")]
    RaiseAmountExceedsMax,

    #[msg("Presale minimum cap must be greater than zero")]
    ZeroMinimumCap,

    #[msg("Invalid experiment status for this operation")]
    InvalidStatus,

    #[msg("Unauthorized: only the builder can perform this action")]
    Unauthorized,

    #[msg("Presale has not ended yet")]
    PresaleNotEnded,

    #[msg("Presale failed: minimum cap not reached")]
    PresaleFailed,

    #[msg("Milestone is not in pending status")]
    MilestoneNotPending,

    #[msg("Milestone is not in submitted status")]
    MilestoneNotSubmitted,

    #[msg("Milestone deadline has passed")]
    MilestoneDeadlinePassed,

    #[msg("Challenge window has not ended")]
    ChallengeWindowNotEnded,

    #[msg("Challenge window has ended")]
    ChallengeWindowEnded,

    #[msg("No funds available to claim")]
    NoFundsAvailable,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Invalid milestone index")]
    InvalidMilestoneIndex,

    #[msg("Invalid veto stake amount")]
    InvalidVetoStakeAmount,

    #[msg("Invalid presale account")]
    InvalidPresaleAccount,

    #[msg("Milestone already resolved")]
    MilestoneAlreadyResolved,

    #[msg("Pool has already been launched")]
    PoolAlreadyLaunched,

    #[msg("Pool has not been launched yet")]
    PoolNotLaunched,

    #[msg("No milestones have passed yet")]
    NoMilestonesPassed,

    #[msg("Presale owner does not match treasury PDA")]
    InvalidPresaleOwner,

    #[msg("Presale funds have already been withdrawn")]
    PresaleFundsAlreadyWithdrawn,

    #[msg("Presale funds have not been withdrawn yet")]
    PresaleFundsNotWithdrawn,

    #[msg("Presale has already been initialized for this experiment")]
    PresaleAlreadyInitialized,

    #[msg("Insufficient token balance in treasury")]
    InsufficientTreasuryBalance,
}
