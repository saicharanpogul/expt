/// Maximum number of milestones per experiment
pub const MAX_MILESTONES: usize = 3;

/// Maximum raise amount in lamports (~10k SOL)
pub const MAX_RAISE_LAMPORTS: u64 = 10_000 * 1_000_000_000;

/// Maximum length for experiment name (bytes)
pub const MAX_NAME_LEN: usize = 32;

/// Maximum length for metadata URI (bytes)
pub const MAX_URI_LEN: usize = 200;

/// Maximum length for milestone description (bytes)
pub const MAX_MILESTONE_DESC_LEN: usize = 128;

/// Maximum length for milestone deliverable reference (bytes)
pub const MAX_DELIVERABLE_LEN: usize = 200;

/// Basis points denominator (100% = 10_000)
pub const BPS_DENOMINATOR: u16 = 10_000;

/// Meteora Presale program ID
pub const PRESALE_PROGRAM_ID: &str = "presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj";

/// Meteora DAMM v2 (cp-amm) program ID
pub const DAMM_V2_PROGRAM_ID: &str = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

/// PDA seeds
pub mod seeds {
    pub const EXPT_CONFIG_PREFIX: &[u8] = b"expt_config";
    pub const TREASURY_PREFIX: &[u8] = b"treasury";
    pub const VETO_STAKE_PREFIX: &[u8] = b"veto_stake";
    pub const BUILDER_PREFIX: &[u8] = b"builder";
}
