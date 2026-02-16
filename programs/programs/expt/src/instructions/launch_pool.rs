use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::cpi_interfaces::damm_v2::*;
use crate::errors::ExptError;
use crate::events::EvtPoolLaunched;
use crate::math;
use crate::state::*;
use crate::constants::seeds;

/// Launch a DAMM v2 pool after presale succeeds.
///
/// This instruction:
/// 1. Creates a customizable DAMM v2 pool with anti-sniper fees
/// 2. Computes pool params on-chain from treasury balances:
///    - 100% of tokens → LP
///    - 75% of SOL → LP, 25% stays for builder milestone claims
///    - sqrtPrice, ±10x concentrated range, liquidity (Q64.64)
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

    /// Treasury's token A account (holds the Expt Coin supply minted during create)
    #[account(mut)]
    pub treasury_token_a: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Treasury's token B account (WSOL — funded by withdraw_presale_funds)
    #[account(mut)]
    pub treasury_token_b: Box<InterfaceAccount<'info, TokenAccount>>,

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

/// Arguments for launch_pool
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LaunchPoolArgs {
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

    // 2. Compute pool parameters on-chain from treasury balances
    //    - 100% of tokens → LP
    //    - 75% of SOL → LP (25% stays for builder milestone claims)
    //    - sqrtPrice, ±10x concentrated range, liquidity (Q64.64)
    let (token_a_amount, token_b_amount, sqrt_price, sqrt_min_price, sqrt_max_price, liquidity) =
        math::compute_pool_params(
            ctx.accounts.treasury_token_a.amount,
            ctx.accounts.treasury_token_b.amount,
        )?;

    msg!(
        "Pool params: tokenA={}, tokenB={} (75% of {}), sqrtPrice={}, liquidity={}",
        token_a_amount,
        token_b_amount,
        ctx.accounts.treasury_token_b.amount,
        sqrt_price,
        liquidity
    );

    // 3. Build DAMM v2 pool parameters
    //    Fee schedule: Anti-sniper — starts at 50%, decays to ~1% over 120 seconds
    //    Formula: fee × (1 − reduction_factor/10_000)^period
    //    Dynamic fees enabled for volatility-responsive pricing
    let pool_params = InitializeCustomizablePoolParameters {
        pool_fees: PoolFeeParameters {
            base_fee: BaseFeeParameters::exponential_time_scheduler(
                500_000_000,            // cliff_fee_numerator (50% = 500_000_000 / 1_000_000_000)
                12,                     // number_of_period (12 decay steps)
                10,                     // period_frequency (10 seconds per step → 120s total)
                2783,                   // reduction_factor: (1-2783/10000)^12 ≈ 0.02 → 50%×0.02 ≈ 1%
            ),
            dynamic_fee: Some(DynamicFeeParameters {
                bin_step: 1,                  // DAMM v2 forces bin_step = 1 bps in v1
                bin_step_u128: 1844674407370955, // Q64.64 of 1 bps (forced default)
                filter_period: 10,            // 10-second filter for volatility smoothing
                decay_period: 120,            // 2-minute decay for volatility reference reset
                reduction_factor: 5000,       // 50% reduction factor for variable fee
                max_volatility_accumulator: 350_000,  // Cap on volatility accumulator
                variable_fee_control: 40_000, // Controls sensitivity of variable fee to volatility
            }),
        },
        sqrt_min_price,
        sqrt_max_price,
        has_alpha_vault: false,
        liquidity,
        sqrt_price,
        activation_type: 1,   // Timestamp-based
        collect_fee_mode: 1,  // Quote token only
        activation_point: args.activation_point,
    };

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

    // 4. Fund treasury PDA with SOL for rent payments during DAMM v2 CPI
    //    Treasury PDA must be the payer because DAMM v2 uses payer as the
    //    TransferChecked authority, and treasury PDA owns the token accounts.
    let rent_funding = 100_000_000; // 0.1 SOL for pool + vaults + position rent
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        rent_funding,
    )?;

    // 5. CPI: initialize_customizable_pool
    // Treasury PDA is BOTH creator (index 0) and payer (index 3).
    // It signs via invoke_signed, owns the token accounts, and pays rent.
    let cpi_accounts = [
        ctx.accounts.treasury.to_account_info(),          // 0: creator (treasury PDA)
        ctx.accounts.position_nft_mint.to_account_info(), // 1: position_nft_mint
        ctx.accounts.position_nft_account.to_account_info(), // 2: position_nft_account
        ctx.accounts.treasury.to_account_info(),           // 3: payer = treasury PDA (signer via invoke_signed)
        ctx.accounts.damm_pool_authority.to_account_info(), // 4: pool_authority
        ctx.accounts.damm_pool.to_account_info(),          // 5: pool
        ctx.accounts.damm_position.to_account_info(),      // 6: position
        ctx.accounts.token_a_mint.to_account_info(),       // 7: token_a_mint
        ctx.accounts.token_b_mint.to_account_info(),       // 8: token_b_mint
        ctx.accounts.token_a_vault.to_account_info(),      // 9: token_a_vault
        ctx.accounts.token_b_vault.to_account_info(),      // 10: token_b_vault
        ctx.accounts.treasury_token_a.to_account_info(),   // 11: payer_token_a (treasury's)
        ctx.accounts.treasury_token_b.to_account_info(),   // 12: payer_token_b (treasury's)
        ctx.accounts.token_a_program.to_account_info(),    // 13: token_a_program
        ctx.accounts.token_b_program.to_account_info(),    // 14: token_b_program
        ctx.accounts.token_2022_program.to_account_info(), // 15: token_2022_program
        ctx.accounts.system_program.to_account_info(),     // 16: system_program
        ctx.accounts.event_authority.to_account_info(),    // 17: event_authority
        ctx.accounts.damm_v2_program.to_account_info(),    // 18: damm_v2_program (self-ref)
    ];

    cpi_initialize_customizable_pool(
        &cpi_accounts,
        pool_params,
        &[treasury_seeds],
    )?;

    // 6. CPI: permanent_lock_position
    // Lock ALL liquidity permanently using the computed liquidity amount.
    let lock_accounts = [
        ctx.accounts.damm_pool.to_account_info(),          // 0: pool
        ctx.accounts.damm_position.to_account_info(),      // 1: position
        ctx.accounts.position_nft_account.to_account_info(), // 2: position_nft_account
        ctx.accounts.treasury.to_account_info(),           // 3: owner (treasury)
        ctx.accounts.event_authority.to_account_info(),    // 4: event_authority
        ctx.accounts.damm_v2_program.to_account_info(),    // 5: damm_v2_program (self-ref)
    ];

    cpi_permanent_lock_position(
        &lock_accounts,
        liquidity, // Lock exactly the liquidity we deposited
        &[treasury_seeds],
    )?;

    // 7. Update ExptConfig with pool info
    {
        let mut config = ctx.accounts.expt_config.load_mut()?;
        config.pool_launched = 1;
        config.damm_pool = ctx.accounts.damm_pool.key();
        config.position_nft_mint = ctx.accounts.position_nft_mint.key();
        config.lp_position = ctx.accounts.damm_position.key();
    }

    // 8. Emit event
    emit!(EvtPoolLaunched {
        expt_config: ctx.accounts.expt_config.key(),
        damm_pool: ctx.accounts.damm_pool.key(),
        position_nft_mint: ctx.accounts.position_nft_mint.key(),
        lp_position: ctx.accounts.damm_position.key(),
        token_a_amount,
        token_b_amount,
    });

    Ok(())
}
