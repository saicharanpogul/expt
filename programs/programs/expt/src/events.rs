use anchor_lang::prelude::*;

#[event]
pub struct EvtExptConfigCreated {
    pub expt_config: Pubkey,
    pub builder: Pubkey,
    pub presale: Pubkey,
    pub mint: Pubkey,
    pub name: [u8; 32],
    pub milestone_count: u8,
    pub presale_minimum_cap: u64,
    pub veto_threshold_bps: u16,
    pub challenge_window: u64,
}

#[event]
pub struct EvtPresaleFinalized {
    pub expt_config: Pubkey,
    pub new_status: u8,
    pub total_deposit: u64,
}

#[event]
pub struct EvtMilestoneSubmitted {
    pub expt_config: Pubkey,
    pub milestone_index: u8,
    pub submitted_at: u64,
    pub challenge_window_end: u64,
}

#[event]
pub struct EvtVetoInitiated {
    pub expt_config: Pubkey,
    pub milestone_index: u8,
    pub staker: Pubkey,
    pub stake_amount: u64,
    pub total_veto_stake: u64,
}

#[event]
pub struct EvtMilestoneResolved {
    pub expt_config: Pubkey,
    pub milestone_index: u8,
    pub passed: bool,
    pub total_veto_stake: u64,
}

#[event]
pub struct EvtBuilderFundsClaimed {
    pub expt_config: Pubkey,
    pub builder: Pubkey,
    pub amount: u64,
    pub total_claimed: u64,
}

#[event]
pub struct EvtPoolLaunched {
    pub expt_config: Pubkey,
    pub damm_pool: Pubkey,
    pub position_nft_mint: Pubkey,
    pub lp_position: Pubkey,
    pub token_a_amount: u64,
    pub token_b_amount: u64,
}

#[event]
pub struct EvtTradingFeesClaimed {
    pub expt_config: Pubkey,
    pub damm_pool: Pubkey,
    pub fee_a_claimed: u64,
    pub fee_b_claimed: u64,
}

#[event]
pub struct EvtPresaleFundsWithdrawn {
    pub expt_config: Pubkey,
    pub presale: Pubkey,
    pub total_withdrawn: u64,
    pub treasury_amount: u64,
    pub lp_amount: u64,
}
