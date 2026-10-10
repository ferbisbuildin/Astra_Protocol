export interface AstraClientOptions {
  endpoint?: string;
  defaultChain?: 'solana' | 'arbitrum' | 'hyperliquid';
  timeoutMs?: number;
}

export interface QuoteRequest {
  chain?: 'solana' | 'arbitrum' | 'hyperliquid';
  asset: string;
  amount: number;
  durationSeconds?: number;
  mode?: 'rate-lock' | 'depeg-shield';
  floorPrice?: number;
}

export interface QuoteResponse {
  chain: string;
  mode: string;
  asset: string;
  amount: number;
  durationSeconds: number;
  entryPrice: number;
  floorPrice: number;
  notional: number;
  maximumPayout: number;
  basePremium: number;
  safetyMargin: number;
  riskPremium: number;
  protocolCommission: number;
  automationFee: number;
  totalDue: number;
  utilizationRate: string;
  safetyMarginBps: number;
  priceSource: string;
}

export interface Position {
  id: string;
  chain: string;
  mode: string;
  asset: string;
  amount: number;
  owner: string;
  recipient: string;
  partner?: string | null;
  invoiceHash?: string | null;
  entryPrice: number;
  floorPrice: number;
  maximumPayout: number;
  startTime: number;
  expiryTime: number;
  settlementPrice: number;
  status: 'Active' | 'Claimable' | 'SettledNoPayout' | 'Claimed';
  claimablePayout: number;
  payoutClaimed: boolean;
  principalWithdrawn: boolean;
}

export interface CreatePositionRequest {
  chain?: 'solana' | 'arbitrum' | 'hyperliquid';
  asset: string;
  amount: number;
  durationSeconds: number;
  owner: string;
  recipient?: string;
  mode?: 'rate-lock' | 'depeg-shield';
  floorPrice?: number;
}

export interface Invoice {
  token: string;
  invoiceHash: string;
  merchantWallet: string;
  asset: string;
  amount: number;
  durationSeconds: number;
  description: string;
  status: 'pending' | 'paid' | 'expired';
  expiresAt: number;
  createdAt: number;
  customerWallet?: string;
  paidAt?: number;
  receiptHash?: string;
}

export declare class AstraClient {
  constructor(options?: AstraClientOptions);

  getHealth(): Promise<{ status: string; protocol: string; chains: string[]; version: string }>;
  getStats(): Promise<any>;

  getQuote(params: QuoteRequest): Promise<QuoteResponse>;
  getPriceHistory(symbol?: string): Promise<{ symbol: string; prices: number[]; timestamps?: number[] }>;

  createPosition(params: CreatePositionRequest): Promise<Position>;
  listPositions(filter?: { address?: string; chain?: string }): Promise<Position[]>;
  getPosition(positionId: string): Promise<Position>;
  settlePosition(positionId: string, options?: { testnetSimulateLoss?: boolean }): Promise<Position>;
  claimPayout(positionId: string): Promise<{ success: boolean; message: string; txHash: string; position: Position }>;

  createInvoice(params: {
    merchantWallet: string;
    asset: string;
    amount: number;
    durationSeconds?: number;
    description?: string;
  }): Promise<Invoice>;
  getInvoice(token: string): Promise<{ invoice: Invoice }>;
  payInvoice(token: string, payment: { payer: string; customerWallet?: string }): Promise<{ success: boolean; invoice: Invoice }>;

  registerUsername(params: { username: string; address: string; chain?: string }): Promise<any>;
  resolveUsername(username: string): Promise<any>;

  verifyReceipt(params: { receiptHash?: string; proofType?: string }): Promise<any>;

  getReservesState(user?: string): Promise<any>;
  depositReserves(params: { amount: number; user?: string }): Promise<any>;
  withdrawReserves(params: { shares: number; user?: string }): Promise<any>;
}

export default AstraClient;
