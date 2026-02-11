/// Raw CPI interface for Meteora Presale program.
///
/// We do NOT depend on the presale crate. Instead we read the presale account
/// data directly and deserialize only the fields we need, and build CPI
/// instructions manually.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

/// Meteora Presale program ID
pub const PRESALE_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj");

/// Presale authority (const PDA derived in the presale program)
/// This is the PDA that controls the token vaults.
pub const PRESALE_AUTHORITY: Pubkey =
    anchor_lang::solana_program::pubkey!("AUh8bm2XsMfex3KjYGcM3G4uBqUNSDw6HEhWaWMYnyPH");

/// SPL Memo program ID (required by presale's creator_withdraw)
pub const MEMO_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/// Instruction discriminator for `creator_withdraw`
/// sha256("global:creator_withdraw")[..8]
const IX_CREATOR_WITHDRAW: [u8; 8] = compute_presale_discriminator("global:creator_withdraw");

/// Minimal const SHA-256 for discriminator computation.
/// Same implementation as in damm_v2.rs — only handles short strings (< 56 bytes).
const fn compute_presale_discriminator(input: &str) -> [u8; 8] {
    let hash = sha256_const_presale(input.as_bytes());
    [hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]]
}

const fn sha256_const_presale(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let bit_len = (data.len() as u64) * 8;
    let mut block = [0u8; 64];
    let mut i = 0;
    while i < data.len() {
        block[i] = data[i];
        i += 1;
    }
    block[data.len()] = 0x80;
    block[56] = (bit_len >> 56) as u8;
    block[57] = (bit_len >> 48) as u8;
    block[58] = (bit_len >> 40) as u8;
    block[59] = (bit_len >> 32) as u8;
    block[60] = (bit_len >> 24) as u8;
    block[61] = (bit_len >> 16) as u8;
    block[62] = (bit_len >> 8) as u8;
    block[63] = bit_len as u8;
    let mut w = [0u32; 64];
    i = 0;
    while i < 16 {
        w[i] = ((block[i * 4] as u32) << 24)
            | ((block[i * 4 + 1] as u32) << 16)
            | ((block[i * 4 + 2] as u32) << 8)
            | (block[i * 4 + 3] as u32);
        i += 1;
    }
    i = 16;
    while i < 64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        i += 1;
    }
    let (mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh) =
        (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]);
    i = 0;
    while i < 64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let ch = (e & f) ^ ((!e) & g);
        let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let maj = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(maj);
        hh = g; g = f; f = e; e = d.wrapping_add(temp1);
        d = c; c = b; b = a; a = temp1.wrapping_add(temp2);
        i += 1;
    }
    h[0] = h[0].wrapping_add(a); h[1] = h[1].wrapping_add(b);
    h[2] = h[2].wrapping_add(c); h[3] = h[3].wrapping_add(d);
    h[4] = h[4].wrapping_add(e); h[5] = h[5].wrapping_add(f);
    h[6] = h[6].wrapping_add(g); h[7] = h[7].wrapping_add(hh);
    let mut result = [0u8; 32];
    i = 0;
    while i < 8 {
        result[i * 4] = (h[i] >> 24) as u8;
        result[i * 4 + 1] = (h[i] >> 16) as u8;
        result[i * 4 + 2] = (h[i] >> 8) as u8;
        result[i * 4 + 3] = h[i] as u8;
        i += 1;
    }
    result
}

// ----- Presale state deserialization -----

/// Minimal representation of the Meteora Presale account.
/// We only read the fields we need for finalization and validation.
///
/// Layout offsets (zero_copy with 8-byte anchor discriminator):
///   8  + 0   = owner (32 bytes)
///   8  + 32  = quote_mint (32 bytes)
///   8  + 64  = base_mint (32 bytes)
///   8  + 96  = base_token_vault (32 bytes)
///   8  + 128 = quote_token_vault (32 bytes)
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
    pub quote_mint: Pubkey,
    pub quote_token_vault: Pubkey,
    pub presale_minimum_cap: u64,
    pub presale_maximum_cap: u64,
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

        // quote_mint at offset 32
        let quote_mint = Pubkey::try_from(&data[DISC + 32..DISC + 64])
            .map_err(|_| ProgramError::InvalidAccountData)?;

        // quote_token_vault at offset 128
        let quote_token_vault = Pubkey::try_from(&data[DISC + 128..DISC + 160])
            .map_err(|_| ProgramError::InvalidAccountData)?;

        // presale_maximum_cap at byte offset 200
        let presale_maximum_cap =
            u64::from_le_bytes(data[DISC + 200..DISC + 208].try_into().unwrap());

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
            quote_mint,
            quote_token_vault,
            presale_minimum_cap,
            presale_maximum_cap,
            presale_end_time,
            total_deposit,
        })
    }
}

// ----- CPI calls -----

/// Remaining accounts info for creator_withdraw CPI.
/// Meteora uses a custom `RemainingAccountsInfo` Borsh struct.
#[derive(AnchorSerialize)]
pub struct RemainingAccountsSlice {
    pub accounts_type: u8,
    pub length: u8,
}

#[derive(AnchorSerialize)]
pub struct RemainingAccountsInfo {
    pub slices: Vec<RemainingAccountsSlice>,
}

/// CPI: creator_withdraw
///
/// Withdraws raised quote tokens from the presale vault to the owner's token account.
///
/// Accounts (ordered as in Meteora's CreatorWithdrawCtx):
///   0. presale (writable)
///   1. presale_authority
///   2. owner_token (writable) — destination for quote tokens
///   3. owner (signer) — must match presale.owner
///   4. token_program
///   5. memo_program
/// Remaining accounts:
///   6. quote_token_vault (writable)
///   7. quote_mint
pub fn cpi_creator_withdraw<'info>(
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(&IX_CREATOR_WITHDRAW);

    // RemainingAccountsInfo: one slice for TransferHookQuote (type 4, length 0)
    // No transfer hook accounts needed for native SOL/WSOL
    let remaining_info = RemainingAccountsInfo {
        slices: vec![RemainingAccountsSlice {
            accounts_type: 4, // TransferHookQuote
            length: 0,        // no extra transfer hook accounts
        }],
    };
    remaining_info.serialize(&mut data)?;

    let account_metas = vec![
        AccountMeta::new(accounts[0].key(), false),            // presale (writable)
        AccountMeta::new_readonly(accounts[1].key(), false),   // presale_authority
        AccountMeta::new(accounts[2].key(), false),            // owner_token (writable)
        AccountMeta::new_readonly(accounts[3].key(), true),    // owner (signer)
        AccountMeta::new_readonly(accounts[4].key(), false),   // token_program
        AccountMeta::new_readonly(accounts[5].key(), false),   // memo_program
        // Remaining accounts for CreatorWithdrawQuoteCtx
        AccountMeta::new(accounts[6].key(), false),            // quote_token_vault (writable)
        AccountMeta::new_readonly(accounts[7].key(), false),   // quote_mint
    ];

    let ix = Instruction {
        program_id: PRESALE_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    invoke_signed(&ix, accounts, signer_seeds)?;
    Ok(())
}
