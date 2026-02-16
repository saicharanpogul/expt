use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::cpi_interfaces::presale::*;
use crate::errors::ExptError;
use crate::state::*;
use crate::constants::seeds;

/// Arguments for initializing a presale from the treasury
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitPresaleFromTreasuryArgs {
    pub presale_maximum_cap: u64,
    pub presale_minimum_cap: u64,
    pub presale_start_time: u64,
    pub presale_end_time: u64,
    /// Amount of experiment tokens to deposit into the presale vault
    pub presale_supply: u64,
    /// Minimum deposit per buyer (in quote token lamports)
    pub buyer_min_deposit_cap: u64,
    /// Maximum deposit per buyer (in quote token lamports)
    pub buyer_max_deposit_cap: u64,
}

/// Initialize a Meteora presale using tokens from the treasury.
///
/// Must be called after `create_expt_config` which mints total supply to treasury.
/// Only the builder can call this. Stores the presale PDA on ExptConfig.
#[derive(Accounts)]
pub struct InitPresaleFromTreasuryCtx<'info> {
    /// Builder who created the experiment
    #[account(mut)]
    pub builder: Signer<'info>,

    /// ExptConfig PDA (writable — we store the presale pubkey)
    #[account(
        mut,
        has_one = builder @ ExptError::Unauthorized,
    )]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — owns the presale tokens and becomes presale owner
    /// Also acts as payer for Meteora presale account creation (funded by builder)
    /// CHECK: Validated by seeds
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Treasury's token account holding experiment tokens (source for presale)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = treasury,
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,

    /// Random keypair used for presale PDA derivation (Meteora requires this)
    pub base: Signer<'info>,

    /// Experiment token mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Quote token mint (e.g. WSOL)
    pub quote_mint: InterfaceAccount<'info, Mint>,

    // ----- Meteora Presale accounts -----

    /// Presale PDA (will be initialized by Meteora)
    /// CHECK: Created by Meteora CPI
    #[account(mut)]
    pub presale: UncheckedAccount<'info>,

    /// CHECK: Presale authority PDA (const in presale program)
    #[account(address = PRESALE_AUTHORITY)]
    pub presale_authority: UncheckedAccount<'info>,

    /// Presale vault for base tokens (will be initialized by Meteora)
    /// CHECK: Created by Meteora CPI
    #[account(mut)]
    pub presale_vault: UncheckedAccount<'info>,

    /// Quote token vault (will be initialized by Meteora)
    /// CHECK: Created by Meteora CPI
    #[account(mut)]
    pub quote_vault: UncheckedAccount<'info>,

    /// Base token program (for experiment token)
    pub base_token_program: Interface<'info, TokenInterface>,

    /// Quote token program (for WSOL)
    pub quote_token_program: Interface<'info, TokenInterface>,

    /// CHECK: Meteora Presale program
    #[account(address = PRESALE_PROGRAM_ID)]
    pub presale_program: UncheckedAccount<'info>,

    /// CHECK: Event authority PDA for Meteora's #[event_cpi] pattern
    pub event_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_presale_from_treasury(
    ctx: Context<InitPresaleFromTreasuryCtx>,
    args: InitPresaleFromTreasuryArgs,
) -> Result<()> {
    // 1. Validate ExptConfig state
    {
        let config = ctx.accounts.expt_config.load()?;

        // Must be in Created status
        let status: ExptStatus = config
            .status
            .try_into()
            .map_err(|_| ExptError::InvalidStatus)?;
        require!(status == ExptStatus::Created, ExptError::InvalidStatus);

        // Presale must not already be set
        require!(
            config.presale == Pubkey::default(),
            ExptError::PresaleAlreadyInitialized
        );

        // Mint must match
        require!(
            config.mint == ctx.accounts.mint.key(),
            ExptError::InvalidPresaleParams
        );
    }

    // 2. Validate presale supply doesn't exceed treasury balance
    require!(
        args.presale_supply > 0,
        ExptError::InvalidPresaleParams
    );
    require!(
        ctx.accounts.treasury_token.amount >= args.presale_supply,
        ExptError::InsufficientTreasuryBalance
    );

    // 3. Validate timing
    require!(
        args.presale_start_time < args.presale_end_time,
        ExptError::InvalidPresaleParams
    );

    // 4. Fund treasury PDA with SOL for rent payments during Meteora CPI
    //    The treasury PDA acts as both creator and payer in the presale init CPI,
    //    so it needs SOL to pay for the presale account, vaults, etc.
    let rent_funding = 100_000_000; // 0.1 SOL (covers presale + 2 vault accounts rent)
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.builder.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        rent_funding,
    )?;

    // 5. CPI: initialize_presale
    //    Treasury PDA is BOTH creator and payer for Meteora:
    //    - creator (index 7): will become presale.owner for withdrawal
    //    - payer (index 9): pays rent and is token transfer authority
    //    Since treasury PDA owns the token account, it must be the payer
    //    for the TransferChecked that Meteora performs internally.
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_seeds: &[&[u8]] = &[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[ctx.bumps.treasury],
    ];

    let cpi_accounts = [
        ctx.accounts.mint.to_account_info(),               // 0: presale_mint
        ctx.accounts.presale.to_account_info(),             // 1: presale (writable)
        ctx.accounts.presale_authority.to_account_info(),   // 2: presale_authority
        ctx.accounts.quote_mint.to_account_info(),          // 3: quote_token_mint
        ctx.accounts.presale_vault.to_account_info(),       // 4: presale_vault (writable)
        ctx.accounts.quote_vault.to_account_info(),         // 5: quote_token_vault (writable)
        ctx.accounts.treasury_token.to_account_info(),      // 6: payer_presale_token (treasury ATA)
        ctx.accounts.treasury.to_account_info(),            // 7: creator (treasury PDA)
        ctx.accounts.base.to_account_info(),                // 8: base (signer)
        ctx.accounts.treasury.to_account_info(),            // 9: payer = treasury PDA (signer via invoke_signed)
        ctx.accounts.base_token_program.to_account_info(),  // 10: base_token_program
        ctx.accounts.quote_token_program.to_account_info(), // 11: quote_token_program
        ctx.accounts.system_program.to_account_info(),      // 12: system_program
        ctx.accounts.event_authority.to_account_info(),     // 13: event_authority (for #[event_cpi])
        ctx.accounts.presale_program.to_account_info(),     // 14: presale program (for invoke_signed)
    ];

    let cpi_args = InitPresaleCpiArgs {
        presale_maximum_cap: args.presale_maximum_cap,
        presale_minimum_cap: args.presale_minimum_cap,
        presale_start_time: args.presale_start_time,
        presale_end_time: args.presale_end_time,
        presale_supply: args.presale_supply,
        buyer_min_deposit_cap: args.buyer_min_deposit_cap,
        buyer_max_deposit_cap: args.buyer_max_deposit_cap,
    };

    cpi_initialize_presale(&cpi_accounts, &[treasury_seeds], &cpi_args)?;

    // 5. Store presale PDA on ExptConfig
    {
        let mut config = ctx.accounts.expt_config.load_mut()?;
        config.presale = ctx.accounts.presale.key();
    }

    msg!("Presale initialized from treasury: {}", ctx.accounts.presale.key());

    Ok(())
}
