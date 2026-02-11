use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;

mod state;
pub use state::*;

mod instructions;
pub use instructions::*;

pub mod cpi_interfaces;

declare_id!("9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw");

#[program]
pub mod expt {
    use super::*;

    /// Create a new experiment with presale parameters and milestones.
    /// One active experiment per builder wallet.
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
}
