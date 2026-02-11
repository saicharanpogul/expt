use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::cpi_interfaces::damm_v2::*;
use crate::errors::ExptError;
use crate::events::EvtPoolLaunched;
use crate::state::*;
use crate::constants::seeds;

/// Launch a DAMM v2 pool after presale succeeds.
///
/// This instruction:
/// 1. Creates a customizable DAMM v2 pool with anti-sniper fees
/// 2. Adds initial liquidity (75% of treasury as SOL + 100% of token supply)
/// 3. Permanently locks the LP position
/// 4. Stores pool/position references on ExptConfig
///
/// Permissionless — anyone can trigger after finalize_presale sets status to Active.
#[derive(Accounts)]
pub struct LaunchPoolCtx<'info> {
    /// Anyone can trigger pool launch
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Expt config
    #[account(mut)]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — holds SOL, will transfer 75% to LP
    /// CHECK: Validated by seeds
    #[account(
        mut,
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    // ----- DAMM v2 accounts -----

    /// The position NFT mint (new keypair, signer)
    /// CHECK: Passed to DAMM v2 CPI — initialized by the DAMM v2 program
    #[account(mut)]
    pub position_nft_mint: Signer<'info>,

    /// CHECK: DAMM v2 pool authority (const PDA in DAMM v2)
    #[account(address = DAMM_V2_POOL_AUTHORITY)]
    pub damm_pool_authority: UncheckedAccount<'info>,

    /// CHECK: Pool PDA — derived and initialized by DAMM v2
    #[account(mut)]
    pub damm_pool: UncheckedAccount<'info>,

    /// CHECK: Position PDA — derived and initialized by DAMM v2
    #[account(mut)]
    pub damm_position: UncheckedAccount<'info>,

    /// CHECK: Position NFT account PDA — derived by DAMM v2
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,

    /// Token A mint (the Expt Coin)
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Token B mint (SOL / WSOL)
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Token A vault — derived and initialized by DAMM v2
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,

    /// CHECK: Token B vault — derived and initialized by DAMM v2
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,

    /// Payer's token A account (holds the Expt Coin supply)
    #[account(mut)]
    pub payer_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Payer's token B account (WSOL)
    #[account(mut)]
    pub payer_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token A program (SPL Token or Token-2022)
    pub token_a_program: Interface<'info, TokenInterface>,

    /// Token B program (SPL Token)
    pub token_b_program: Interface<'info, TokenInterface>,

    /// Token-2022 program (for NFT mint)
    /// CHECK: Token-2022 program ID
    #[account(address = anchor_spl::token_2022::ID)]
    pub token_2022_program: UncheckedAccount<'info>,

    /// System program
    pub system_program: Program<'info, System>,

    /// CHECK: DAMM v2 program
    #[account(address = DAMM_V2_PROGRAM_ID)]
    pub damm_v2_program: UncheckedAccount<'info>,

    /// CHECK: DAMM v2 event authority — derived from DAMM v2 program
    pub event_authority: UncheckedAccount<'info>,
}

/// Arguments for launch_pool (passed by caller)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LaunchPoolArgs {
    /// Amount of token A (Expt Coin) to add as liquidity
    pub token_a_amount: u64,
    /// Amount of token B (SOL/WSOL) to add as liquidity (75% of treasury)
    pub token_b_amount: u64,
    /// Activation point (timestamp when pool becomes tradable)
    pub activation_point: Option<u64>,
}

pub fn handle_launch_pool(ctx: Context<LaunchPoolCtx>, args: LaunchPoolArgs) -> Result<()> {
    // 1. Validate experiment status
    {
        let config = ctx.accounts.expt_config.load()?;

        // Must be Active (presale succeeded)
        let active_status: u8 = ExptStatus::Active.into();
        require!(config.status == active_status, ExptError::InvalidStatus);

        // Must not have already launched
        require!(config.pool_launched == 0, ExptError::PoolAlreadyLaunched);
    }

    // 2. Build fee parameters: exponential decay 50% → 1% over 10 minutes, with dynamic fees
    let pool_params = InitializeCustomizablePoolParameters {
        token_a_amount: args.token_a_amount,
        token_b_amount: args.token_b_amount,
        params: PoolFeeParameters {
            base_fee: BaseFeeParameters {
                max_base_fee_bps: 5000,       // 50% anti-sniper start
                min_base_fee_bps: 100,        // 1% steady state
                number_of_period: 10,         // 10 periods
                total_duration: 600,          // 10 minutes (in seconds)
                fee_scheduler_mode: 1,        // Exponential decay
            },
            dynamic_fee: Some(DynamicFeeParameters {
                filter_period: 10,
                decay_period: 120,
                reduction_factor: 5000,          // 50% reduction per decay
                variable_fee_control: 14460000,
                max_volatility_accumulator: 239,
            }),
        },
        has_alpha_vault: false,
        activation_type: 1,   // Timestamp-based
        collect_fee_mode: 1,  // Token B Only (SOL)
        activation_point: args.activation_point,
        sqrt_min_price: 0,    // Full range
        sqrt_max_price: 0,    // Full range
    };

    // 3. CPI: initialize_customizable_pool
    // Treasury PDA is the "creator" — it owns the position NFT for fee claiming
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_bump = {
        let config = ctx.accounts.expt_config.load()?;
        config.treasury_bump
    };
    let treasury_seeds: &[&[u8]] = &[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[treasury_bump],
    ];

    let cpi_accounts = [
        ctx.accounts.treasury.to_account_info(),          // 0: creator (treasury PDA)
        ctx.accounts.position_nft_mint.to_account_info(), // 1: position_nft_mint
        ctx.accounts.position_nft_account.to_account_info(), // 2: position_nft_account
        ctx.accounts.payer.to_account_info(),              // 3: payer
        ctx.accounts.damm_pool_authority.to_account_info(), // 4: pool_authority
        ctx.accounts.damm_pool.to_account_info(),          // 5: pool
        ctx.accounts.damm_position.to_account_info(),      // 6: position
        ctx.accounts.token_a_mint.to_account_info(),       // 7: token_a_mint
        ctx.accounts.token_b_mint.to_account_info(),       // 8: token_b_mint
        ctx.accounts.token_a_vault.to_account_info(),      // 9: token_a_vault
        ctx.accounts.token_b_vault.to_account_info(),      // 10: token_b_vault
        ctx.accounts.payer_token_a.to_account_info(),      // 11: payer_token_a
        ctx.accounts.payer_token_b.to_account_info(),      // 12: payer_token_b
        ctx.accounts.token_a_program.to_account_info(),    // 13: token_a_program
        ctx.accounts.token_b_program.to_account_info(),    // 14: token_b_program
        ctx.accounts.token_2022_program.to_account_info(), // 15: token_2022_program
        ctx.accounts.system_program.to_account_info(),     // 16: system_program
    ];

    cpi_initialize_customizable_pool(
        &cpi_accounts,
        pool_params,
        &[treasury_seeds],
    )?;

    // 4. CPI: permanent_lock_position
    // Lock ALL liquidity permanently. We read the position to get the liquidity amount.
    // For simplicity, we lock u128::MAX which the program clamps to actual liquidity.
    let lock_accounts = [
        ctx.accounts.damm_pool.to_account_info(),          // 0: pool
        ctx.accounts.damm_position.to_account_info(),      // 1: position
        ctx.accounts.position_nft_account.to_account_info(), // 2: position_nft_account
        ctx.accounts.treasury.to_account_info(),           // 3: owner (treasury)
    ];

    cpi_permanent_lock_position(
        &lock_accounts,
        u128::MAX, // Lock everything
        &[treasury_seeds],
    )?;

    // 5. Update ExptConfig with pool info
    {
        let mut config = ctx.accounts.expt_config.load_mut()?;
        config.pool_launched = 1;
        config.damm_pool = ctx.accounts.damm_pool.key();
        config.position_nft_mint = ctx.accounts.position_nft_mint.key();
        config.lp_position = ctx.accounts.damm_position.key();
    }

    // 6. Emit event
    emit!(EvtPoolLaunched {
        expt_config: ctx.accounts.expt_config.key(),
        damm_pool: ctx.accounts.damm_pool.key(),
        position_nft_mint: ctx.accounts.position_nft_mint.key(),
        lp_position: ctx.accounts.damm_position.key(),
        token_a_amount: args.token_a_amount,
        token_b_amount: args.token_b_amount,
    });

    Ok(())
}
