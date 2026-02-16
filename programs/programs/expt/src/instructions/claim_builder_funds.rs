use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::seeds;
use crate::errors::ExptError;
use crate::events::EvtBuilderFundsClaimed;
use crate::state::*;

#[derive(Accounts)]
pub struct ClaimBuilderFundsCtx<'info> {
    /// Builder claiming funds
    #[account(mut)]
    pub builder: Signer<'info>,

    /// Mint used in PDA derivation
    /// CHECK: Only used for PDA seed derivation, not read or written
    pub mint: UncheckedAccount<'info>,

    /// ExptConfig PDA
    #[account(
        mut,
        seeds = [seeds::EXPT_CONFIG_PREFIX, builder.key().as_ref(), mint.key().as_ref()],
        bump,
        constraint = expt_config.load()?.builder == builder.key() @ ExptError::Unauthorized,
    )]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA holding the funds
    /// CHECK: Validated by seeds — PDA owned by system program, transfer via CPI
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_claim_builder_funds(ctx: Context<ClaimBuilderFundsCtx>) -> Result<()> {
    let config_key = ctx.accounts.expt_config.key();
    let mut config = ctx.accounts.expt_config.load_mut()?;

    // 1. Experiment must be active or completed
    let status: ExptStatus = config
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;
    require!(
        status == ExptStatus::Active || status == ExptStatus::Completed,
        ExptError::InvalidStatus
    );

    // 2. Calculate claimable amount
    let claimable = config.claimable_amount()?;
    require!(claimable > 0, ExptError::NoFundsAvailable);

    // 3. Ensure treasury has enough SOL
    let treasury_lamports = ctx.accounts.treasury.lamports();
    let claim_amount = claimable.min(treasury_lamports);
    require!(claim_amount > 0, ExptError::NoFundsAvailable);

    // 4. Transfer from treasury PDA to builder via CPI with PDA signer seeds
    let treasury_bump = ctx.bumps.treasury;
    let signer_seeds: &[&[&[u8]]] = &[&[
        seeds::TREASURY_PREFIX,
        config_key.as_ref(),
        &[treasury_bump],
    ]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.builder.to_account_info(),
            },
            signer_seeds,
        ),
        claim_amount,
    )?;

    // 5. Update claimed amount
    config.total_claimed_by_builder = config
        .total_claimed_by_builder
        .checked_add(claim_amount)
        .ok_or(ExptError::MathOverflow)?;

    let total_claimed = config.total_claimed_by_builder;

    // 6. Emit event
    emit!(EvtBuilderFundsClaimed {
        expt_config: ctx.accounts.expt_config.key(),
        builder: ctx.accounts.builder.key(),
        amount: claim_amount,
        total_claimed,
    });

    Ok(())
}
