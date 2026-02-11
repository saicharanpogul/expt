use anchor_lang::prelude::*;

declare_id!("9EY3BccFR7QprDNFbZ2fqy5t6wzgpiAYg24mcjYu5nYw");

#[program]
pub mod expt {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
