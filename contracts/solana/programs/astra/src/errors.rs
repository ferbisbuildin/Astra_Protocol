use anchor_lang::prelude::*;

#[error_code]
pub enum AstraError {
    #[msg("Protocol engine is currently paused")]
    EnginePaused,
    #[msg("Caller is not authorized admin")]
    NotAdmin,
    #[msg("Caller is not the position owner")]
    NotOwner,
    #[msg("Invalid position status for requested operation")]
    InvalidStatus,
    #[msg("Position duration has not yet expired")]
    NotExpired,
    #[msg("No claimable payout available for this position")]
    NothingToClaim,
    #[msg("Principal has already been withdrawn")]
    AlreadyWithdrawn,
    #[msg("Insufficient underwriting reserve capacity")]
    InsufficientCapacity,
    #[msg("Oracle price observation is stale or invalid")]
    OracleStale,
    #[msg("Arithmetic overflow or underflow occurred")]
    MathOverflow,
}
