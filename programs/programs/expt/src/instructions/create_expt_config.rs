use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::ExptError;
use crate::events::EvtExptConfigCreated;
use crate::state::*;

/// Arguments for creating a milestone
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneArg {
    pub description: [u8; MAX_MILESTONE_DESC_LEN],
    pub deliverable_type: u8,
    pub unlock_bps: u16,
    pub deadline: u64,
}

/// Arguments for creating an experiment
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateExptConfigArgs {
    pub name: [u8; MAX_NAME_LEN],
    pub uri: [u8; MAX_URI_LEN],
    pub presale_minimum_cap: u64,
    pub veto_threshold_bps: u16,
    pub challenge_window: u64,
    pub milestones: Vec<MilestoneArg>,
}

#[derive(Accounts)]
pub struct CreateExptConfigCtx<'info> {
    /// Builder creating the experiment
    #[account(mut)]
    pub builder: Signer<'info>,

    /// ExptConfig PDA — one active experiment per builder
    #[account(
        init,
        payer = builder,
        space = ExptConfig::SPACE,
        seeds = [seeds::EXPT_CONFIG_PREFIX, builder.key().as_ref()],
        bump,
    )]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — holds SOL for the experiment
    /// CHECK: Created as a system account, validated by seeds
    #[account(
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Meteora presale vault account
    /// CHECK: Validated at runtime by checking owner program
    pub presale: UncheckedAccount<'info>,

    /// Expt Coin mint (created externally or passed in)
    /// CHECK: Validated by caller — mint creation is handled separately
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_expt_config(
    ctx: Context<CreateExptConfigCtx>,
    args: CreateExptConfigArgs,
) -> Result<()> {
    // 1. Validate milestone count
    let milestone_count = args.milestones.len();
    require!(
        milestone_count >= 1 && milestone_count <= MAX_MILESTONES,
        ExptError::InvalidMilestoneCount
    );

    // 2. Validate presale parameters
    require!(args.presale_minimum_cap > 0, ExptError::ZeroMinimumCap);

    // 3. Validate milestone unlock BPS sum to <= 10000
    let total_bps: u32 = args.milestones.iter().map(|m| m.unlock_bps as u32).sum();
    require!(
        total_bps <= BPS_DENOMINATOR as u32,
        ExptError::MilestoneUnlockBpsOverflow
    );

    // 4. Validate veto threshold
    require!(
        args.veto_threshold_bps > 0 && args.veto_threshold_bps <= BPS_DENOMINATOR,
        ExptError::InvalidPresaleParams
    );

    // 5. Validate challenge window
    require!(args.challenge_window > 0, ExptError::InvalidPresaleParams);

    // 6. Initialize the ExptConfig
    let mut config = ctx.accounts.expt_config.load_init()?;
    config.builder = ctx.accounts.builder.key();
    config.name = args.name;
    config.uri = args.uri;
    config.presale = ctx.accounts.presale.key();
    config.mint = ctx.accounts.mint.key();
    config.treasury_bump = ctx.bumps.treasury;
    config.status = ExptStatus::Created.into();
    config.milestone_count = milestone_count as u8;
    config.presale_minimum_cap = args.presale_minimum_cap;
    config.veto_threshold_bps = args.veto_threshold_bps;
    config.challenge_window = args.challenge_window;

    // 7. Initialize milestones
    for (i, milestone_arg) in args.milestones.iter().enumerate() {
        // Validate deliverable type
        let _deliverable_type: DeliverableType = milestone_arg
            .deliverable_type
            .try_into()
            .map_err(|_| ExptError::InvalidMilestoneConfig)?;

        // Validate deadline
        require!(milestone_arg.deadline > 0, ExptError::InvalidMilestoneDeadline);
        require!(milestone_arg.unlock_bps > 0, ExptError::InvalidMilestoneConfig);

        config.milestones[i].description = milestone_arg.description;
        config.milestones[i].deliverable_type = milestone_arg.deliverable_type;
        config.milestones[i].unlock_bps = milestone_arg.unlock_bps;
        config.milestones[i].deadline = milestone_arg.deadline;
        config.milestones[i].status = MilestoneStatus::Pending.into();
    }

    // 8. Emit event
    emit!(EvtExptConfigCreated {
        expt_config: ctx.accounts.expt_config.key(),
        builder: ctx.accounts.builder.key(),
        presale: ctx.accounts.presale.key(),
        mint: ctx.accounts.mint.key(),
        name: args.name,
        milestone_count: milestone_count as u8,
        presale_minimum_cap: args.presale_minimum_cap,
        veto_threshold_bps: args.veto_threshold_bps,
        challenge_window: args.challenge_window,
    });

    Ok(())
}
