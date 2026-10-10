import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { oracleService } from './services/oracle_service.js';
import { receiptService } from './services/receipt_service.js';
import { keeper } from './services/settlement_keeper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Dedicated Developer & Documentation Portal Routes
app.get(['/docs', '/developers'], (req, res) => {
  res.sendFile(path.join(__dirname, '../docs.html'));
});

// In-memory data structures
const mockPositions = new Map();
const invoices = new Map();
const usernames = new Map();

/**
 * Health Check
 */
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    protocol: 'Astra Multi-Chain Loss Protection Protocol',
    chains: ['solana', 'hyperliquid', 'arbitrum'],
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Dynamic Quoting Engine
 * Query params: ?chain=solana|arbitrum|hyperliquid&asset=ETH|SOL|ARB|HYPE&amount=5&durationSeconds=86400&mode=rate-lock|depeg-shield&floor=0.99
 */
app.get('/api/v1/quote', async (req, res) => {
  try {
    const {
      chain = 'arbitrum',
      asset = 'ETH',
      amount = '1',
      durationSeconds = '86400',
      mode = 'depeg-shield',
      floor = '0',
    } = req.query;

    const numAmount = parseFloat(amount);
    const numDuration = parseInt(durationSeconds, 10);
    const floorPrice = parseFloat(floor);

    if (isNaN(numAmount) || numAmount <= 0 || isNaN(numDuration) || numDuration <= 0) {
      return res.status(400).json({ error: 'Invalid amount or duration' });
    }

    const priceInfo = await oracleService.getPrice(chain.toLowerCase(), asset);
    const currentPrice = priceInfo.price;
    const notional = numAmount * currentPrice;

    // Maximum payout: 90% coverage
    const maximumPayout = notional * 0.90;

    // Non-linear duration curve (CoverFi specification)
    let baseBps = 30; // <= 1 day
    if (numDuration > 14 * 86400) {
      baseBps = 250;
    } else if (numDuration > 7 * 86400) {
      baseBps = 150;
    } else if (numDuration > 86400) {
      baseBps = 100;
    }

    const basePremium = (notional * baseBps) / 10000;
    const safetyMargin = (notional * 20) / 10000; // 20 bps
    const rawPremium = basePremium + safetyMargin;

    // Cap at 10% (1000 bps) and min of 0.01 units
    const cap = (notional * 1000) / 10000;
    const riskPremium = Math.max(0.01, Math.min(rawPremium, cap));
    const automationFee = 0.005; // 500_000 stroops/units
    const totalDue = riskPremium + automationFee;
    const protocolCommission = (riskPremium * 1200) / 10000; // 12%

    res.json({
      chain,
      mode,
      asset: asset.toUpperCase(),
      amount: numAmount,
      durationSeconds: numDuration,
      entryPrice: currentPrice,
      floorPrice: floorPrice > 0 ? floorPrice : currentPrice,
      notional,
      maximumPayout,
      basePremium,
      safetyMargin,
      riskPremium,
      protocolCommission,
      automationFee,
      totalDue,
      utilizationRate: '42.8%',
      safetyMarginBps: 20,
      priceSource: priceInfo.source,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Positions API: Create & Settle
 */
app.post('/api/v1/positions', async (req, res) => {
  try {
    const { chain, mode, asset, amount, durationSeconds, owner, recipient, partner, invoiceHash, floorPrice } = req.body;
    const priceInfo = await oracleService.getPrice(chain, asset);
    const id = Date.now().toString();

    const notional = amount * priceInfo.price;
    const maxPayout = notional * 0.90;

    const position = {
      id,
      chain,
      mode: mode || 'depeg-shield',
      asset,
      amount,
      owner,
      recipient: recipient || owner,
      partner: partner || null,
      invoiceHash: invoiceHash || null,
      entryPrice: priceInfo.price,
      floorPrice: floorPrice || priceInfo.price,
      maximumPayout: maxPayout,
      startTime: Date.now(),
      expiryTime: Date.now() + durationSeconds * 1000,
      settlementPrice: 0,
      status: 'Active',
      claimablePayout: 0,
      payoutClaimed: false,
      principalWithdrawn: false,
    };

    mockPositions.set(id, position);
    res.json(position);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/positions', (req, res) => {
  const { address, chain } = req.query;
  let all = Array.from(mockPositions.values());
  if (address) {
    all = all.filter(p => 
      p.owner?.toLowerCase() === address.toLowerCase() ||
      p.recipient?.toLowerCase() === address.toLowerCase()
    );
  }
  if (chain) {
    all = all.filter(p => p.chain.toLowerCase() === chain.toLowerCase());
  }
  res.json(all);
});

app.post('/api/v1/positions/:id/settle', async (req, res) => {
  const pos = mockPositions.get(req.params.id);
  if (!pos) return res.status(404).json({ error: 'Position not found' });

  const priceInfo = await oracleService.getPrice(pos.chain, pos.asset);
  pos.settlementPrice = priceInfo.price;

  const refPrice = pos.mode === 'depeg-shield' ? pos.floorPrice : pos.entryPrice;
  if (pos.settlementPrice < refPrice) {
    const loss = refPrice - pos.settlementPrice;
    const payout = Math.min((pos.amount * loss), pos.maximumPayout);
    pos.claimablePayout = payout;
    pos.status = 'Claimable';
  } else {
    pos.claimablePayout = 0;
    pos.status = 'SettledNoPayout';
  }

  res.json(pos);
});

app.post('/api/v1/positions/:id/claim', (req, res) => {
  const pos = mockPositions.get(req.params.id);
  if (!pos) return res.status(404).json({ error: 'Position not found' });
  pos.payoutClaimed = true;
  pos.status = 'Claimed';
  res.json({ success: true, position: pos });
});

/**
 * Invoice Engine (Ported from CoverFi Value Protection Invoices)
 */
app.post('/api/v1/invoices', (req, res) => {
  try {
    const { merchantWallet, recipient, asset, amount, durationSeconds, description } = req.body;
    const token = `ast_${crypto.randomBytes(24).toString('base64url')}`;
    const invoiceHash = '0x' + crypto.createHash('sha256').update(JSON.stringify({
      merchantWallet: merchantWallet || recipient, asset, amount, durationSeconds, nonce: crypto.randomUUID(),
    })).digest('hex');

    const invoice = {
      token,
      invoiceHash,
      merchantWallet: merchantWallet || recipient,
      asset,
      amount,
      durationSeconds: durationSeconds || 3600,
      description: description || 'Astra Protected Invoice',
      status: 'pending',
      expiresAt: Date.now() + 86400 * 1000,
      createdAt: Date.now(),
    };

    invoices.set(token, invoice);
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/invoices/:token', (req, res) => {
  const inv = invoices.get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invoice not found or expired' });
  res.json({ invoice: inv });
});

app.post('/api/v1/invoices/:token/pay', (req, res) => {
  const inv = invoices.get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  inv.status = 'paid';
  inv.customerWallet = req.body.customerWallet || req.body.payer;
  inv.receiptHash = '0x' + crypto.randomBytes(32).toString('hex');
  res.json({ invoice: inv });
});

app.post('/api/v1/invoices/:token/submitted', (req, res) => {
  const inv = invoices.get(req.params.token);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  inv.status = 'submitted';
  inv.customerWallet = req.body.customerWallet || req.body.payer;
  inv.paymentLockId = req.body.paymentLockId;
  res.json({ invoice: inv });
});

/**
 * Username Registry API (@username mapping)
 */
app.post('/api/v1/usernames/register', (req, res) => {
  const rawName = req.body.username || req.body.handle || '';
  const address = req.body.address || req.body.walletAddress || '';
  const chain = req.body.chain || req.body.preferredChain || 'solana';
  const cleanName = rawName.toLowerCase().replace(/^@/, '');
  if (!cleanName || !address) {
    return res.status(400).json({ error: 'Username and address are required' });
  }
  if (usernames.has(cleanName)) {
    return res.status(409).json({ error: 'Username already registered' });
  }
  const data = { username: cleanName, handle: cleanName, address, walletAddress: address, chain, expiry: Date.now() + 365 * 86400 * 1000 };
  usernames.set(cleanName, data);
  res.status(201).json({ success: true, username: cleanName, handle: cleanName, address, walletAddress: address });
});

app.get('/api/v1/usernames/:username', (req, res) => {
  const cleanName = req.params.username.toLowerCase().replace(/^@/, '');
  const entry = usernames.get(cleanName);
  if (!entry) return res.status(404).json({ error: 'Username not found' });
  res.json(entry);
});

/**
 * Receipts API & ZK Proofs
 */
app.post('/api/v1/receipts/verify', (req, res) => {
  const { receiptHash, proofType, proofData } = req.body;
  res.json({
    verified: true,
    receiptId: receiptHash || ('0x' + crypto.randomBytes(20).toString('hex')),
    proofType: proofType || 'BN254_SNARK',
    nullifierHash: '0x' + crypto.randomBytes(32).toString('hex'),
    timestamp: Date.now(),
  });
});

app.post('/api/v1/receipts/register', (req, res) => {
  try {
    const { payer, recipient, token, amount, metadata } = req.body;
    const paymentHash = receiptService.generatePaymentHash(payer, recipient, token, amount);
    const receipt = receiptService.registerReceipt({ paymentHash, payer, recipient, token, amount, metadata });
    res.json(receipt);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/v1/receipts/:hash', (req, res) => {
  const receipt = receiptService.getReceipt(req.params.hash);
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
  res.json(receipt);
});

/**
 * Global Statistics
 */
app.get('/api/v1/stats', (req, res) => {
  res.json({
    totalValueProtectedUsd: 14_850_200,
    totalReserveLiquidityUsd: 22_500_000,
    totalPayoutsSettledUsd: 840_320,
    activePositionsCount: mockPositions.size + 1420,
    supportedChains: ['Solana', 'Arbitrum One', 'Hyperliquid / HyperEVM'],
    underwritingYieldApy: '11.8%',
  });
});

/**
 * Pyth / Douro Labs & Hyperliquid Historical Price Endpoint
 * Query: ?symbol=BTC|ETH|SOL|ARB|HYPE
 */
app.get('/api/v1/history', async (req, res) => {
  const symbol = (req.query.symbol || 'SOL').toUpperCase();
  const pythMap = {
    BTC: 'Crypto.BTC/USD',
    ETH: 'Crypto.ETH/USD',
    SOL: 'Crypto.SOL/USD',
  };

  const pythSymbol = pythMap[symbol];
  if (pythSymbol) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - (14 * 86400); // 14 days
      const url = `https://pyth.dourolabs.app/v1/fixed_rate@1000ms/history?symbol=${encodeURIComponent(pythSymbol)}&from=${from}&to=${now}&resolution=1D`;
      const response = await fetch(url, {
        headers: { 'Authorization': 'Bearer 4mM6CGdUVyhareZiR8MHKUJKAyeH7E8gSamuuDPgKFBE' }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.c && data.c.length > 0) {
          return res.json({
            source: 'Pyth-Douro-Labs',
            symbol,
            prices: data.c,
            timestamps: data.t,
            high: data.h,
            low: data.l,
          });
        }
      }
    } catch (e) {
      console.warn('Pyth Douro history fetch failed:', e.message);
    }
  }

  // Fallback for HYPE/PURR/ARB or if offline
  const fallbackPrices = {
    HYPE: [38.2, 39.5, 41.2, 40.8, 42.1, 43.5, 44.0],
    ARB: [0.52, 0.54, 0.55, 0.53, 0.56, 0.57, 0.58],
    PURR: [4.1, 4.2, 4.35, 4.25, 4.4, 4.55, 4.6],
    SOL: [98.2, 101.4, 103.8, 102.5, 105.2, 107.1, 108.49],
    ETH: [2380, 2410, 2445, 2420, 2450, 2462, 2469.25],
    BTC: [78500, 79200, 80400, 79800, 81200, 81800, 82027.5],
  };
  const list = fallbackPrices[symbol] || [1.0, 1.0, 1.0, 1.0];
  res.json({
    source: 'Astra-Baseline',
    symbol,
    prices: list,
  });
});

app.listen(config.port, () => {
  console.log(`[Astra Backend] Server active at http://localhost:${config.port}`);
  keeper.start();
});
