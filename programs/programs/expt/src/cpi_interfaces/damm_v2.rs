/// Raw CPI interface for Meteora DAMM v2 (cp-amm).
///
/// We build CPI instructions manually to avoid depending on the damm-v2 crate.
/// Instruction discriminators are derived from Anchor sighashes:
///   sha256("global:<instruction_name>")[..8]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed};

/// DAMM v2 program ID
pub const DAMM_V2_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

/// DAMM v2 pool authority (const PDA derived from POOL_AUTHORITY_PREFIX in cp-amm)
pub const DAMM_V2_POOL_AUTHORITY: Pubkey =
    anchor_lang::solana_program::pubkey!("HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC");

// ----- PDA seed constants (from DAMM v2) -----

pub const CUSTOMIZABLE_POOL_PREFIX: &[u8] = b"cpool";
pub const POSITION_PREFIX: &[u8] = b"position";
pub const POSITION_NFT_ACCOUNT_PREFIX: &[u8] = b"position_nft_account";
pub const TOKEN_VAULT_PREFIX: &[u8] = b"token_vault";
pub const POOL_AUTHORITY_PREFIX: &[u8] = b"pool_authority";
pub const EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";

/// Derive the DAMM v2 event authority PDA.
pub fn derive_damm_event_authority() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[EVENT_AUTHORITY_SEED], &DAMM_V2_PROGRAM_ID)
}

// ----- Instruction discriminators (Anchor sighash) -----
// sha256("global:initialize_customizable_pool")[..8]
const IX_INITIALIZE_CUSTOMIZABLE_POOL: [u8; 8] = compute_discriminator("global:initialize_customizable_pool");
// sha256("global:permanent_lock_position")[..8]
const IX_PERMANENT_LOCK_POSITION: [u8; 8] = compute_discriminator("global:permanent_lock_position");
// sha256("global:claim_position_fee")[..8]
const IX_CLAIM_POSITION_FEE: [u8; 8] = compute_discriminator("global:claim_position_fee");

/// Compute Anchor instruction discriminator at compile time.
/// This uses a SHA-256 implementation that can run in const context.
const fn compute_discriminator(input: &str) -> [u8; 8] {
    let hash = sha256_const(input.as_bytes());
    [hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]]
}

/// Minimal const SHA-256 implementation for discriminator computation.
/// Only needs to handle short strings ("global:xxx").
const fn sha256_const(data: &[u8]) -> [u8; 32] {
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

    // Pad message: data + 0x80 + zeros + length (must fit in ONE 64-byte block for our use case)
    let bit_len = (data.len() as u64) * 8;
    let mut block = [0u8; 64];
    let mut i = 0;
    while i < data.len() {
        block[i] = data[i];
        i += 1;
    }
    block[data.len()] = 0x80;
    // length in big-endian at bytes 56..64
    block[56] = (bit_len >> 56) as u8;
    block[57] = (bit_len >> 48) as u8;
    block[58] = (bit_len >> 40) as u8;
    block[59] = (bit_len >> 32) as u8;
    block[60] = (bit_len >> 24) as u8;
    block[61] = (bit_len >> 16) as u8;
    block[62] = (bit_len >> 8) as u8;
    block[63] = bit_len as u8;

    // Parse block into 16 u32 words
    let mut w = [0u32; 64];
    i = 0;
    while i < 16 {
        w[i] = ((block[i * 4] as u32) << 24)
            | ((block[i * 4 + 1] as u32) << 16)
            | ((block[i * 4 + 2] as u32) << 8)
            | (block[i * 4 + 3] as u32);
        i += 1;
    }

    // Extend to 64 words
    i = 16;
    while i < 64 {
        let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
        let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        i += 1;
    }

    // Compression
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

        hh = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
        i += 1;
    }

    h[0] = h[0].wrapping_add(a);
    h[1] = h[1].wrapping_add(b);
    h[2] = h[2].wrapping_add(c);
    h[3] = h[3].wrapping_add(d);
    h[4] = h[4].wrapping_add(e);
    h[5] = h[5].wrapping_add(f);
    h[6] = h[6].wrapping_add(g);
    h[7] = h[7].wrapping_add(hh);

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

/// Fee parameters for the pool — mirrors DAMM v2's BaseFeeParameters
/// which is a raw 30-byte array (Borsh-serialized BorshFeeTimeScheduler etc.)
#[derive(AnchorSerialize)]
pub struct BaseFeeParameters {
    pub data: [u8; 30],
}

impl BaseFeeParameters {
    /// Build a FeeTimeSchedulerExponential base fee.
    ///
    /// Fields are serialized as Borsh in DAMM v2's BorshFeeTimeScheduler layout:
    ///   cliff_fee_numerator: u64
    ///   number_of_period: u16
    ///   period_frequency: u64
    ///   reduction_factor: u64
    ///   base_fee_mode: u8
    ///   padding: [u8; 3]
    pub fn exponential_time_scheduler(
        cliff_fee_numerator: u64,
        number_of_period: u16,
        period_frequency: u64,
        reduction_factor: u64,
    ) -> Self {
        let mut data = [0u8; 30];
        // FeeTimeSchedulerExponential = 1 (enum: Linear=0, Exponential=1, RateLimiter=2)
        let base_fee_mode: u8 = 1;
        data[0..8].copy_from_slice(&cliff_fee_numerator.to_le_bytes());
        data[8..10].copy_from_slice(&number_of_period.to_le_bytes());
        data[10..18].copy_from_slice(&period_frequency.to_le_bytes());
        data[18..26].copy_from_slice(&reduction_factor.to_le_bytes());
        data[26] = base_fee_mode;
        // padding [27..30] stays zero
        Self { data }
    }
}

/// Dynamic fee configuration — mirrors DAMM v2's DynamicFeeParameters exactly
#[derive(AnchorSerialize)]
pub struct DynamicFeeParameters {
    pub bin_step: u16,
    pub bin_step_u128: u128,
    pub filter_period: u16,
    pub decay_period: u16,
    pub reduction_factor: u16,
    pub max_volatility_accumulator: u32,
    pub variable_fee_control: u32,
}

/// Parameters for initialize_customizable_pool — must match DAMM v2's struct exactly
#[derive(AnchorSerialize)]
pub struct InitializeCustomizablePoolParameters {
    pub pool_fees: PoolFeeParameters,
    pub sqrt_min_price: u128,
    pub sqrt_max_price: u128,
    pub has_alpha_vault: bool,
    pub liquidity: u128,
    pub sqrt_price: u128,
    pub activation_type: u8,
    pub collect_fee_mode: u8,
    pub activation_point: Option<u64>,
}

/// Pool fee parameters — mirrors DAMM v2's PoolFeeParameters
#[derive(AnchorSerialize)]
pub struct PoolFeeParameters {
    pub base_fee: BaseFeeParameters,
    pub dynamic_fee: Option<DynamicFeeParameters>,
}

// ----- Derive DAMM v2 PDAs -----

/// Derive the customizable pool PDA.
/// Seeds: [CUSTOMIZABLE_POOL_PREFIX, max(mint_a, mint_b), min(mint_a, mint_b)]
pub fn derive_pool_pda(token_a_mint: &Pubkey, token_b_mint: &Pubkey) -> (Pubkey, u8) {
    let (max_key, min_key) = if token_a_mint > token_b_mint {
        (token_a_mint, token_b_mint)
    } else {
        (token_b_mint, token_a_mint)
    };
    Pubkey::find_program_address(
        &[CUSTOMIZABLE_POOL_PREFIX, max_key.as_ref(), min_key.as_ref()],
        &DAMM_V2_PROGRAM_ID,
    )
}

/// Derive position PDA from NFT mint.
/// Seeds: [POSITION_PREFIX, nft_mint]
pub fn derive_position_pda(nft_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[POSITION_PREFIX, nft_mint.as_ref()],
        &DAMM_V2_PROGRAM_ID,
    )
}

/// Derive position NFT account PDA.
/// Seeds: [POSITION_NFT_ACCOUNT_PREFIX, nft_mint]
pub fn derive_position_nft_account(nft_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[POSITION_NFT_ACCOUNT_PREFIX, nft_mint.as_ref()],
        &DAMM_V2_PROGRAM_ID,
    )
}

/// Derive token vault PDA for a pool.
/// Seeds: [TOKEN_VAULT_PREFIX, mint, pool]
pub fn derive_token_vault(mint: &Pubkey, pool: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[TOKEN_VAULT_PREFIX, mint.as_ref(), pool.as_ref()],
        &DAMM_V2_PROGRAM_ID,
    )
}

// ----- CPI calls -----

/// CPI: initialize_customizable_pool
///
/// Accounts (ordered as in DAMM v2 InitializeCustomizablePoolCtx):
///   0. creator (UncheckedAccount)
///   1. position_nft_mint (signer, writable)
///   2. position_nft_account (writable)
///   3. payer (signer, writable)
///   4. pool_authority
///   5. pool (writable)
///   6. position (writable)
///   7. token_a_mint
///   8. token_b_mint
///   9. token_a_vault (writable)
///  10. token_b_vault (writable)
///  11. payer_token_a (writable)
///  12. payer_token_b (writable)
///  13. token_a_program
///  14. token_b_program
///  15. token_2022_program
///  16. system_program
///  17. event_authority (remaining account for event CPI)
///  18. damm_v2_program (remaining account - self reference)
pub fn cpi_initialize_customizable_pool<'info>(
    accounts: &[AccountInfo<'info>],
    params: InitializeCustomizablePoolParameters,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(256);
    data.extend_from_slice(&IX_INITIALIZE_CUSTOMIZABLE_POOL);
    params.serialize(&mut data)?;

    let account_metas: Vec<AccountMeta> = vec![
        AccountMeta::new_readonly(accounts[0].key(), false),   // creator
        AccountMeta::new(accounts[1].key(), true),             // position_nft_mint (signer)
        AccountMeta::new(accounts[2].key(), false),            // position_nft_account
        AccountMeta::new(accounts[3].key(), true),             // payer (signer)
        AccountMeta::new_readonly(accounts[4].key(), false),   // pool_authority
        AccountMeta::new(accounts[5].key(), false),            // pool
        AccountMeta::new(accounts[6].key(), false),            // position
        AccountMeta::new_readonly(accounts[7].key(), false),   // token_a_mint
        AccountMeta::new_readonly(accounts[8].key(), false),   // token_b_mint
        AccountMeta::new(accounts[9].key(), false),            // token_a_vault
        AccountMeta::new(accounts[10].key(), false),           // token_b_vault
        AccountMeta::new(accounts[11].key(), false),           // payer_token_a
        AccountMeta::new(accounts[12].key(), false),           // payer_token_b
        AccountMeta::new_readonly(accounts[13].key(), false),  // token_a_program
        AccountMeta::new_readonly(accounts[14].key(), false),  // token_b_program
        AccountMeta::new_readonly(accounts[15].key(), false),  // token_2022_program
        AccountMeta::new_readonly(accounts[16].key(), false),  // system_program
        AccountMeta::new_readonly(accounts[17].key(), false),  // event_authority
        AccountMeta::new_readonly(accounts[18].key(), false),  // damm_v2_program (self-ref)
    ];

    let ix = Instruction {
        program_id: DAMM_V2_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    invoke_signed(&ix, accounts, signer_seeds)?;
    Ok(())
}

/// CPI: permanent_lock_position
///
/// Accounts (ordered as in DAMM v2 PermanentLockPositionCtx):
///   0. pool (writable)
///   1. position (writable)
///   2. position_nft_account
///   3. owner (signer)
///   4. event_authority
///   5. damm_v2_program
pub fn cpi_permanent_lock_position<'info>(
    accounts: &[AccountInfo<'info>],
    permanent_lock_liquidity: u128,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let mut data = Vec::with_capacity(32);
    data.extend_from_slice(&IX_PERMANENT_LOCK_POSITION);
    permanent_lock_liquidity.serialize(&mut data)?;

    let account_metas = vec![
        AccountMeta::new(accounts[0].key(), false),            // pool (writable)
        AccountMeta::new(accounts[1].key(), false),            // position (writable)
        AccountMeta::new_readonly(accounts[2].key(), false),   // position_nft_account
        AccountMeta::new_readonly(accounts[3].key(), true),    // owner (signer)
        AccountMeta::new_readonly(accounts[4].key(), false),   // event_authority
        AccountMeta::new_readonly(accounts[5].key(), false),   // damm_v2_program (self-ref)
    ];

    let ix = Instruction {
        program_id: DAMM_V2_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    invoke_signed(&ix, accounts, signer_seeds)?;
    Ok(())
}

/// CPI: claim_position_fee
///
/// Accounts (ordered as in DAMM v2 ClaimPositionFeeCtx):
///   0. pool_authority
///   1. pool
///   2. position (writable)
///   3. token_a_account (writable) — destination
///   4. token_b_account (writable) — destination
///   5. token_a_vault (writable)
///   6. token_b_vault (writable)
///   7. token_a_mint
///   8. token_b_mint
///   9. position_nft_account
///  10. owner (signer)
///  11. token_a_program
///  12. token_b_program
///  13. event_authority
///  14. damm_v2_program
pub fn cpi_claim_position_fee<'info>(
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let data = IX_CLAIM_POSITION_FEE.to_vec();

    let account_metas = vec![
        AccountMeta::new_readonly(accounts[0].key(), false),   // pool_authority
        AccountMeta::new_readonly(accounts[1].key(), false),   // pool
        AccountMeta::new(accounts[2].key(), false),            // position (writable)
        AccountMeta::new(accounts[3].key(), false),            // token_a_account (writable)
        AccountMeta::new(accounts[4].key(), false),            // token_b_account (writable)
        AccountMeta::new(accounts[5].key(), false),            // token_a_vault (writable)
        AccountMeta::new(accounts[6].key(), false),            // token_b_vault (writable)
        AccountMeta::new_readonly(accounts[7].key(), false),   // token_a_mint
        AccountMeta::new_readonly(accounts[8].key(), false),   // token_b_mint
        AccountMeta::new_readonly(accounts[9].key(), false),   // position_nft_account
        AccountMeta::new_readonly(accounts[10].key(), true),   // owner (signer)
        AccountMeta::new_readonly(accounts[11].key(), false),  // token_a_program
        AccountMeta::new_readonly(accounts[12].key(), false),  // token_b_program
        AccountMeta::new_readonly(accounts[13].key(), false),  // event_authority
        AccountMeta::new_readonly(accounts[14].key(), false),  // damm_v2_program (self-ref)
    ];

    let ix = Instruction {
        program_id: DAMM_V2_PROGRAM_ID,
        accounts: account_metas,
        data,
    };

    invoke_signed(&ix, accounts, signer_seeds)?;
    Ok(())
}
