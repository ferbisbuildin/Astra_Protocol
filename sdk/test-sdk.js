import { AstraClient } from './index.js';

async function testSDK() {
  console.log('Testing @astra/sdk against running backend...');
  const astra = new AstraClient({ endpoint: 'http://localhost:4000', defaultChain: 'solana' });

  // 1. Health check
  const health = await astra.getHealth();
  console.log('✓ getHealth():', health.status, health.protocol);

  // 2. Dynamic quote
  const quote = await astra.getQuote({
    chain: 'solana',
    asset: 'SOL',
    amount: 10,
    durationSeconds: 86400,
    mode: 'depeg-shield',
    floorPrice: 95,
  });
  console.log(`✓ getQuote(): Notional $${quote.notional.toFixed(2)}, Risk Premium $${quote.riskPremium.toFixed(4)} USDC`);

  // 3. Create Position
  const position = await astra.createPosition({
    chain: 'solana',
    asset: 'SOL',
    amount: 2.5,
    durationSeconds: 86400,
    owner: 'GBoQWwa5SWsAFcRh1NQhWQ3Avmvwgsms6MmF2jg3Verk',
    floorPrice: 95,
    mode: 'depeg-shield',
  });
  console.log(`✓ createPosition(): ID #${position.id}, Status: ${position.status}`);

  // 4. Settle Position
  const settled = await astra.settlePosition(position.id, { testnetSimulateLoss: true });
  console.log(`✓ settlePosition(): Status: ${settled.status}, Payout: $${settled.claimablePayout}`);

  // 5. Claim Payout
  const claimed = await astra.claimPayout(position.id);
  console.log(`✓ claimPayout(): Success: ${claimed.success}, Tx: ${claimed.txHash}`);

  // 6. Invoices
  const invoice = await astra.createInvoice({
    merchantWallet: 'merchant_bob',
    asset: 'ETH',
    amount: 1.25,
    durationSeconds: 3600,
    description: 'Protected SaaS Subscription',
  });
  console.log(`✓ createInvoice(): Token ${invoice.token}, Hash: ${invoice.invoiceHash.slice(0, 16)}...`);

  const paid = await astra.payInvoice(invoice.token, { payer: 'alice_wallet' });
  console.log(`✓ payInvoice(): Status: ${paid.invoice.status}`);

  // 7. Username Registry
  const randHandle = `user_${Date.now().toString().slice(-6)}`;
  const reg = await astra.registerUsername({
    username: randHandle,
    address: '0x3a4b7f8841c2de9876a3b2b001928374a5e19f20',
    chain: 'hyperliquid',
  });
  console.log(`✓ registerUsername(): @${reg.username} registered.`);

  const resolved = await astra.resolveUsername(randHandle);
  console.log(`✓ resolveUsername(): @${randHandle} -> ${resolved.address}`);

  console.log('\nAll @astra/sdk methods verified successfully!');
}

testSDK().catch(err => {
  console.error('SDK test failed:', err);
  process.exit(1);
});
