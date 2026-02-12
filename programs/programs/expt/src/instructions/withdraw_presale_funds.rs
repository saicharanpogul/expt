use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::cpi_interfaces::presale::*;
use crate::errors::ExptError;
use crate::events::EvtPresaleFundsWithdrawn;
use crate::state::*;
use crate::constants::seeds;

/// Withdraw raised presale funds into the treasury PDA.
///
/// Called after `finalize_presale` sets status to `Active`.
/// Permissionless — anyone can trigger this.
///
/// Flow:
/// 1. CPI `creator_withdraw` on Meteora Presale (Treasury PDA signs as owner)
/// 2. Quote tokens (SOL/WSOL) arrive in treasury's token account
/// 3. Record `total_treasury_received` = 25% of withdrawn amount
/// 4. The remaining 75% stays in treasury until `launch_pool` moves it to DAMM v2
#[derive(Accounts)]
pub struct WithdrawPresaleFundsCtx<'info> {
    /// Anyone can trigger withdrawal
    pub payer: Signer<'info>,

    /// ExptConfig PDA (writable to update state)
    #[account(mut)]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — presale owner, receives the withdrawn funds
    /// CHECK: Validated by seeds
    #[account(
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    // ----- Meteora Presale accounts -----

    /// Presale vault account (writable — state updated by Meteora)
    /// CHECK: Validated against expt_config.presale
    #[account(
        mut,
        owner = PRESALE_PROGRAM_ID,
    )]
    pub presale: UncheckedAccount<'info>,

    /// CHECK: Presale authority PDA (const in presale program)
    #[account(address = PRESALE_AUTHORITY)]
    pub presale_authority: UncheckedAccount<'info>,

    /// Treasury's quote token account (receives withdrawn SOL/WSOL)
    #[account(mut)]
    pub treasury_quote_token: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Quote token vault in the presale (source of funds)
    #[account(mut)]
    pub quote_token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Quote token mint
    pub quote_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token program for quote token transfers
    pub token_program: Interface<'info, TokenInterface>,

    /// CHECK: Memo program (required by Meteora presale)
    #[account(address = MEMO_PROGRAM_ID)]
    pub memo_program: UncheckedAccount<'info>,

    /// CHECK: Event authority PDA for #[event_cpi] (derived from __event_authority seed)
    pub presale_event_authority: UncheckedAccount<'info>,

    /// CHECK: Meteora Presale program
    #[account(address = PRESALE_PROGRAM_ID)]
    pub presale_program: UncheckedAccount<'info>,
}

pub fn handle_withdraw_presale_funds(ctx: Context<WithdrawPresaleFundsCtx>) -> Result<()> {
    let (treasury_bump, presale_key) = {
        let config = ctx.accounts.expt_config.load()?;

        // 1. Status must be Active (presale succeeded)
        let status: ExptStatus = config
            .status
            .try_into()
            .map_err(|_| ExptError::InvalidStatus)?;
        require!(status == ExptStatus::Active, ExptError::InvalidStatus);

        // 2. Funds must not already be withdrawn
        require!(
            config.presale_funds_withdrawn == 0,
            ExptError::PresaleFundsAlreadyWithdrawn
        );

        // 3. Verify presale matches config
        require!(
            ctx.accounts.presale.key() == config.presale,
            ExptError::InvalidPresaleAccount
        );

        (config.treasury_bump, config.presale)
    };

    // 4. Record balance before CPI
    let balance_before = ctx.accounts.treasury_quote_token.amount;

    // 5. CPI: creator_withdraw
    //    Treasury PDA signs as the presale owner.
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_seeds: &[&[u8]] = &[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[treasury_bump],
    ];

    let cpi_accounts = [
        ctx.accounts.presale.to_account_info(),           // 0: presale
        ctx.accounts.presale_authority.to_account_info(),  // 1: presale_authority
        ctx.accounts.treasury_quote_token.to_account_info(), // 2: owner_token (dest)
        ctx.accounts.treasury.to_account_info(),           // 3: owner (signer = treasury PDA)
        ctx.accounts.token_program.to_account_info(),      // 4: token_program
        ctx.accounts.memo_program.to_account_info(),       // 5: memo_program
        // Remaining accounts (CreatorWithdrawQuoteCtx)
        ctx.accounts.quote_token_vault.to_account_info(),  // 6: quote_token_vault
        ctx.accounts.quote_mint.to_account_info(),         // 7: quote_mint
        // #[event_cpi] accounts (needed for invoke_signed to find them)
        ctx.accounts.presale_event_authority.to_account_info(), // 8: event_authority
        ctx.accounts.presale_program.to_account_info(),    // 9: presale program
    ];

    cpi_creator_withdraw(&cpi_accounts, &[treasury_seeds])?;

    // 6. Reload to get post-CPI balance
    ctx.accounts.treasury_quote_token.reload()?;
    let total_withdrawn = ctx
        .accounts
        .treasury_quote_token
        .amount
        .saturating_sub(balance_before);

    // 7. Calculate 75/25 split
    //    PRD §6: 75% → LP (stays in treasury until launch_pool), 25% → treasury for milestones
    let treasury_amount = total_withdrawn
        .checked_mul(25)
        .ok_or(ExptError::MathOverflow)?
        .checked_div(100)
        .ok_or(ExptError::MathOverflow)?;
    let lp_amount = total_withdrawn
        .checked_sub(treasury_amount)
        .ok_or(ExptError::MathOverflow)?;

    // 8. Update ExptConfig
    {
        let mut config = ctx.accounts.expt_config.load_mut()?;
        config.presale_funds_withdrawn = 1;
        config.total_treasury_received = treasury_amount;
    }

    // 9. Emit event
    emit!(EvtPresaleFundsWithdrawn {
        expt_config: ctx.accounts.expt_config.key(),
        presale: presale_key,
        total_withdrawn,
        treasury_amount,
        lp_amount,
    });

    Ok(())
}
