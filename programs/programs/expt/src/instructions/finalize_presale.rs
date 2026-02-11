use anchor_lang::prelude::*;

use crate::cpi_interfaces::presale::{PresaleState, PRESALE_PROGRAM_ID};
use crate::errors::ExptError;
use crate::events::EvtPresaleFinalized;
use crate::state::*;

#[derive(Accounts)]
pub struct FinalizePresaleCtx<'info> {
    /// Anyone can finalize after presale ends
    #[account(mut)]
    pub payer: Signer<'info>,

    /// ExptConfig PDA
    #[account(mut)]
    pub expt_config: AccountLoader<'info, ExptConfig>,

    /// The Meteora presale vault referenced in ExptConfig
    /// CHECK: Validated by owner check and key match against expt_config.presale
    #[account(
        owner = PRESALE_PROGRAM_ID,
    )]
    pub presale: UncheckedAccount<'info>,
}

pub fn handle_finalize_presale(ctx: Context<FinalizePresaleCtx>) -> Result<()> {
    let mut config = ctx.accounts.expt_config.load_mut()?;

    // 1. Ensure experiment is in Created or PresaleActive status
    let status: ExptStatus = config
        .status
        .try_into()
        .map_err(|_| ExptError::InvalidStatus)?;
    require!(
        status == ExptStatus::Created || status == ExptStatus::PresaleActive,
        ExptError::InvalidStatus
    );

    // 2. Validate presale account matches config
    require!(
        ctx.accounts.presale.key() == config.presale,
        ExptError::InvalidPresaleAccount
    );

    // 3. Read Meteora presale state
    let presale_data = ctx.accounts.presale.try_borrow_data()?;
    let presale_state = PresaleState::from_account_data(&presale_data)?;

    // 4. Ensure presale has ended
    let current_timestamp = Clock::get()?.unix_timestamp as u64;
    require!(
        current_timestamp >= presale_state.presale_end_time,
        ExptError::PresaleNotEnded
    );

    // 5. Determine outcome
    if presale_state.total_deposit >= presale_state.presale_minimum_cap {
        // Presale succeeded — move to Active status.
        // Funds are NOT moved here. The withdraw_presale_funds instruction
        // will CPI creator_withdraw and set total_treasury_received correctly.
        config.status = ExptStatus::Active.into();
    } else {
        // Presale failed — minimum not met
        config.status = ExptStatus::PresaleFailed.into();
    }

    let new_status = config.status;
    let total_deposit = presale_state.total_deposit;
    drop(presale_data);

    // 6. Emit event
    emit!(EvtPresaleFinalized {
        expt_config: ctx.accounts.expt_config.key(),
        new_status,
        total_deposit,
    });

    Ok(())
}
