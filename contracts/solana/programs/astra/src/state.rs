use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProtectionMode {
    RateLock,    // Protected payment to recipient
    DepegShield, // Principal balance loss protection
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PositionStatus {
    Inactive,
    Active,
    AwaitingOracle,
    SettledNoPayout,
    Claimable,
    Claimed,
    PrincipalWithdrawn,
}

#[account]
pub struct AstraConfig {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub treasury: Pubkey,
    pub pyth_price_feed: Pubkey,
    pub payout_mint: Pubkey,
    pub protected_mint: Pubkey,
    pub max_payout_bps: u64,       // e.g. 9000 (90%)
    pub fixed_automation_fee: u64, // e.g. 500_000 (0.005 units)
    pub paused: bool,
    pub position_nonce: u64,
    pub bump: u8,
}

#[account]
pub struct ReserveVaultState {
    pub total_liquidity: u64,
    pub total_locked_capacity: u64,
    pub total_shares: u64,
    pub automation_balance: u64,
    pub safety_pool_balance: u64,
    pub underwriting_bps: u64, // 7800 (78%)
    pub protocol_fee_bps: u64, // 1200 (12%)
    pub safety_bps: u64,       // 700 (7%)
    pub automation_bps: u64,   // 300 (3%)
    pub bump: u8,
}

#[account]
pub struct Position {
    pub id: u64,
    pub owner: Pubkey,
    pub recipient: Pubkey,
    pub partner: Pubkey,
    pub invoice_hash: [u8; 32],
    pub protected_mint: Pubkey,
    pub payout_mint: Pubkey,
    pub protected_amount: u64,
    pub notional: u64,
    pub maximum_payout: u64,
    pub risk_premium: u64,
    pub automation_fee: u64,
    pub entry_price: i64,      // 8 decimals scale
    pub floor_price: i64,      // 8 decimals scale
    pub settlement_price: i64,
    pub start_time: i64,
    pub expiry_time: i64,
    pub mode: ProtectionMode,
    pub status: PositionStatus,
    pub claimable_payout: u64,
    pub payout_claimed: bool,
    pub principal_withdrawn: bool,
    pub bump: u8,
}

#[account]
pub struct AstraReceipt {
    pub payment_hash: [u8; 32],
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
    pub disputed: bool,
    pub bump: u8,
}
