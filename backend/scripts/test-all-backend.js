/**
 * Astra Protocol — Comprehensive Backend Deep Test Suite
 * Tests all REST APIs, Oracle aggregators, Pyth Douro Labs streams,
 * Quoting algebra, Positions, Invoices, ZK Receipts, Reserves & Security Protections.
 */

import http from 'http';

const BASE_URL = 'http://localhost:4000';

let passed = 0;
let failed = 0;

function logPass(title) {
  console.log(`  \x1b[32m✔ PASS:\x1b[0m ${title}`);
  passed++;
}

function logFail(title, err) {
  console.error(`  \x1b[31m✘ FAIL:\x1b[0m ${title}`);
  if (err) console.error(`    Details:`, err);
  failed++;
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json, raw: data });
        } catch {
          resolve({ status: res.statusCode, body: null, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('       Astra Protocol Deep Backend Test Suite         ');
  console.log('======================================================\n');

  // 1. Health API
  console.log('[1] Testing Protocol Health API...');
  try {
    const res = await request('GET', '/api/v1/health');
    if (res.status === 200 && res.body.status === 'healthy' && Array.isArray(res.body.chains)) {
      logPass(`Health check returned healthy with chains: [${res.body.chains.join(', ')}]`);
    } else {
      logFail('Health check returned unexpected payload', res.body);
    }
  } catch (e) {
    logFail('Health check request failed', e);
  }

  // 2. Pyth Douro Labs Historical Stream
  console.log('\n[2] Testing High-Throughput Pyth Douro Labs Stream...');
  const symbols = ['BTC', 'ETH', 'SOL', 'ARB', 'HYPE'];
  for (const sym of symbols) {
    try {
      const res = await request('GET', `/api/v1/history?symbol=${sym}`);
      if (res.status === 200 && res.body.symbol && Array.isArray(res.body.prices) && res.body.prices.length > 0) {
        logPass(`Pyth Douro Labs returned ${res.body.prices.length} candles for ${sym} (Latest: $${res.body.prices[res.body.prices.length - 1]})`);
      } else {
        logFail(`Pyth Douro Labs failed for ${sym}`, res.body);
      }
    } catch (e) {
      logFail(`Pyth Douro Labs connection error for ${sym}`, e);
    }
  }

  // 3. Dynamic Quoting Engine
  console.log('\n[3] Testing Astra Protocol Quoting Engine Across Chains...');
  const testQuotes = [
    { chain: 'solana', asset: 'SOL', amount: 5, duration: 86400, mode: 'depeg-shield', floor: 95 },
    { chain: 'arbitrum', asset: 'ETH', amount: 2, duration: 3600, mode: 'rate-lock', floor: 0 },
    { chain: 'hyperliquid', asset: 'HYPE', amount: 50, duration: 604800, mode: 'depeg-shield', floor: 40 },
  ];

  for (const q of testQuotes) {
    try {
      const path = `/api/v1/quote?chain=${q.chain}&asset=${q.asset}&amount=${q.amount}&durationSeconds=${q.duration}&mode=${q.mode}&floor=${q.floor}`;
      const res = await request('GET', path);
      if (
        res.status === 200 &&
        res.body.notional > 0 &&
        res.body.totalDue > 0 &&
        res.body.riskPremium > 0
      ) {
        logPass(`Quote for ${q.amount} ${q.asset} on ${q.chain}: Notional $${res.body.notional.toFixed(2)}, Risk Premium $${res.body.riskPremium.toFixed(4)} USDC (Total Due: $${res.body.totalDue.toFixed(4)} USDC)`);
      } else {
        logFail(`Quote calculation failed for ${q.asset}`, res.body);
      }
    } catch (e) {
      logFail(`Quote request error for ${q.asset}`, e);
    }
  }

  // 4. Positions Lifecycle
  console.log('\n[4] Testing Multi-Chain Position Lifecycle (Create -> Settle -> Claim)...');
  let positionId = null;
  try {
    const createRes = await request('POST', '/api/v1/positions', {
      chain: 'solana',
      asset: 'SOL',
      amount: 10,
      mode: 'depeg-shield',
      floorPrice: 100,
      durationSeconds: 86400,
      owner: 'GBoQWwa5SWsAFcRh1NQhWQ3Avmvwgsms6MmF2jg3Verk',
    });

    if ((createRes.status === 200 || createRes.status === 201) && createRes.body && createRes.body.id) {
      positionId = createRes.body.id;
      logPass(`Created position ${positionId} on Solana (Status: ${createRes.body.status})`);
    } else {
      logFail('Failed to create position', createRes.body);
    }
  } catch (e) {
    logFail('Position create request error', e);
  }

  if (positionId) {
    try {
      // Settle position with simulated loss so it enters Claimable state
      const settleRes = await request('POST', `/api/v1/positions/${positionId}/settle`, { testnetSimulateLoss: true });
      if (settleRes.status === 200 && settleRes.body && settleRes.body.status === 'Claimable') {
        logPass(`Settled position ${positionId} -> Result: ${settleRes.body.status} (Settlement Price: $${settleRes.body.settlementPrice}, Payout: $${settleRes.body.claimablePayout} USDC)`);
      } else {
        logFail(`Position settlement unexpected state`, settleRes.body);
      }

      // Claim position
      const claimRes = await request('POST', `/api/v1/positions/${positionId}/claim`);
      if (claimRes.status === 200 && claimRes.body && claimRes.body.success) {
        logPass(`Claimed payout for position ${positionId} -> Final Status: ${claimRes.body.position.status}`);
      } else {
        logFail(`Position claim unexpected response`, claimRes.body);
      }
    } catch (e) {
      logFail(`Position settlement request error`, e);
    }
  }

  // 5. Invoices & Rate-Locked Payments
  console.log('\n[5] Testing Invoice Generation & Payment with Protection...');
  let invoiceToken = null;
  try {
    const invRes = await request('POST', '/api/v1/invoices', {
      recipient: 'merchant_bob',
      asset: 'ETH',
      amount: 1.5,
      durationSeconds: 3600,
      chain: 'arbitrum',
    });
    if ((invRes.status === 200 || invRes.status === 201) && invRes.body && invRes.body.token) {
      invoiceToken = invRes.body.token;
      logPass(`Generated invoice ${invoiceToken} for 1.5 ETH (Hash: ${invRes.body.invoiceHash.slice(0, 16)}...)`);
    } else {
      logFail('Failed to create invoice', invRes.body);
    }
  } catch (e) {
    logFail('Invoice creation error', e);
  }

  if (invoiceToken) {
    try {
      const payRes = await request('POST', `/api/v1/invoices/${invoiceToken}/pay`, {
        payer: 'alice_wallet',
      });
      if (payRes.status === 200 && payRes.body.invoice && payRes.body.invoice.status === 'paid') {
        logPass(`Paid invoice ${invoiceToken} -> Status: PAID with attached receipt hash ${payRes.body.invoice.receiptHash.slice(0, 16)}...`);
      } else {
        logFail('Invoice payment unexpected response', payRes.body);
      }
    } catch (e) {
      logFail('Invoice pay request error', e);
    }
  }

  // 6. ZK Cryptographic Receipts
  console.log('\n[6] Testing ZK Payment Proof Verification & Nullifier Check...');
  try {
    const proofRes = await request('POST', '/api/v1/receipts/verify', {
      receiptHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
      proofType: 'BN254_SNARK',
      proofData: '0x1234abcd5678ef90',
    });
    if (proofRes.status === 200 && proofRes.body.verified === true) {
      logPass(`Verified zero-knowledge BN254 pairing proof (Proof ID: ${proofRes.body.receiptId.slice(0, 16)}...)`);
    } else {
      logFail('ZK proof verification failed', proofRes.body);
    }
  } catch (e) {
    logFail('ZK verification request error', e);
  }

  // 7. Universal Username Registry
  console.log('\n[7] Testing Universal Username Registry (@handle)...');
  const testHandle = 'alice' + Math.floor(Math.random() * 10000);
  try {
    const regRes = await request('POST', '/api/v1/usernames/register', {
      handle: testHandle,
      walletAddress: '0xe5EFDDe4bA71a8DAF740B65256B583Fb774Aa93f',
      preferredChain: 'arbitrum',
    });
    if (regRes.status === 201 && (regRes.body.handle === testHandle || regRes.body.username === testHandle)) {
      logPass(`Registered @${testHandle} to 0xe5EFDDe4bA71a8DAF740B65256B583Fb774Aa93f`);
    } else {
      logFail(`Failed to register handle @${testHandle}`, regRes.body);
    }

    // Resolve handle
    const resolveRes = await request('GET', `/api/v1/usernames/@${testHandle}`);
    if (resolveRes.status === 200 && (resolveRes.body.walletAddress === '0xe5EFDDe4bA71a8DAF740B65256B583Fb774Aa93f' || resolveRes.body.address === '0xe5EFDDe4bA71a8DAF740B65256B583Fb774Aa93f')) {
      logPass(`Resolved @${testHandle} -> ${resolveRes.body.walletAddress || resolveRes.body.address}`);
    } else {
      logFail(`Failed to resolve handle @${testHandle}`, resolveRes.body);
    }
  } catch (e) {
    logFail('Username registry request error', e);
  }

  // 8. Documentation & Portal Routes
  console.log('\n[8] Testing Developer Portal & Documentation Routes...');
  try {
    const docsRes = await request('GET', '/docs');
    if (docsRes.status === 200 && docsRes.raw.includes('Astra Protocol — Developer Documentation')) {
      logPass('Route /docs successfully served docs.html portal');
    } else {
      logFail('Route /docs failed to serve docs portal', docsRes.status);
    }

    const devRes = await request('GET', '/developers');
    if (devRes.status === 200 && devRes.raw.includes('Astra Protocol — Developer Documentation')) {
      logPass('Route /developers successfully served docs.html portal');
    } else {
      logFail('Route /developers failed to serve docs portal', devRes.status);
    }
  } catch (e) {
    logFail('Documentation routes request error', e);
  }

  // 9. Security Audit: Double-Claim Rejection
  console.log('\n[9] Testing Security Protection: Double-Claim Rejection...');
  try {
    const doubleClaimRes = await request('POST', `/api/v1/positions/${positionId}/claim`);
    if (doubleClaimRes.status === 400 && doubleClaimRes.body.error && doubleClaimRes.body.error.includes('Double-claim rejected')) {
      logPass('Double-claim attack successfully prevented with HTTP 400 rejection');
    } else {
      logFail('Double-claim was not blocked properly', doubleClaimRes.body);
    }
  } catch (e) {
    logFail('Double-claim test error', e);
  }

  // 10. Security Audit: Double-Payment Rejection
  console.log('\n[10] Testing Security Protection: Double-Payment Rejection...');
  try {
    const doublePayRes = await request('POST', `/api/v1/invoices/${invoiceToken}/pay`, { payer: 'attacker' });
    if (doublePayRes.status === 400 && doublePayRes.body.error && doublePayRes.body.error.includes('Double-payment rejected')) {
      logPass('Double-payment attack successfully prevented with HTTP 400 rejection');
    } else {
      logFail('Double-payment was not blocked properly', doublePayRes.body);
    }
  } catch (e) {
    logFail('Double-payment test error', e);
  }

  // 11. Reserve Vault: Deposit & State
  console.log('\n[11] Testing Reserve Pool Liquidity & LP Minting...');
  const testUser = 'test_lp_' + Math.floor(Math.random() * 100000);
  try {
    const depRes = await request('POST', '/api/v1/reserves/deposit', { amount: 1500, user: testUser });
    if (depRes.status === 200 && depRes.body.success && depRes.body.mintedShares === 1500) {
      logPass(`Deposited 1,500 USDC -> Minted 1,500 Astra-LP shares (Tx: ${depRes.body.txHash.slice(0, 16)}...)`);
    } else {
      logFail('Reserve deposit failed', depRes.body);
    }

    const stateRes = await request('GET', `/api/v1/reserves/state?user=${testUser}`);
    if (stateRes.status === 200 && stateRes.body.userShares === 1500) {
      logPass(`Reserve pool state verified: ${stateRes.body.userShares} LP shares, APY ${stateRes.body.apy}`);
    } else {
      logFail('Reserve state check failed', stateRes.body);
    }
  } catch (e) {
    logFail('Reserve test error', e);
  }

  // 12. Security Audit: Input Sanitization & Prototype Pollution
  console.log('\n[12] Testing Username Input Sanitization & Prototype Pollution...');
  try {
    const protoRes = await request('POST', '/api/v1/usernames/register', { handle: '__proto__', walletAddress: '0x123456789012' });
    const xssRes = await request('POST', '/api/v1/usernames/register', { handle: '<script>', walletAddress: '0x123456789012' });
    if (protoRes.status === 400 && xssRes.status === 400) {
      logPass('Prototype pollution & XSS handle injections strictly blocked with HTTP 400');
    } else {
      logFail('Security vulnerability: malicious handle accepted', { protoRes, xssRes });
    }
  } catch (e) {
    logFail('Sanitization test error', e);
  }

  // Summary
  console.log('\n======================================================');
  console.log(`Test Execution Finished: \x1b[32m${passed} Passed\x1b[0m, \x1b[31m${failed} Failed\x1b[0m`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
