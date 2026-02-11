use anchor_lang::prelude::*;

/// Per-user per-milestone veto stake account.
/// PDA seeds: [b"veto_stake", expt_config.key(), staker.key(), &[milestone_index]]
#[account]
#[derive(InitSpace, Debug)]
pub struct VetoStake {
    /// The ExptConfig this stake is for
    pub expt_config: Pubkey,
    /// The wallet that staked
    pub staker: Pubkey,
    /// Which milestone index (0-2)
    pub milestone_index: u8,
    /// Amount of SOL staked (in lamports)
    pub amount: u64,
    /// Reserved for future use
    pub padding: [u64; 4],
}
