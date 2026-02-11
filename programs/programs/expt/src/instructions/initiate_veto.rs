use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::seeds;
use crate::errors::ExptError;
use crate::events::EvtVetoInitiated;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitiateVetoArgs {
    pub milestone_index: u8,
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(args: InitiateVetoArgs)]
pub struct InitiateVetoCtx<'info> {
    /// The holder staking against a milestone
    #[account(mut)]
    pub staker: Signer<'info>,

    /// ExptConfig PDA
    #[account(mut)]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// VetoStake PDA — per staker per milestone
    #[account(
        init_if_needed,
        payer = staker,
        space = 8 + VetoStake::INIT_SPACE,
        seeds = [
            seeds::VETO_STAKE_PREFIX,
            expt_config.key().as_ref(),
            staker.key().as_ref(),
            &[args.milestone_index],
        ],
        bump,
    )]
    pub veto_stake: Account<'info, VetoStake>,

    /// Treasury PDA that holds veto stake funds
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initiate_veto(ctx: Context<InitiateVetoCtx>, args: InitiateVetoArgs) -> Result<()> {
    require!(args.amount > 0, ExptError::InvalidVetoStakeAmount);

    let mut config = ctx.accounts.expt_config.load_mut()?;

    // 1. Experiment must be active
    let status: ExptStatus = config
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;
    require!(status == ExptStatus::Active, ExptError::InvalidStatus);

    // 2. Read config fields before mutable milestone borrow
    let total_treasury_received = config.total_treasury_received;
    let veto_threshold_bps = config.veto_threshold_bps;

    // 3. Get milestone and verify it's submitted or challenged
    let milestone = config.get_milestone_mut(args.milestone_index)?;
    let milestone_status: MilestoneStatus = milestone
        .status
        .try_into()
        .map_err(|_| ExptError::MilestoneNotSubmitted)?;
    require!(
        milestone_status == MilestoneStatus::Submitted
            || milestone_status == MilestoneStatus::Challenged,
        ExptError::MilestoneNotSubmitted
    );

    // 4. Check we're within the challenge window
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    require!(
        current_timestamp <= milestone.challenge_window_end,
        ExptError::ChallengeWindowEnded
    );

    // 5. Transfer SOL from staker to treasury
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.staker.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        args.amount,
    )?;

    // 6. Update veto stake account
    let veto = &mut ctx.accounts.veto_stake;
    // Initialize if first time
    if veto.expt_config == Pubkey::default() {
        veto.expt_config = ctx.accounts.expt_config.key();
        veto.staker = ctx.accounts.staker.key();
        veto.milestone_index = args.milestone_index;
    }
    veto.amount = veto
        .amount
        .checked_add(args.amount)
        .ok_or(ExptError::MathOverflow)?;

    // 7. Update milestone veto stake
    milestone.total_veto_stake = milestone
        .total_veto_stake
        .checked_add(args.amount)
        .ok_or(ExptError::MathOverflow)?;

    // 8. Check if veto threshold reached — if so, mark as challenged
    let unlock_bps = milestone.unlock_bps;
    let threshold = (total_treasury_received as u128)
        .checked_mul(unlock_bps as u128)
        .ok_or(ExptError::MathOverflow)?
        .checked_div(crate::constants::BPS_DENOMINATOR as u128)
        .ok_or(ExptError::MathOverflow)?
        .checked_mul(veto_threshold_bps as u128)
        .ok_or(ExptError::MathOverflow)?
        .checked_div(crate::constants::BPS_DENOMINATOR as u128)
        .ok_or(ExptError::MathOverflow)? as u64;

    if milestone.total_veto_stake >= threshold {
        milestone.status = MilestoneStatus::Challenged.into();
    }

    let total_veto_stake = milestone.total_veto_stake;

    // 9. Emit event
    emit!(EvtVetoInitiated {
        expt_config: ctx.accounts.expt_config.key(),
        milestone_index: args.milestone_index,
        staker: ctx.accounts.staker.key(),
        stake_amount: args.amount,
        total_veto_stake,
    });

    Ok(())
}
