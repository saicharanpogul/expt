/// Raw CPI interface for reading Meteora Presale program state.
///
/// We do NOT depend on the presale crate. Instead we read the presale account
/// data directly and deserialize only the fields we need.
use anchor_lang::prelude::*;

/// Meteora Presale program ID
pub const PRESALE_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj");

/// Minimal representation of the Meteora Presale account.
/// We only read the fields we need for finalization.
/// Based on the Presale struct from context-programs/presale.
///
/// Layout offsets (zero_copy with 8-byte anchor discriminator):
///   8  + 0   = owner (32 bytes)
///   8  + 32  = quote_mint (32 bytes)
///   8  + 64  = base_mint (32 bytes)
///   ...
///   8  + 200 = presale_maximum_cap (u64)
///   8  + 208 = presale_minimum_cap (u64)
///   8  + 216 = presale_start_time (u64)
///   8  + 224 = presale_end_time (u64)
///   8  + 232 = presale_supply (u64)
///   8  + 240 = total_deposit (u64)
#[derive(Debug)]
pub struct PresaleState {
    pub owner: Pubkey,
    pub presale_minimum_cap: u64,
    pub presale_end_time: u64,
    pub total_deposit: u64,
}

impl PresaleState {
    /// Deserialize minimal presale state from raw account data.
    /// Offsets based on the Meteora Presale zero_copy layout.
    pub fn from_account_data(data: &[u8]) -> Result<Self> {
        // Anchor discriminator is 8 bytes
        const DISC: usize = 8;

        if data.len() < DISC + 248 {
            return Err(ProgramError::InvalidAccountData.into());
        }

        // owner at offset 0 (after discriminator)
        let owner = Pubkey::try_from(&data[DISC..DISC + 32])
            .map_err(|_| ProgramError::InvalidAccountData)?;

        // presale_minimum_cap at byte offset 208
        let presale_minimum_cap =
            u64::from_le_bytes(data[DISC + 208..DISC + 216].try_into().unwrap());

        // presale_end_time at byte offset 224
        let presale_end_time =
            u64::from_le_bytes(data[DISC + 224..DISC + 232].try_into().unwrap());

        // total_deposit at byte offset 240
        let total_deposit =
            u64::from_le_bytes(data[DISC + 240..DISC + 248].try_into().unwrap());

        Ok(Self {
            owner,
            presale_minimum_cap,
            presale_end_time,
            total_deposit,
        })
    }
}
