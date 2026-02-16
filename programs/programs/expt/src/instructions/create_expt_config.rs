use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_2022::spl_token_2022::instruction::AuthorityType;
use anchor_spl::token_interface::{
    self, Mint, MintTo, SetAuthority, TokenAccount, TokenInterface,
};

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
    /// Total token supply to mint (in smallest units)
    pub total_supply: u64,
    /// Token decimals (typically 9)
    pub decimals: u8,
}

#[derive(Accounts)]
#[instruction(args: CreateExptConfigArgs)]
pub struct CreateExptConfigCtx<'info> {
    /// Builder creating the experiment
    #[account(mut)]
    pub builder: Signer<'info>,

    /// ExptConfig PDA — unique per builder+mint pair
    #[account(
        init,
        payer = builder,
        space = ExptConfig::SPACE,
        seeds = [seeds::EXPT_CONFIG_PREFIX, builder.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// Treasury PDA — holds SOL and tokens for the experiment
    /// CHECK: Created as a system account, validated by seeds
    #[account(
        seeds = [seeds::TREASURY_PREFIX, expt_config.key().as_ref()],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// Expt Coin mint — created on-chain by this instruction.
    /// Pass a fresh Keypair. Treasury PDA is set as the initial mint authority.
    #[account(
        init,
        payer = builder,
        mint::decimals = args.decimals,
        mint::authority = treasury,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// Treasury's token account for the Expt Coin.
    /// Initialized here to hold the total supply.
    #[account(
        init,
        payer = builder,
        associated_token::mint = mint,
        associated_token::authority = treasury,
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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

    // 6. Validate total supply
    require!(args.total_supply > 0, ExptError::InvalidPresaleParams);

    // 7. Initialize the ExptConfig
    let mut config = ctx.accounts.expt_config.load_init()?;
    config.builder = ctx.accounts.builder.key();
    config.name = args.name;
    config.uri = args.uri;
    config.presale = Pubkey::default(); // Set later by initialize_presale_from_treasury
    config.mint = ctx.accounts.mint.key();
    config.treasury_bump = ctx.bumps.treasury;
    config.status = ExptStatus::Created.into();
    config.milestone_count = milestone_count as u8;
    config.presale_minimum_cap = args.presale_minimum_cap;
    config.veto_threshold_bps = args.veto_threshold_bps;
    config.challenge_window = args.challenge_window;
    config.total_supply = args.total_supply;

    // 8. Initialize milestones
    for (i, milestone_arg) in args.milestones.iter().enumerate() {
        let _deliverable_type: DeliverableType = milestone_arg
            .deliverable_type
            .try_into()
            .map_err(|_| ExptError::InvalidMilestoneConfig)?;

        require!(milestone_arg.deadline > 0, ExptError::InvalidMilestoneDeadline);
        require!(milestone_arg.unlock_bps > 0, ExptError::InvalidMilestoneConfig);

        config.milestones[i].description = milestone_arg.description;
        config.milestones[i].deliverable_type = milestone_arg.deliverable_type;
        config.milestones[i].unlock_bps = milestone_arg.unlock_bps;
        config.milestones[i].deadline = milestone_arg.deadline;
        config.milestones[i].status = MilestoneStatus::Pending.into();
    }
    // Must drop config before the CPI calls (borrow checker)
    drop(config);

    // 9. Mint total supply to treasury's ATA (treasury PDA signs as mint authority)
    let expt_config_key = ctx.accounts.expt_config.key();
    let treasury_seeds: &[&[u8]] = &[
        seeds::TREASURY_PREFIX,
        expt_config_key.as_ref(),
        &[ctx.bumps.treasury],
    ];

    token_interface::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_token.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            &[treasury_seeds],
        ),
        args.total_supply,
    )?;

    // 10. Revoke mint authority permanently — no more tokens can ever be minted
    token_interface::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.treasury.to_account_info(),
                account_or_mint: ctx.accounts.mint.to_account_info(),
            },
            &[treasury_seeds],
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    // 11. Emit event
    emit!(EvtExptConfigCreated {
        expt_config: ctx.accounts.expt_config.key(),
        builder: ctx.accounts.builder.key(),
        presale: Pubkey::default(),
        mint: ctx.accounts.mint.key(),
        name: args.name,
        milestone_count: milestone_count as u8,
        presale_minimum_cap: args.presale_minimum_cap,
        veto_threshold_bps: args.veto_threshold_bps,
        challenge_window: args.challenge_window,
    });

    Ok(())
}
