use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount};

use crate::errors::ExptError;
use crate::state::*;
use crate::constants::seeds;

/// Unwrap WSOL from the treasury's token account back to native SOL.
///
/// After `withdraw_presale_funds`, the treasury PDA holds WSOL in an ATA.
/// This instruction closes that ATA, converting the WSOL balance back to
/// native SOL lamports on the treasury PDA. This must be called before
/// `claim_builder_funds`, which transfers native SOL.
///
/// Permissionless — anyone can trigger this.
#[derive(Accounts)]
pub struct UnwrapTreasuryWsolCtx<'info> {
    /// Anyone can trigger the unwrap
    pub payer: Signer<'info>,

    /// ExptConfig PDA (read-only — just need presale_funds_withdrawn flag)
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — owns the WSOL ATA, receives native SOL
    /// CHECK: Validated by seeds
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Treasury's WSOL token account (will be closed)
    #[account(
        mut,
        token::authority = treasury,
    )]
    pub treasury_wsol_ata: Account<'info, TokenAccount>,

    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

pub fn handle_unwrap_treasury_wsol(ctx: Context<UnwrapTreasuryWsolCtx>) -> Result<()> {
    let config = ctx.accounts.expt_config.load()?;

    // 1. Presale funds must have been withdrawn first
    require!(
        config.presale_funds_withdrawn != 0,
        ExptError::PresaleFundsNotWithdrawn
    );

    // 2. Close the WSOL ATA → native SOL flows to treasury PDA
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_bump = ctx.bumps.treasury;
    let signer_seeds: &[&[&[u8]]] = &[&[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[treasury_bump],
    ]];

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.treasury_wsol_ata.to_account_info(),
            destination: ctx.accounts.treasury.to_account_info(),
            authority: ctx.accounts.treasury.to_account_info(),
        },
        signer_seeds,
    ))?;

    msg!(
        "Treasury WSOL unwrapped: {} lamports returned to treasury",
        ctx.accounts.treasury_wsol_ata.amount
    );

    Ok(())
}
