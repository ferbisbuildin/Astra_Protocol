# Astra Protocol SDK (`astra-protocol-sdk`)

Official JavaScript & TypeScript client library for interacting with Astra Protocol across **Solana**, **Arbitrum One**, and **Hyperliquid (HyperEVM)**.

---

## 📦 Installation

```bash
npm install astra-protocol-sdk
# or
pnpm add astra-protocol-sdk
# or
yarn add astra-protocol-sdk
```

---

## 🚀 Quickstart

```javascript
import { AstraClient } from 'astra-protocol-sdk';

// Initialize client
const astra = new AstraClient({
  endpoint: 'http://localhost:4000', // Or your production API URL
  defaultChain: 'solana',           // 'solana' | 'arbitrum' | 'hyperliquid'
});

// Check connectivity & engine health
const health = await astra.getHealth();
console.log('Astra Protocol Engine:', health.protocol, health.version);
```

---

## ⚡ Key Workflows & Code Examples

### 1. Get Live Dynamic Protection Quotes
Calculate risk premiums using Astra's non-linear duration curve with real-time Pyth & Hyperliquid oracle rates.

```javascript
const quote = await astra.getQuote({
  chain: 'solana',           // 'solana' | 'arbitrum' | 'hyperliquid'
  asset: 'SOL',              // 'SOL', 'ETH', 'BTC', 'HYPE', 'ARB'
  amount: 5.0,               // Token quantity to protect
  durationSeconds: 86400,    // 24 hours (86400s)
  mode: 'depeg-shield',      // 'depeg-shield' or 'rate-lock'
  floorPrice: 95.0,          // Protection floor price in USD
});

console.log('Notional Value:', quote.notional);         // e.g. $551.98
console.log('Risk Premium:', quote.riskPremium);        // e.g. $2.76 USDC
console.log('Total Due:', quote.totalDue);              // e.g. $2.7649 USDC
```

---

### 2. Create & Activate a Protection Position
Lock down floor protection or rate locks for payments:

```javascript
const position = await astra.createPosition({
  chain: 'solana',
  asset: 'SOL',
  amount: 5.0,
  durationSeconds: 86400,
  owner: userWalletAddress,
  recipient: userWalletAddress,
  mode: 'depeg-shield',
  floorPrice: 95.0,
});

console.log('Position Created:', position.id, position.status);
```

---

### 3. Settle and Claim Payouts
Settlement happens automatically via permissionless keepers upon expiration. If a market breach occurs, the position becomes `Claimable`.

```javascript
// Check position status
const pos = await astra.getPosition(position.id);

if (pos.status === 'Claimable') {
  // Execute claim with replay & double-claim prevention
  const claimReceipt = await astra.claimPayout(position.id);
  console.log('Payout claimed! Tx Hash:', claimReceipt.txHash);
}
```

---

### 4. Merchant Invoicing with Downside Protection
Generate invoices that guarantee payment value even if crypto prices fluctuate during checkout.

```javascript
// Merchant generates invoice
const invoice = await astra.createInvoice({
  merchantWallet: '0x71C...49A',
  asset: 'ETH',
  amount: 1.5,
  durationSeconds: 3600, // 1 hour price lock
  description: 'Enterprise API License',
});

console.log('Invoice URL:', `https://astra.network/pay/${invoice.token}`);

// Customer pays invoice
const payment = await astra.payInvoice(invoice.token, {
  payer: customerWalletAddress,
});
console.log('Receipt Hash:', payment.invoice.receiptHash);
```

---

### 5. Universal Cross-Chain Handle Registry
Map human-readable handles (`@alice`) to addresses across Solana and EVM chains.

```javascript
// Register a handle
await astra.registerUsername({
  username: 'alice',
  address: '0xe5EFDDe4bA71a8DAF740B65256B583Fb774Aa93f',
  chain: 'arbitrum',
});

// Resolve a handle
const profile = await astra.resolveUsername('alice');
console.log('@alice resolves to:', profile.address);
```

---

### 6. Underwriting Reserves & LP Yields
Provide liquidity to earn underwriting yields from protection fees.

```javascript
// Inspect pool
const poolState = await astra.getReservesState();
console.log('Current APY:', poolState.apy); // e.g. 11.8%

// Deposit liquidity
const deposit = await astra.depositReserves({
  amount: 5000, // USDC
  user: lpWalletAddress,
});
```

---

## 🛡️ SDK API Reference

| Method | Parameters | Returns | Description |
| :--- | :--- | :--- | :--- |
| `getHealth()` | None | `Promise<HealthResponse>` | Engine status and active chain check |
| `getStats()` | None | `Promise<StatsResponse>` | Protocol TVL, volume, and active positions |
| `getQuote(params)` | `QuoteRequest` | `Promise<QuoteResponse>` | Dynamic premium quote with duration curve |
| `getPriceHistory(symbol)`| `string` | `Promise<Candles>` | High-throughput Pyth / Douro candles |
| `createPosition(params)` | `CreatePositionRequest`| `Promise<Position>` | Activate on-chain protection position |
| `listPositions(filter)` | `{ address?, chain? }` | `Promise<Position[]>` | List positions by owner/chain |
| `getPosition(id)` | `string` | `Promise<Position>` | Retrieve position by ID |
| `settlePosition(id)` | `string` | `Promise<Position>` | Settle expired position |
| `claimPayout(id)` | `string` | `Promise<ClaimResult>` | Claim USDC payout with double-claim rejection |
| `createInvoice(params)` | `InvoiceRequest` | `Promise<Invoice>` | Create downside-protected commercial invoice |
| `payInvoice(token, pay)` | `string, { payer }` | `Promise<PaymentResult>`| Settle invoice with recipient lock |
| `registerUsername(p)` | `UsernameRequest` | `Promise<Registry>` | Register universal `@handle` |
| `resolveUsername(user)`| `string` | `Promise<Profile>` | Resolve `@handle` to wallet address |
| `verifyReceipt(params)` | `ReceiptRequest` | `Promise<Verification>` | Verify ZK SNARK payment proof |
| `depositReserves(p)` | `{ amount, user }` | `Promise<DepositResult>`| Deposit underwriting liquidity |
| `withdrawReserves(p)` | `{ shares, user }` | `Promise<WithdrawResult>`| Queue timelocked LP withdrawal |

---

## 📄 License
MIT © Astra Protocol Core Engineering
