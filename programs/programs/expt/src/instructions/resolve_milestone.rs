use anchor_lang::prelude::*;

use crate::errors::ExptError;
use crate::events::EvtMilestoneResolved;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ResolveMilestoneArgs {
    pub milestone_index: u8,
}

#[derive(Accounts)]
#[instruction(args: ResolveMilestoneArgs)]
pub struct ResolveMilestoneCtx<'info> {
    /// Anyone can call resolution after the challenge window
    pub payer: Signer<'info>,

    /// ExptConfig PDA
    #[account(mut)]
    pub expt_config: AccountLoader<'info, ExptConfig>,
}

pub fn handle_resolve_milestone(
    ctx: Context<ResolveMilestoneCtx>,
    args: ResolveMilestoneArgs,
) -> Result<()> {
    let mut config = ctx.accounts.expt_config.load_mut()?;

    // 1. Experiment must be active
    let status: ExptStatus = config
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;
    require!(status == ExptStatus::Active, ExptError::InvalidStatus);

    // 2. Read config fields before milestone mutable borrow
    let veto_threshold_bps = config.veto_threshold_bps;
    let total_treasury_received = config.total_treasury_received;

    // 3. Get milestone
    let milestone = config.get_milestone_mut(args.milestone_index)?;

    // 4. Milestone must be in Submitted or Challenged status
    let milestone_status: MilestoneStatus = milestone
        .status
        .try_into()
        .map_err(|_| ExptError::MilestoneAlreadyResolved)?;
    require!(
        milestone_status == MilestoneStatus::Submitted
            || milestone_status == MilestoneStatus::Challenged,
        ExptError::MilestoneAlreadyResolved
    );

    // 5. Challenge window must have ended
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    require!(
        current_timestamp > milestone.challenge_window_end,
        ExptError::ChallengeWindowNotEnded
    );

    // 6. Resolve: calculate threshold and decide
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

    let passed = milestone.total_veto_stake < threshold;

    if passed {
        milestone.status = MilestoneStatus::Passed.into();
    } else {
        milestone.status = MilestoneStatus::Failed.into();
    }

    let total_veto_stake = milestone.total_veto_stake;

    // 7. Check if all milestones are resolved — update experiment status
    if config.all_milestones_resolved() {
        config.status = ExptStatus::Completed.into();
    }

    // 8. Emit event
    emit!(EvtMilestoneResolved {
        expt_config: ctx.accounts.expt_config.key(),
        milestone_index: args.milestone_index,
        passed,
        total_veto_stake,
    });

    Ok(())
}
