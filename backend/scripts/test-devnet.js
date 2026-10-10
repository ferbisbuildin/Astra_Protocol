import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { ethers } from 'ethers';

console.log('====================================================');
console.log('🚀 ASTRA MULTI-CHAIN PROTOCOL — DEVNET TEST RUNNER');
console.log('====================================================\n');

async function testSolanaDevnet() {
  console.log('--- 1. Testing Solana Devnet Connectivity ---');
  try {
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
    const version = await connection.getVersion();
    console.log('✅ Connected to Solana Devnet node version:', version['solana-core']);

    const slot = await connection.getSlot();
    console.log('✅ Current Devnet slot:', slot);

    // Create a temporary test keypair
    const testKeypair = Keypair.generate();
    const pubkey = testKeypair.publicKey.toBase58();
    console.log('🔑 Generated Devnet Test Keypair:', pubkey);

    console.log('💸 Requesting 1.0 SOL Devnet Airdrop...');
    try {
      const airdropSig = await connection.requestAirdrop(testKeypair.publicKey, 1 * LAMPORTS_PER_SOL);
      console.log('⏳ Airdrop Tx submitted:', airdropSig);
      console.log('🔗 Explorer:', `https://explorer.solana.com/tx/${airdropSig}?cluster=devnet`);

      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: airdropSig,
        ...latestBlockhash,
      }, 'confirmed');

      const balance = await connection.getBalance(testKeypair.publicKey);
      console.log(`✅ Airdrop confirmed! Balance: ${balance / LAMPORTS_PER_SOL} SOL\n`);
    } catch (airdropErr) {
      console.warn('⚠️ Devnet faucet rate-limited or busy (standard for public devnet):', airdropErr.message);
      console.log('✅ Solana Devnet RPC is reachable and responsive.\n');
    }
  } catch (err) {
    console.error('❌ Solana Devnet error:', err.message, '\n');
  }
}

async function testHyperliquidTestnet() {
  console.log('--- 2. Testing Hyperliquid Testnet API ---');
  try {
    const res = await fetch('https://api.hyperliquid-testnet.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mids = await res.json();
    const count = Object.keys(mids).length;
    console.log(`✅ Connected to Hyperliquid Testnet! Markets found: ${count}`);
    const sampleKeys = ['ETH', 'BTC', 'SOL', 'HYPE', 'PURR'].filter(k => mids[k]);
    sampleKeys.forEach(k => {
      console.log(`   📊 ${k}: $${parseFloat(mids[k]).toFixed(2)}`);
    });
    console.log('');
  } catch (err) {
    console.error('❌ Hyperliquid Testnet error:', err.message, '\n');
  }
}

async function testArbitrumSepolia() {
  console.log('--- 3. Testing Arbitrum Sepolia Testnet ---');
  try {
    const provider = new ethers.JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');
    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();
    console.log('✅ Connected to Arbitrum Sepolia! Latest Block:', blockNumber);
    console.log('⛽ Gas Price:', ethers.formatUnits(feeData.gasPrice || 0n, 'gwei'), 'gwei\n');
  } catch (err) {
    console.error('❌ Arbitrum Sepolia error:', err.message, '\n');
  }
}

async function runAll() {
  await testSolanaDevnet();
  await testHyperliquidTestnet();
  await testArbitrumSepolia();
  console.log('====================================================');
  console.log('🎉 ALL DEVNET / TESTNET TESTS COMPLETED');
  console.log('====================================================');
}

runAll();
