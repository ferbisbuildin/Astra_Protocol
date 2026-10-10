use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use pyth_sdk_solana::load_price_feed_from_account_info;

pub mod errors;
pub mod state;

use errors::AstraError;
use state::*;

declare_id!("ABMTT5W2UNn5BZG8285V9Uzn3h5c1G3rG7YeCPMn7714");

pub const BPS: u64 = 10_000;
pub const PRICE_SCALE: i64 = 100_000_000; // 8 decimals (1.00 = 100_000_000)
pub const MIN_NOTIONAL: u64 = 10_000_000;
pub const MIN_RISK_PREMIUM: u64 = 1_000_000;
pub const AUTOMATION_FEE: u64 = 500_000;
pub const SETTLEMENT_KEEPER_REWARD: u64 = 100_000;
pub const SAFETY_MARGIN_BPS: u64 = 20; // 0.20%
pub const MAX_PREMIUM_BPS: u64 = 1_000; // 10%
pub const ONE_DAY: i64 = 86_400;

#[program]
pub mod astra {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        max_payout_bps: u64,
        fixed_automation_fee: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.pending_admin = Pubkey::default();
        config.treasury = ctx.accounts.treasury.key();
        config.pyth_price_feed = ctx.accounts.pyth_price_feed.key();
        config.payout_mint = ctx.accounts.payout_mint.key();
        config.protected_mint = ctx.accounts.protected_mint.key();
        config.max_payout_bps = max_payout_bps;
        config.fixed_automation_fee = fixed_automation_fee;
        config.paused = false;
        config.position_nonce = 0;
        config.bump = ctx.bumps.config;

        let reserve = &mut ctx.accounts.reserve_state;
        reserve.total_liquidity = 0;
        reserve.total_locked_capacity = 0;
        reserve.total_shares = 0;
        reserve.automation_balance = 0;
        reserve.safety_pool_balance = 0;
        reserve.underwriting_bps = 7800; // 78%
        reserve.protocol_fee_bps = 1200; // 12%
        reserve.safety_bps = 700;        // 7%
        reserve.automation_bps = 300;    // 3%
        reserve.bump = ctx.bumps.reserve_state;

        Ok(())
    }

    pub fn deposit_reserve(ctx: Context<DepositReserve>, amount: u64) -> Result<()> {
        require!(amount > 0, AstraError::MathOverflow);
        let reserve = &mut ctx.accounts.reserve_state;

        // Transfer payout token from provider to reserve vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.provider_token_account.to_account_info(),
            to: ctx.accounts.reserve_vault.to_account_info(),
            authority: ctx.accounts.provider.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let shares = if reserve.total_shares == 0 || reserve.total_liquidity == 0 {
            amount
        } else {
            (amount as u128 * reserve.total_shares as u128 / reserve.total_liquidity as u128) as u64
        };

        reserve.total_shares = reserve.total_shares.checked_add(shares).ok_or(AstraError::MathOverflow)?;
        reserve.total_liquidity = reserve.total_liquidity.checked_add(amount).ok_or(AstraError::MathOverflow)?;

        Ok(())
    }

    pub fn create_position(
        ctx: Context<CreatePosition>,
        mode: ProtectionMode,
        protected_amount: u64,
        duration_seconds: i64,
        recipient: Pubkey,
        partner: Pubkey,
        invoice_hash: [u8; 32],
        floor_price: i64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let reserve = &mut ctx.accounts.reserve_state;
        let clock = Clock::get()?;

        require!(!config.paused, AstraError::EnginePaused);
        require!(protected_amount > 0 && duration_seconds >= 900 && duration_seconds <= 30 * ONE_DAY, AstraError::MathOverflow);

        // Fetch fresh price from Pyth network account
        let price_feed = load_price_feed_from_account_info(&ctx.accounts.pyth_price_feed.to_account_info())
            .map_err(|_| error!(AstraError::OracleStale))?;
        let current_price_data = price_feed
            .get_price_no_older_than(clock.unix_timestamp, 600)
            .ok_or(error!(AstraError::OracleStale))?;

        let entry_price = current_price_data.price;
        require!(entry_price > 0, AstraError::OracleStale);

        // Compute notional USD value (8-decimal scale)
        let notional = (protected_amount as u128 * entry_price as u128 / PRICE_SCALE as u128) as u64;
        require!(notional >= MIN_NOTIONAL, AstraError::MathOverflow);

        let maximum_payout = (notional as u128 * config.max_payout_bps as u128 / BPS as u128) as u64;

        // Verify available capacity in reserve pool
        let free_capacity = reserve.total_liquidity.saturating_sub(reserve.total_locked_capacity);
        require!(maximum_payout <= free_capacity, AstraError::InsufficientCapacity);

        // Non-linear duration-based pricing (1:1 with CoverFi)
        let base_bps = if duration_seconds <= ONE_DAY {
            30_u64
        } else if duration_seconds <= 7 * ONE_DAY {
            100_u64
        } else if duration_seconds <= 14 * ONE_DAY {
            150_u64
        } else {
            250_u64
        };

        let base_premium = (notional as u128 * base_bps as u128 / BPS as u128) as u64;
        let safety_margin = (notional as u128 * SAFETY_MARGIN_BPS as u128 / BPS as u128) as u64;
        let raw_premium = base_premium.checked_add(safety_margin).ok_or(AstraError::MathOverflow)?;

        let cap = (notional as u128 * MAX_PREMIUM_BPS as u128 / BPS as u128) as u64;
        let risk_premium = raw_premium.max(MIN_RISK_PREMIUM).min(cap);
        let total_due = risk_premium.checked_add(AUTOMATION_FEE).ok_or(AstraError::MathOverflow)?;

        // 1. Custody protected principal into protected_balance_vault
        let cpi_accounts_principal = Transfer {
            from: ctx.accounts.user_protected_token_account.to_account_info(),
            to: ctx.accounts.protected_balance_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_principal),
            protected_amount,
        )?;

        // 2. Transfer premium + automation fee from user to reserve vault
        let cpi_accounts_premium = Transfer {
            from: ctx.accounts.user_payout_token_account.to_account_info(),
            to: ctx.accounts.reserve_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts_premium),
            total_due,
        )?;

        // 3. Lock position capacity in reserve state
        reserve.total_locked_capacity = reserve.total_locked_capacity.checked_add(maximum_payout).ok_or(AstraError::MathOverflow)?;

        // Route fee portions: 78% underwriting yield, 12% treasury, 7% safety, 3% automation
        let underwriting_portion = (risk_premium as u128 * reserve.underwriting_bps as u128 / BPS as u128) as u64;
        let protocol_fee = (risk_premium as u128 * reserve.protocol_fee_bps as u128 / BPS as u128) as u64;
        let safety_portion = (risk_premium as u128 * reserve.safety_bps as u128 / BPS as u128) as u64;
        let automation_portion = (risk_premium as u128 * reserve.automation_bps as u128 / BPS as u128) as u64 + AUTOMATION_FEE;

        reserve.total_liquidity = reserve.total_liquidity.checked_add(underwriting_portion).ok_or(AstraError::MathOverflow)?;
        reserve.safety_pool_balance = reserve.safety_pool_balance.checked_add(safety_portion).ok_or(AstraError::MathOverflow)?;
        reserve.automation_balance = reserve.automation_balance.checked_add(automation_portion).ok_or(AstraError::MathOverflow)?;

        // Transfer treasury share
        if protocol_fee > 0 {
            let seeds = &[b"reserve_state".as_ref(), &[reserve.bump]];
            let signer = &[&seeds[..]];
            let cpi_treasury = Transfer {
                from: ctx.accounts.reserve_vault.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: reserve.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_treasury, signer),
                protocol_fee,
            )?;
        }

        // Initialize position account
        config.position_nonce += 1;
        let position = &mut ctx.accounts.position;
        position.id = config.position_nonce;
        position.owner = ctx.accounts.user.key();
        position.recipient = recipient;
        position.partner = partner;
        position.invoice_hash = invoice_hash;
        position.protected_mint = ctx.accounts.protected_mint.key();
        position.payout_mint = ctx.accounts.payout_mint.key();
        position.protected_amount = protected_amount;
        position.notional = notional;
        position.maximum_payout = maximum_payout;
        position.risk_premium = risk_premium;
        position.automation_fee = AUTOMATION_FEE;
        position.entry_price = entry_price;
        position.floor_price = if floor_price > 0 { floor_price } else { entry_price };
        position.settlement_price = 0;
        position.start_time = clock.unix_timestamp;
        position.expiry_time = clock.unix_timestamp + duration_seconds;
        position.mode = mode;
        position.status = PositionStatus::Active;
        position.claimable_payout = 0;
        position.payout_claimed = false;
        position.principal_withdrawn = false;
        position.bump = ctx.bumps.position;

        Ok(())
    }

    pub fn settle_position(ctx: Context<SettlePosition>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let reserve = &mut ctx.accounts.reserve_state;
        let clock = Clock::get()?;

        require!(
            position.status == PositionStatus::Active || position.status == PositionStatus::AwaitingOracle,
            AstraError::InvalidStatus
        );
        require!(clock.unix_timestamp >= position.expiry_time, AstraError::NotExpired);

        // Fetch settlement price from Pyth
        let price_feed = load_price_feed_from_account_info(&ctx.accounts.pyth_price_feed.to_account_info())
            .map_err(|_| error!(AstraError::OracleStale))?;
        let observation = price_feed
            .get_price_no_older_than(clock.unix_timestamp, 600)
            .ok_or(error!(AstraError::OracleStale))?;

        let settlement_price = observation.price;
        position.settlement_price = settlement_price;

        let reference_price = if position.mode == ProtectionMode.DepegShield {
            position.floor_price
        } else {
            position.entry_price
        };

        let payout = if settlement_price < reference_price {
            let loss_per_unit = reference_price - settlement_price;
            let raw_payout = (position.protected_amount as u128 * loss_per_unit as u128 / PRICE_SCALE as u128) as u64;
            raw_payout.min(position.maximum_payout)
        } else {
            0
        };

        // Unlock capacity in reserve
        reserve.total_locked_capacity = reserve.total_locked_capacity.saturating_sub(position.maximum_payout);

        if payout > 0 {
            reserve.total_liquidity = reserve.total_liquidity.saturating_sub(payout);
            position.claimable_payout = payout;
            position.status = PositionStatus::Claimable;
        } else {
            position.status = PositionStatus::SettledNoPayout;
        }

        // Pay keeper bounty from automation balance
        if reserve.automation_balance >= SETTLEMENT_KEEPER_REWARD {
            reserve.automation_balance -= SETTLEMENT_KEEPER_REWARD;
            let seeds = &[b"reserve_state".as_ref(), &[reserve.bump]];
            let signer = &[&seeds[..]];
            let cpi_keeper = Transfer {
                from: ctx.accounts.reserve_vault.to_account_info(),
                to: ctx.accounts.keeper_token_account.to_account_info(),
                authority: reserve.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_keeper, signer),
                SETTLEMENT_KEEPER_REWARD,
            )?;
        }

        Ok(())
    }

    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let reserve = &ctx.accounts.reserve_state;

        let authorized_claimant = if position.mode == ProtectionMode.RateLock {
            position.recipient
        } else {
            position.owner
        };

        require!(ctx.accounts.user.key() == authorized_claimant, AstraError::NotOwner);
        require!(position.status == PositionStatus::Claimable && position.claimable_payout > 0, AstraError::NothingToClaim);

        let payout_amount = position.claimable_payout;
        position.claimable_payout = 0;
        position.payout_claimed = true;
        position.status = if position.principal_withdrawn {
            PositionStatus::PrincipalWithdrawn
        } else {
            PositionStatus::Claimed
        };

        let seeds = &[b"reserve_state".as_ref(), &[reserve.bump]];
        let signer = &[&seeds[..]];
        let cpi_claim = Transfer {
            from: ctx.accounts.reserve_vault.to_account_info(),
            to: ctx.accounts.user_payout_token_account.to_account_info(),
            authority: reserve.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_claim, signer),
            payout_amount,
        )?;

        Ok(())
    }

    pub fn withdraw_principal(ctx: Context<WithdrawPrincipal>) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let config = &ctx.accounts.config;

        let authorized_receiver = if position.mode == ProtectionMode.RateLock {
            position.recipient
        } else {
            position.owner
        };

        require!(ctx.accounts.user.key() == authorized_receiver, AstraError::NotOwner);
        require!(!position.principal_withdrawn, AstraError::AlreadyWithdrawn);
        require!(
            position.status == PositionStatus::SettledNoPayout
                || position.status == PositionStatus::Claimable
                || position.status == PositionStatus::Claimed,
            AstraError::InvalidStatus
        );

        let amount = position.protected_amount;
        position.principal_withdrawn = true;
        if position.status != PositionStatus::Claimable {
            position.status = PositionStatus::PrincipalWithdrawn;
        }

        let seeds = &[b"astra_config".as_ref(), &[config.bump]];
        let signer = &[&seeds[..]];
        let cpi_withdraw = Transfer {
            from: ctx.accounts.protected_balance_vault.to_account_info(),
            to: ctx.accounts.user_protected_token_account.to_account_info(),
            authority: config.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_withdraw, signer),
            amount,
        )?;

        Ok(())
    }

    pub fn register_receipt(
        ctx: Context<RegisterReceipt>,
        payment_hash: [u8; 32],
        recipient: Pubkey,
        amount: u64,
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        let clock = Clock::get()?;

        receipt.payment_hash = payment_hash;
        receipt.payer = ctx.accounts.payer.key();
        receipt.recipient = recipient;
        receipt.amount = amount;
        receipt.timestamp = clock.unix_timestamp;
        receipt.disputed = false;
        receipt.bump = ctx.bumps.receipt;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + std::mem::size_of::<AstraConfig>(),
        seeds = [b"astra_config"],
        bump
    )]
    pub config: Account<'info, AstraConfig>,
    #[account(
        init,
        payer = admin,
        space = 8 + std::mem::size_of::<ReserveVaultState>(),
        seeds = [b"reserve_state"],
        bump
    )]
    pub reserve_state: Account<'info, ReserveVaultState>,
    pub payout_mint: Account<'info, Mint>,
    pub protected_mint: Account<'info, Mint>,
    /// CHECK: Pyth oracle feed account
    pub pyth_price_feed: AccountInfo<'info>,
    /// CHECK: Protocol treasury account
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositReserve<'info> {
    #[account(mut, seeds = [b"reserve_state"], bump = reserve_state.bump)]
    pub reserve_state: Account<'info, ReserveVaultState>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub provider_token_account: Account<'info, TokenAccount>,
    pub provider: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CreatePosition<'info> {
    #[account(mut, seeds = [b"astra_config"], bump = config.bump)]
    pub config: Account<'info, AstraConfig>,
    #[account(mut, seeds = [b"reserve_state"], bump = reserve_state.bump)]
    pub reserve_state: Account<'info, ReserveVaultState>,
    #[account(
        init,
        payer = user,
        space = 8 + std::mem::size_of::<Position>(),
        seeds = [b"position", config.position_nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub protected_mint: Account<'info, Mint>,
    pub payout_mint: Account<'info, Mint>,
    #[account(mut)]
    pub protected_balance_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_protected_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_payout_token_account: Account<'info, TokenAccount>,
    /// CHECK: Pyth price feed
    pub pyth_price_feed: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"reserve_state"], bump = reserve_state.bump)]
    pub reserve_state: Account<'info, ReserveVaultState>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub keeper_token_account: Account<'info, TokenAccount>,
    /// CHECK: Pyth price feed
    pub pyth_price_feed: AccountInfo<'info>,
    pub keeper: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"reserve_state"], bump = reserve_state.bump)]
    pub reserve_state: Account<'info, ReserveVaultState>,
    #[account(mut)]
    pub reserve_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_payout_token_account: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawPrincipal<'info> {
    #[account(seeds = [b"astra_config"], bump = config.bump)]
    pub config: Account<'info, AstraConfig>,
    #[account(mut)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub protected_balance_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_protected_token_account: Account<'info, TokenAccount>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(payment_hash: [u8; 32])]
pub struct RegisterReceipt<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + std::mem::size_of::<AstraReceipt>(),
        seeds = [b"receipt", payment_hash.as_ref()],
        bump
    )]
    pub receipt: Account<'info, AstraReceipt>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
