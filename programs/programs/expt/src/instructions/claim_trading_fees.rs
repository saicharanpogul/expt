use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::cpi_interfaces::damm_v2::*;
use crate::errors::ExptError;
use crate::events::EvtTradingFeesClaimed;
use crate::state::*;
use crate::constants::seeds;

/// Claim accrued trading fees from the DAMM v2 pool into the treasury.
///
/// Permissionless — anyone can trigger this after pool is launched
/// and at least one milestone has passed (PRD §7).
///
/// The treasury PDA owns the position NFT, so it can sign the CPI
/// to claim fees. Fees are deposited into the treasury's token accounts.
#[derive(Accounts)]
pub struct ClaimTradingFeesCtx<'info> {
    /// Anyone can trigger fee collection
    pub payer: Signer<'info>,

    /// Expt config (for reading pool info)
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — owns the position NFT and receives fees
    /// CHECK: Validated by seeds
    #[account(
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    // ----- DAMM v2 accounts -----

    /// CHECK: DAMM v2 pool authority
    #[account(address = DAMM_V2_POOL_AUTHORITY)]
    pub damm_pool_authority: UncheckedAccount<'info>,

    /// CHECK: DAMM v2 pool
    pub damm_pool: UncheckedAccount<'info>,

    /// CHECK: LP position (writable for fee state update)
    #[account(mut)]
    pub damm_position: UncheckedAccount<'info>,

    /// Treasury's token A account (receives fee in token A)
    #[account(mut)]
    pub treasury_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Treasury's token B account (receives fee in token B / SOL)
    #[account(mut)]
    pub treasury_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token A vault (DAMM pool vault)
    #[account(mut)]
    pub token_a_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token B vault (DAMM pool vault)
    #[account(mut)]
    pub token_b_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token A mint
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token B mint
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Position NFT account (proves treasury owns the LP position)
    pub position_nft_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token A program
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token B program
    pub token_b_program: Interface<'info, TokenInterface>,

    /// CHECK: DAMM v2 program
    #[account(address = DAMM_V2_PROGRAM_ID)]
    pub damm_v2_program: UncheckedAccount<'info>,

    /// CHECK: DAMM v2 event authority
    pub event_authority: UncheckedAccount<'info>,
}

pub fn handle_claim_trading_fees(ctx: Context<ClaimTradingFeesCtx>) -> Result<()> {
    // 1. Validate experiment state
    let (treasury_bump, damm_pool_key) = {
        let config = ctx.accounts.expt_config.load()?;

        // Pool must be launched
        require!(config.pool_launched == 1, ExptError::PoolNotLaunched);

        // At least one milestone must have passed (PRD §7)
        require!(
            config.has_any_milestone_passed(),
            ExptError::NoMilestonesPassed
        );

        // Validate the pool account matches
        require!(
            config.damm_pool == ctx.accounts.damm_pool.key(),
            ExptError::InvalidStatus
        );

        (config.treasury_bump, config.damm_pool)
    };

    // 2. Record balances before CPI (to calculate actual fees claimed)
    let balance_a_before = ctx.accounts.treasury_token_a.amount;
    let balance_b_before = ctx.accounts.treasury_token_b.amount;

    // 3. CPI: claim_position_fee
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_seeds: &[&[u8]] = &[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[treasury_bump],
    ];

    let cpi_accounts = [
        ctx.accounts.damm_pool_authority.to_account_info(),   // 0: pool_authority
        ctx.accounts.damm_pool.to_account_info(),             // 1: pool
        ctx.accounts.damm_position.to_account_info(),         // 2: position
        ctx.accounts.treasury_token_a.to_account_info(),      // 3: token_a_account (dest)
        ctx.accounts.treasury_token_b.to_account_info(),      // 4: token_b_account (dest)
        ctx.accounts.token_a_vault.to_account_info(),         // 5: token_a_vault
        ctx.accounts.token_b_vault.to_account_info(),         // 6: token_b_vault
        ctx.accounts.token_a_mint.to_account_info(),          // 7: token_a_mint
        ctx.accounts.token_b_mint.to_account_info(),          // 8: token_b_mint
        ctx.accounts.position_nft_account.to_account_info(),  // 9: position_nft_account
        ctx.accounts.treasury.to_account_info(),              // 10: owner (treasury PDA)
        ctx.accounts.token_a_program.to_account_info(),       // 11: token_a_program
        ctx.accounts.token_b_program.to_account_info(),       // 12: token_b_program
        ctx.accounts.event_authority.to_account_info(),       // 13: event_authority
        ctx.accounts.damm_v2_program.to_account_info(),       // 14: damm_v2_program (self-ref)
    ];

    cpi_claim_position_fee(
        &cpi_accounts,
        &[treasury_seeds],
    )?;

    // 4. Reload accounts to get post-CPI balances
    ctx.accounts.treasury_token_a.reload()?;
    ctx.accounts.treasury_token_b.reload()?;

    let fee_a = ctx
        .accounts
        .treasury_token_a
        .amount
        .saturating_sub(balance_a_before);
    let fee_b = ctx
        .accounts
        .treasury_token_b
        .amount
        .saturating_sub(balance_b_before);

    // 5. Emit event
    emit!(EvtTradingFeesClaimed {
        expt_config: ctx.accounts.expt_config.key(),
        damm_pool: damm_pool_key,
        fee_a_claimed: fee_a,
        fee_b_claimed: fee_b,
    });

    Ok(())
}
