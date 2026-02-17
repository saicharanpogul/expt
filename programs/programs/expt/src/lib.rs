use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod math;

mod state;
pub use state::*;

mod instructions;
pub use instructions::*;

pub mod cpi_interfaces;

declare_id!("9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw");

#[allow(deprecated)]
#[program]
pub mod expt {
    use super::*;

    /// Create a builder profile with identity info.
    /// Must be called before create_expt_config.
    pub fn create_builder(
        ctx: Context<CreateBuilderCtx>,
        args: CreateBuilderArgs,
    ) -> Result<()> {
        instructions::handle_create_builder(ctx, args)
    }

    /// Create a new experiment with presale parameters and milestones.
    /// Requires an existing Builder PDA. One active experiment per builder wallet.
    pub fn create_expt_config(
        ctx: Context<CreateExptConfigCtx>,
        args: CreateExptConfigArgs,
    ) -> Result<()> {
        instructions::handle_create_expt_config(ctx, args)
    }

    /// Finalize the presale by reading Meteora presale vault state.
    /// Permissionless — anyone can call after presale ends.
    pub fn finalize_presale(ctx: Context<FinalizePresaleCtx>) -> Result<()> {
        instructions::handle_finalize_presale(ctx)
    }

    /// Builder submits proof for a milestone, opening the challenge window.
    pub fn submit_milestone(
        ctx: Context<SubmitMilestoneCtx>,
        args: SubmitMilestoneArgs,
    ) -> Result<()> {
        instructions::handle_submit_milestone(ctx, args)
    }

    /// Holder stakes SOL against a submitted milestone to veto it.
    pub fn initiate_veto(ctx: Context<InitiateVetoCtx>, args: InitiateVetoArgs) -> Result<()> {
        instructions::handle_initiate_veto(ctx, args)
    }

    /// Resolve a milestone after the challenge window expires.
    /// Permissionless — anyone can call.
    pub fn resolve_milestone(
        ctx: Context<ResolveMilestoneCtx>,
        args: ResolveMilestoneArgs,
    ) -> Result<()> {
        instructions::handle_resolve_milestone(ctx, args)
    }

    /// Builder claims earned funds from the treasury based on passed milestones.
    pub fn claim_builder_funds(ctx: Context<ClaimBuilderFundsCtx>) -> Result<()> {
        instructions::handle_claim_builder_funds(ctx)
    }

    /// Launch a DAMM v2 pool after presale succeeds.
    /// Permissionless — anyone can trigger after finalize_presale.
    pub fn launch_pool(ctx: Context<LaunchPoolCtx>, args: LaunchPoolArgs) -> Result<()> {
        instructions::handle_launch_pool(ctx, args)
    }

    /// Claim accrued trading fees from the DAMM v2 pool.
    /// Permissionless — requires pool launched + ≥1 milestone passed.
    pub fn claim_trading_fees(ctx: Context<ClaimTradingFeesCtx>) -> Result<()> {
        instructions::handle_claim_trading_fees(ctx)
    }

    /// Withdraw raised presale funds into the treasury PDA.
    /// Permissionless — requires presale finalized + status Active.
    pub fn withdraw_presale_funds(ctx: Context<WithdrawPresaleFundsCtx>) -> Result<()> {
        instructions::handle_withdraw_presale_funds(ctx)
    }

    /// Unwrap WSOL from treasury ATA to native SOL.
    /// Must be called after withdraw_presale_funds and before claim_builder_funds.
    pub fn unwrap_treasury_wsol(ctx: Context<UnwrapTreasuryWsolCtx>) -> Result<()> {
        instructions::handle_unwrap_treasury_wsol(ctx)
    }

    /// Initialize a Meteora presale using tokens from the treasury.
    /// Only the builder can call this after create_expt_config.
    /// Tokens are transferred from treasury ATA → presale vault via CPI.
    pub fn initialize_presale_from_treasury(
        ctx: Context<InitPresaleFromTreasuryCtx>,
        args: InitPresaleFromTreasuryArgs,
    ) -> Result<()> {
        instructions::handle_initialize_presale_from_treasury(ctx, args)
    }

    /// Settle a veto stake after milestone resolution.
    /// If milestone passed → stake burned (stays in treasury).
    /// If milestone failed → stake returned to vetoer.
    /// VetoStake account is closed in both cases.
    pub fn settle_veto_stake(
        ctx: Context<SettleVetoStakeCtx>,
        args: SettleVetoStakeArgs,
    ) -> Result<()> {
        instructions::handle_settle_veto_stake(ctx, args)
    }
}
