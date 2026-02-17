use anchor_lang::prelude::*;

use crate::constants::seeds;
use crate::errors::ExptError;
use crate::state::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleVetoStakeArgs {
    pub milestone_index: u8,
}

#[derive(Accounts)]
#[instruction(args: SettleVetoStakeArgs)]
pub struct SettleVetoStakeCtx<'info> {
    /// The staker getting their stake settled
    #[account(mut)]
    pub staker: Signer<'info>,

    /// ExptConfig PDA (immutable — only reads milestone status)
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// VetoStake PDA — will be closed after settlement
    #[account(
        mut,
        seeds = [
            seeds::VETO_STAKE_PREFIX,
            expt_config.key().as_ref(),
            staker.key().as_ref(),
            &[args.milestone_index],
        ],
        bump,
        constraint = veto_stake.staker == staker.key() @ ExptError::Unauthorized,
        constraint = veto_stake.amount > 0 @ ExptError::NoFundsAvailable,
        close = staker,
    )]
    pub veto_stake: Account<'info, VetoStake>,

    /// Treasury PDA — sends SOL back to staker if milestone failed
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_settle_veto_stake(
    ctx: Context<SettleVetoStakeCtx>,
    args: SettleVetoStakeArgs,
) -> Result<()> {
    let config = ctx.accounts.expt_config.load()?;

    // 1. Get milestone and verify it's resolved
    let milestone = config.get_milestone(args.milestone_index)?;
    let milestone_status: MilestoneStatus = milestone
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;

    let stake_amount = ctx.accounts.veto_stake.amount;

    match milestone_status {
        MilestoneStatus::Passed => {
            // Milestone passed → stakes burned (stay in treasury).
            // The VetoStake account is closed (rent returned to staker via `close = staker`).
            // The staked SOL in treasury remains as protocol revenue.
            msg!(
                "Milestone {} passed — burning veto stake of {} lamports",
                args.milestone_index,
                stake_amount
            );
        }
        MilestoneStatus::Failed => {
            // Milestone failed → return staked SOL from treasury to staker.
            let expt_config_key = ctx.accounts.expt_config.key();
            let treasury_bump = config.treasury_bump;
            drop(config); // Release borrow before CPI

            let treasury_seeds: &[&[u8]] = &[
                seeds::TREASURY_PREFIX,
                expt_config_key.as_ref(),
                &[treasury_bump],
            ];

            // Transfer SOL from treasury to staker (PDA signs)
            let treasury_info = ctx.accounts.treasury.to_account_info();
            let staker_info = ctx.accounts.staker.to_account_info();

            **treasury_info.try_borrow_mut_lamports()? -= stake_amount;
            **staker_info.try_borrow_mut_lamports()? += stake_amount;

            // We don't need CPI since treasury is a SystemAccount PDA owned by the system program.
            // Direct lamport manipulation is valid for PDAs.
            let _ = treasury_seeds; // Acknowledge seeds exist for safety, but not needed for system account

            msg!(
                "Milestone {} failed — returning {} lamports to staker",
                args.milestone_index,
                stake_amount
            );
        }
        _ => {
            // Milestone not yet resolved
            return Err(ExptError::MilestoneNotSubmitted.into());
        }
    }

    Ok(())
}
