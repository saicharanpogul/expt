use anchor_lang::prelude::*;

/// Maximum length for X (formerly Twitter) username
pub const MAX_X_USERNAME_LEN: usize = 32;
/// Maximum length for GitHub username
pub const MAX_GITHUB_LEN: usize = 64;
/// Maximum length for Telegram username
pub const MAX_TELEGRAM_LEN: usize = 32;

/// Builder profile account.
/// PDA seeds: [b"builder", wallet.key()]
///
/// Tracks builder identity (X mandatory, GitHub/Telegram optional)
/// and enforces one active experiment per wallet.
#[account(zero_copy)]
#[derive(Debug)]
pub struct Builder {
    /// Builder wallet address
    pub wallet: Pubkey,
    /// X (Twitter) username — mandatory, UTF-8 null-padded
    pub x_username: [u8; MAX_X_USERNAME_LEN],
    /// GitHub username — optional (zeroed if empty), UTF-8 null-padded
    pub github: [u8; MAX_GITHUB_LEN],
    /// Telegram username — optional (zeroed if empty), UTF-8 null-padded
    pub telegram: [u8; MAX_TELEGRAM_LEN],
    /// Active experiment's ExptConfig PDA (Pubkey::default if none)
    pub active_experiment: Pubkey,
    /// Total experiments created (used for enforcement: must be < 1)
    pub experiment_count: u8,
    /// Padding for alignment
    pub _padding: [u8; 7],
    /// When this builder profile was created (unix timestamp)
    pub created_at: i64,
    /// Reserved for future use
    pub padding: [u8; 24],
}

// Builder size: 32 + 32 + 64 + 32 + 32 + 1 + 7 + 8 + 24 = 232
const _: () = assert!(std::mem::size_of::<Builder>() == 232);

impl Builder {
    pub const SPACE: usize = 8 + std::mem::size_of::<Builder>();

    /// Check if the builder already has an active experiment
    pub fn has_active_experiment(&self) -> bool {
        self.active_experiment != Pubkey::default()
    }
}
