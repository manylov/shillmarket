use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("8GCsBLbmEhNigfHNjTL3SH3r7HUVjKczsu8aDoF5Tx73");

#[program]
pub mod shillmarket {
    use super::*;

    /// Initialize the platform treasury PDA.
    /// Only called once by the server/deployer authority.
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= 10_000, ShillMarketError::InvalidFeeBps);

        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.authority.key();
        treasury.fee_bps = fee_bps;
        treasury.bump = ctx.bumps.treasury;

        Ok(())
    }

    /// Create an escrow for a promotion order.
    /// The client locks `amount` lamports into the escrow PDA.
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        order_id: u64,
        amount: u64,
        fee_bps: u16,
    ) -> Result<()> {
        require!(fee_bps <= 10_000, ShillMarketError::InvalidFeeBps);
        require!(amount > 0, ShillMarketError::InsufficientFunds);

        // Transfer lamports from client to escrow PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        // Initialize escrow account data
        let escrow = &mut ctx.accounts.escrow;
        escrow.order_id = order_id;
        escrow.client = ctx.accounts.client.key();
        escrow.executor = ctx.accounts.executor.key();
        escrow.amount = amount;
        escrow.fee_bps = fee_bps;
        escrow.status = EscrowStatus::Locked;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow;

        Ok(())
    }

    /// Release escrowed funds to the executor (minus platform fee).
    /// Only callable by the treasury authority (server).
    pub fn release_escrow(ctx: Context<ReleaseEscrow>, _order_id: u64) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require!(
            escrow.status == EscrowStatus::Locked,
            ShillMarketError::EscrowNotLocked
        );

        let amount = escrow.amount;
        let fee_bps = escrow.fee_bps;

        let fee = (amount as u128)
            .checked_mul(fee_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;
        let executor_amount = amount.checked_sub(fee).unwrap();

        // Transfer executor_amount from escrow PDA to executor
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let executor_info = ctx.accounts.executor.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= executor_amount;
        **executor_info.try_borrow_mut_lamports()? += executor_amount;

        // Transfer fee from escrow PDA to treasury PDA
        if fee > 0 {
            let treasury_info = ctx.accounts.treasury.to_account_info();
            **escrow_info.try_borrow_mut_lamports()? -= fee;
            **treasury_info.try_borrow_mut_lamports()? += fee;
        }

        // Now take mutable borrow to update status
        ctx.accounts.escrow.status = EscrowStatus::Released;

        Ok(())
    }

    /// Refund escrowed funds back to the client.
    /// Only callable by the treasury authority (server).
    pub fn refund_escrow(ctx: Context<RefundEscrow>, _order_id: u64) -> Result<()> {
        require!(
            ctx.accounts.escrow.status == EscrowStatus::Locked,
            ShillMarketError::EscrowNotLocked
        );

        let amount = ctx.accounts.escrow.amount;

        // Transfer all lamports back to client
        let escrow_info = ctx.accounts.escrow.to_account_info();
        let client_info = ctx.accounts.client.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= amount;
        **client_info.try_borrow_mut_lamports()? += amount;

        // Update status
        ctx.accounts.escrow.status = EscrowStatus::Refunded;

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Accounts structs
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury: Account<'info, Treasury>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = client,
        space = 8 + EscrowAccount::INIT_SPACE,
        seeds = [b"escrow", order_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: The executor account. Not a signer; just stored for later payouts.
    pub executor: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct ReleaseEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", order_id.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = executor,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
        has_one = authority,
    )]
    pub treasury: Account<'info, Treasury>,

    pub authority: Signer<'info>,

    /// CHECK: Validated via has_one on escrow. Receives the payout.
    #[account(mut)]
    pub executor: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(order_id: u64)]
pub struct RefundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", order_id.to_le_bytes().as_ref()],
        bump = escrow.bump,
        has_one = client,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(
        seeds = [b"treasury"],
        bump = treasury.bump,
        has_one = authority,
    )]
    pub treasury: Account<'info, Treasury>,

    pub authority: Signer<'info>,

    /// CHECK: Validated via has_one on escrow. Receives the refund.
    #[account(mut)]
    pub client: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub authority: Pubkey, // 32
    pub fee_bps: u16,     // 2
    pub bump: u8,         // 1
}

#[account]
#[derive(InitSpace)]
pub struct EscrowAccount {
    pub order_id: u64,        // 8
    pub client: Pubkey,       // 32
    pub executor: Pubkey,     // 32
    pub amount: u64,          // 8
    pub fee_bps: u16,         // 2
    pub status: EscrowStatus, // 1
    pub created_at: i64,      // 8
    pub bump: u8,             // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum ShillMarketError {
    #[msg("Escrow is not in Locked status")]
    EscrowNotLocked,
    #[msg("Unauthorized: signer is not the treasury authority")]
    Unauthorized,
    #[msg("Invalid fee basis points (must be <= 10000)")]
    InvalidFeeBps,
    #[msg("Insufficient funds for escrow")]
    InsufficientFunds,
}
