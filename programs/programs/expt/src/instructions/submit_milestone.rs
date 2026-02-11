use anchor_lang::prelude::*;

use crate::constants::seeds;
use crate::errors::ExptError;
use crate::events::EvtMilestoneSubmitted;
use crate::state::*;

/// Arguments for submitting a milestone
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SubmitMilestoneArgs {
    pub milestone_index: u8,
    pub deliverable: [u8; 200],
}

#[derive(Accounts)]
#[instruction(args: SubmitMilestoneArgs)]
pub struct SubmitMilestoneCtx<'info> {
    /// Builder submitting proof
    pub builder: Signer<'info>,

    /// ExptConfig PDA
    #[account(
        mut,
        seeds = [seeds::EXPT_CONFIG_PREFIX, builder.key().as_ref()],
        bump,
        constraint = expt_config.load()?.builder == builder.key() @ ExptError::Unauthorized,
    )]
    pub expt_config: AccountLoader<'info, ExptConfig>,
}

pub fn handle_submit_milestone(
    ctx: Context<SubmitMilestoneCtx>,
    args: SubmitMilestoneArgs,
) -> Result<()> {
    let mut config = ctx.accounts.expt_config.load_mut()?;

    // 1. Experiment must be active
    let status: ExptStatus = config
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;
    require!(status == ExptStatus::Active, ExptError::InvalidStatus);

    // 2. Read challenge_window before taking mutable borrow on milestone
    let challenge_window = config.challenge_window;

    // 3. Get milestone and verify it's pending
    let milestone = config.get_milestone_mut(args.milestone_index)?;
    let milestone_status: MilestoneStatus = milestone
        .status
        .try_into()
        .map_err(|_| ExptError::MilestoneNotPending)?;
    require!(
        milestone_status == MilestoneStatus::Pending,
        ExptError::MilestoneNotPending
    );

    // 4. Check deadline hasn't passed
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    require!(
        current_timestamp <= milestone.deadline,
        ExptError::MilestoneDeadlinePassed
    );

    // 5. Update milestone
    milestone.status = MilestoneStatus::Submitted.into();
    milestone.submitted_at = current_timestamp;
    milestone.deliverable = args.deliverable;
    milestone.challenge_window_end = current_timestamp
        .checked_add(challenge_window)
        .ok_or(ExptError::MathOverflow)?;

    let challenge_window_end = milestone.challenge_window_end;

    // 6. Emit event
    emit!(EvtMilestoneSubmitted {
        expt_config: ctx.accounts.expt_config.key(),
        milestone_index: args.milestone_index,
        submitted_at: current_timestamp,
        challenge_window_end,
    });

    Ok(())
}
