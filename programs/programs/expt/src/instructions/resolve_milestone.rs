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

    // 4. Parse current milestone status
    let milestone_status: MilestoneStatus = milestone
        .status
        .try_into()
        .map_err(|_| ExptError::MilestoneAlreadyResolved)?;

    let current_timestamp = Clock::get()?.unix_timestamp as u64;

    let (passed, total_veto_stake);

    match milestone_status {
        // Case A: Pending milestone — auto-fail if deadline has passed
        MilestoneStatus::Pending => {
            require!(
                current_timestamp > milestone.deadline,
                ExptError::MilestoneNotSubmitted
            );
            passed = false;
            total_veto_stake = 0;
            milestone.status = MilestoneStatus::Failed.into();
        }
        // Case B: Submitted/Challenged — normal resolution after challenge window
        MilestoneStatus::Submitted | MilestoneStatus::Challenged => {
            require!(
                current_timestamp > milestone.challenge_window_end,
                ExptError::ChallengeWindowNotEnded
            );

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

            passed = milestone.total_veto_stake < threshold;
            total_veto_stake = milestone.total_veto_stake;

            if passed {
                milestone.status = MilestoneStatus::Passed.into();
            } else {
                milestone.status = MilestoneStatus::Failed.into();
            }
        }
        // Already resolved
        _ => {
            return Err(ExptError::MilestoneAlreadyResolved.into());
        }
    }

    // 5. Check if all milestones are resolved — update experiment status
    if config.all_milestones_resolved() {
        config.status = ExptStatus::Completed.into();
    }

    // 6. Emit event
    emit!(EvtMilestoneResolved {
        expt_config: ctx.accounts.expt_config.key(),
        milestone_index: args.milestone_index,
        passed,
        total_veto_stake,
    });

    Ok(())
}
