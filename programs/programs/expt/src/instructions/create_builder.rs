use anchor_lang::prelude::*;

use crate::constants::seeds;
use crate::errors::ExptError;
use crate::events::EvtBuilderCreated;
use crate::state::*;

/// Arguments for creating a builder profile
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateBuilderArgs {
    /// X (Twitter) username — mandatory
    pub x_username: String,
    /// GitHub username — optional
    pub github: Option<String>,
    /// Telegram username — optional
    pub telegram: Option<String>,
}

#[derive(Accounts)]
pub struct CreateBuilderCtx<'info> {
    /// Builder wallet
    #[account(mut)]
    pub wallet: Signer<'info>,

    /// Builder PDA — unique per wallet
    #[account(
        init,
        payer = wallet,
        space = Builder::SPACE,
        seeds = [seeds::BUILDER_PREFIX, wallet.key().as_ref()],
        bump,
    )]
    pub builder: AccountLoader<'info, Builder>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_builder(
    ctx: Context<CreateBuilderCtx>,
    args: CreateBuilderArgs,
) -> Result<()> {
    // 1. Validate X username is not empty
    let x_trimmed = args.x_username.trim();
    require!(!x_trimmed.is_empty(), ExptError::MissingXUsername);
    require!(
        x_trimmed.len() <= MAX_X_USERNAME_LEN,
        ExptError::InvalidName
    );

    // 2. Build fixed-size arrays
    let mut x_bytes = [0u8; MAX_X_USERNAME_LEN];
    x_bytes[..x_trimmed.len()].copy_from_slice(x_trimmed.as_bytes());

    let mut github_bytes = [0u8; MAX_GITHUB_LEN];
    if let Some(ref gh) = args.github {
        let gh_trimmed = gh.trim();
        if !gh_trimmed.is_empty() {
            require!(gh_trimmed.len() <= MAX_GITHUB_LEN, ExptError::InvalidName);
            github_bytes[..gh_trimmed.len()].copy_from_slice(gh_trimmed.as_bytes());
        }
    }

    let mut telegram_bytes = [0u8; MAX_TELEGRAM_LEN];
    if let Some(ref tg) = args.telegram {
        let tg_trimmed = tg.trim();
        if !tg_trimmed.is_empty() {
            require!(
                tg_trimmed.len() <= MAX_TELEGRAM_LEN,
                ExptError::InvalidName
            );
            telegram_bytes[..tg_trimmed.len()].copy_from_slice(tg_trimmed.as_bytes());
        }
    }

    // 3. Initialize the Builder account
    let mut builder = ctx.accounts.builder.load_init()?;
    builder.wallet = ctx.accounts.wallet.key();
    builder.x_username = x_bytes;
    builder.github = github_bytes;
    builder.telegram = telegram_bytes;
    builder.active_experiment = Pubkey::default();
    builder.experiment_count = 0;
    builder.created_at = Clock::get()?.unix_timestamp;

    // 4. Emit event
    emit!(EvtBuilderCreated {
        builder: ctx.accounts.builder.key(),
        wallet: ctx.accounts.wallet.key(),
        x_username: args.x_username,
    });

    Ok(())
}
