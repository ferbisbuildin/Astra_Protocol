/**
 * Astra Protocol Official Multi-Chain SDK (@astra/sdk)
 * Supports Solana, Arbitrum One, and Hyperliquid (HyperEVM)
 */

export class AstraClient {
  /**
   * @param {Object} options
   * @param {string} [options.endpoint='http://localhost:4000'] - Astra Protocol node/backend URL
   * @param {string} [options.defaultChain='solana'] - Default chain ('solana' | 'arbitrum' | 'hyperliquid')
   * @param {number} [options.timeoutMs=15000] - HTTP request timeout in milliseconds
   */
  constructor(options = {}) {
    this.endpoint = (options.endpoint || 'http://localhost:4000').replace(/\/$/, '');
    this.defaultChain = options.defaultChain || 'solana';
    this.timeoutMs = options.timeoutMs || 15000;
  }

  /**
   * Internal request helper
   * @private
   */
  async _request(path, method = 'GET', body = null) {
    const url = `${this.endpoint}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = { 'Accept': 'application/json' };
      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg = data.error || data.message || `HTTP error ${res.status}: ${res.statusText}`;
        const error = new Error(errorMsg);
        error.status = res.status;
        error.details = data;
        throw error;
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Protocol Health & Stats
  // ---------------------------------------------------------------------------

  /**
   * Check connection and protocol health
   */
  async getHealth() {
    return this._request('/api/v1/health');
  }

  /**
   * Get global protocol statistics (TVL, open capacity, protected volume)
   */
  async getStats() {
    return this._request('/api/v1/stats');
  }

  // ---------------------------------------------------------------------------
  // Dynamic Pricing Engine
  // ---------------------------------------------------------------------------

  /**
   * Fetch dynamic underwriting quote for rate-lock or depeg shield
   * @param {Object} params
   * @param {string} [params.chain] - 'solana' | 'arbitrum' | 'hyperliquid'
   * @param {string} params.asset - 'SOL' | 'ETH' | 'BTC' | 'HYPE' | 'ARB' | 'PURR'
   * @param {number} params.amount - Principal quantity to protect
   * @param {number} params.durationSeconds - Coverage duration in seconds (e.g. 86400)
   * @param {'rate-lock'|'depeg-shield'} [params.mode='depeg-shield'] - Protection mode
   * @param {number} [params.floorPrice] - Optional floor price threshold
   */
  async getQuote(params) {
    const chain = params.chain || this.defaultChain;
    const query = new URLSearchParams({
      chain,
      asset: params.asset,
      amount: String(params.amount),
      durationSeconds: String(params.durationSeconds || 86400),
      mode: params.mode || 'depeg-shield',
    });

    if (params.floorPrice !== undefined) {
      query.append('floor', String(params.floorPrice));
    }

    return this._request(`/api/v1/quote?${query.toString()}`);
  }

  /**
   * Fetch Pyth / Douro Labs high-resolution historical price candles
   * @param {string} symbol - 'SOL' | 'ETH' | 'BTC' | 'HYPE' | 'ARB'
   */
  async getPriceHistory(symbol = 'SOL') {
    return this._request(`/api/v1/history?symbol=${encodeURIComponent(symbol)}`);
  }

  // ---------------------------------------------------------------------------
  // Positions API (Create, Inspect, Settle, Claim)
  // ---------------------------------------------------------------------------

  /**
   * Create and activate a protection position
   * @param {Object} params
   * @param {string} [params.chain] - 'solana' | 'arbitrum' | 'hyperliquid'
   * @param {string} params.asset - 'SOL', 'ETH', 'HYPE', etc.
   * @param {number} params.amount - Position size
   * @param {number} params.durationSeconds - Duration in seconds
   * @param {string} params.owner - User's wallet address
   * @param {string} [params.recipient] - Optional payout recipient (defaults to owner)
   * @param {'rate-lock'|'depeg-shield'} [params.mode='depeg-shield'] - Mode
   * @param {number} [params.floorPrice] - Target floor price
   */
  async createPosition(params) {
    return this._request('/api/v1/positions', 'POST', {
      chain: params.chain || this.defaultChain,
      asset: params.asset,
      amount: params.amount,
      durationSeconds: params.durationSeconds,
      owner: params.owner,
      recipient: params.recipient || params.owner,
      mode: params.mode || 'depeg-shield',
      floorPrice: params.floorPrice,
    });
  }

  /**
   * List active positions with optional filters
   * @param {Object} [filter]
   * @param {string} [filter.address] - Filter by owner/recipient address
   * @param {string} [filter.chain] - Filter by chain
   */
  async listPositions(filter = {}) {
    const query = new URLSearchParams();
    if (filter.address) query.append('address', filter.address);
    if (filter.chain) query.append('chain', filter.chain);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this._request(`/api/v1/positions${qs}`);
  }

  /**
   * Get position details by ID
   * @param {string} positionId
   */
  async getPosition(positionId) {
    return this._request(`/api/v1/positions/${positionId}`);
  }

  /**
   * Settle an expired position
   * @param {string} positionId
   * @param {Object} [options]
   * @param {boolean} [options.testnetSimulateLoss=false] - Optional simulated breach for testnet demonstration
   */
  async settlePosition(positionId, options = {}) {
    return this._request(`/api/v1/positions/${positionId}/settle`, 'POST', options);
  }

  /**
   * Claim payout for a settled position (with double-claim protection)
   * @param {string} positionId
   */
  async claimPayout(positionId) {
    return this._request(`/api/v1/positions/${positionId}/claim`, 'POST', {});
  }

  // ---------------------------------------------------------------------------
  // Commercial Invoices & Protected Payments
  // ---------------------------------------------------------------------------

  /**
   * Generate an Astra Protected Invoice
   * @param {Object} params
   * @param {string} params.merchantWallet - Merchant receiving payment
   * @param {string} params.asset - 'SOL' | 'ETH' | 'USDC'
   * @param {number} params.amount - Invoiced quantity
   * @param {number} [params.durationSeconds=3600] - Downside guarantee window
   * @param {string} [params.description] - Invoice memo or description
   */
  async createInvoice(params) {
    return this._request('/api/v1/invoices', 'POST', params);
  }

  /**
   * Fetch invoice status
   * @param {string} token - Invoice token (e.g. 'ast_...')
   */
  async getInvoice(token) {
    return this._request(`/api/v1/invoices/${token}`);
  }

  /**
   * Settle and pay an invoice with recipient downside protection
   * @param {string} token - Invoice token
   * @param {Object} payment
   * @param {string} payment.payer - Payer's wallet address
   */
  async payInvoice(token, payment) {
    return this._request(`/api/v1/invoices/${token}/pay`, 'POST', {
      customerWallet: payment.payer || payment.customerWallet,
    });
  }

  // ---------------------------------------------------------------------------
  // Universal Handle / Username Registry
  // ---------------------------------------------------------------------------

  /**
   * Register a universal cross-chain handle (@handle)
   * @param {Object} params
   * @param {string} params.username - Desired username (alphanumeric 3-24 chars)
   * @param {string} params.address - Wallet address
   * @param {string} [params.chain='solana'] - Primary chain
   */
  async registerUsername(params) {
    return this._request('/api/v1/usernames/register', 'POST', params);
  }

  /**
   * Resolve a universal handle to its wallet address
   * @param {string} username - Handle (with or without '@')
   */
  async resolveUsername(username) {
    const clean = username.replace(/^@/, '');
    return this._request(`/api/v1/usernames/${encodeURIComponent(clean)}`);
  }

  // ---------------------------------------------------------------------------
  // Zero-Knowledge Proof & Payment Receipt Verification
  // ---------------------------------------------------------------------------

  /**
   * Verify an off-chain / on-chain cryptographic payment receipt
   * @param {Object} params
   * @param {string} params.receiptHash - 32-byte hash of the payment receipt
   * @param {string} [params.proofType='BN254_SNARK'] - ZK curve/system
   */
  async verifyReceipt(params) {
    return this._request('/api/v1/receipts/verify', 'POST', params);
  }

  // ---------------------------------------------------------------------------
  // Underwriting Reserves & LP Pool
  // ---------------------------------------------------------------------------

  /**
   * Get reserve pool state & LP yields
   * @param {string} [user] - Optional user wallet address
   */
  async getReservesState(user) {
    const qs = user ? `?user=${encodeURIComponent(user)}` : '';
    return this._request(`/api/v1/reserves/state${qs}`);
  }

  /**
   * Deposit capital into Astra Underwriting Reserve to earn yield
   * @param {Object} params
   * @param {number} params.amount - Amount in USDC
   * @param {string} [params.user] - LP wallet address
   */
  async depositReserves(params) {
    return this._request('/api/v1/reserves/deposit', 'POST', params);
  }

  /**
   * Initiate LP withdrawal with timelock protection
   * @param {Object} params
   * @param {number} params.shares - Number of LP shares to redeem
   * @param {string} [params.user] - LP wallet address
   */
  async withdrawReserves(params) {
    return this._request('/api/v1/reserves/withdraw', 'POST', params);
  }
}

export default AstraClient;
