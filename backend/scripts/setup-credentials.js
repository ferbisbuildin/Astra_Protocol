/**
 * Astra Protocol - Keypair Generator & RPC Verification Script (ESM)
 * Uses Alchemy RPC with user API key + Pyth Hermes & Hyperliquid Free Price Streams
 */

import { ethers } from 'ethers';
import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALCHEMY_KEY = 'xKXsByrKTiXIj4uNXuzAizQN2hXM354l';
const ARB_SEPOLIA_RPC = `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ARB_MAINNET_RPC = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const PYTH_HERMES_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

async function setup() {
  console.log('======================================================');
  console.log('🚀 ASTRA PROTOCOL - DEPLOYER KEYS & RPC CONFIGURATION');
  console.log('======================================================\n');

  // 1. Generate EVM Deployer Wallet
  const evmWallet = ethers.Wallet.createRandom();
  console.log('✅ EVM Deployer Wallet Generated:');
  console.log('   Address:    ', evmWallet.address);
  console.log('   Private Key:', evmWallet.privateKey);

  // 2. Generate Solana Deployer Wallet
  const solanaKeypair = Keypair.generate();
  const solanaPubkey = solanaKeypair.publicKey.toBase58();
  const solanaSecretHex = Buffer.from(solanaKeypair.secretKey).toString('hex');
  console.log('\n✅ Solana Devnet Deployer Keypair Generated:');
  console.log('   Public Key: ', solanaPubkey);
  console.log('   Secret Key: ', solanaSecretHex);

  // 3. Test Alchemy Arbitrum Sepolia RPC
  console.log('\n🔍 Testing Alchemy Arbitrum Sepolia Connection...');
  try {
    const provider = new ethers.JsonRpcProvider(ARB_SEPOLIA_RPC);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ Alchemy Arbitrum Sepolia Connected! Block #${blockNumber}`);
  } catch (err) {
    console.error('❌ Alchemy RPC test error:', err.message);
  }

  // 4. Test Free Pyth Hermes Price Stream
  console.log('\n🔍 Testing Free High-Throughput Pyth Hermes Oracle Stream...');
  try {
    const pythPriceIds = [
      '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
      '0xe62df6e01d0aaf0f4204230c30c004173ecceca50f92e52b68ec3f83e5860dd6', // BTC/USD
      '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
    ];
    const url = `${PYTH_HERMES_URL}?ids[]=${pythPriceIds.join('&ids[]=')}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data.parsed) {
      console.log('✅ Pyth Hermes High-Throughput Stream Active:');
      data.parsed.forEach(p => {
        const rawPrice = Number(p.price.price);
        const expo = Number(p.price.expo);
        const calcPrice = (rawPrice * Math.pow(10, expo)).toFixed(2);
        console.log(`   Feed: ${p.id.slice(0, 10)}... | Live Price: $${calcPrice}`);
      });
    }
  } catch (err) {
    console.warn('Pyth fetch fallback:', err.message);
  }

  // 5. Save everything to .env
  const envContent = `# Astra Protocol Environment & RPC Configuration
# Generated automatically for devnet / testnet deployment

# Alchemy RPC
ALCHEMY_API_KEY=${ALCHEMY_KEY}
ARBITRUM_SEPOLIA_RPC=${ARB_SEPOLIA_RPC}
ARBITRUM_MAINNET_RPC=${ARB_MAINNET_RPC}

# Generated Deployer Wallets
EVM_DEPLOYER_ADDRESS=${evmWallet.address}
EVM_DEPLOYER_PRIVATE_KEY=${evmWallet.privateKey}

SOLANA_DEPLOYER_PUBKEY=${solanaPubkey}
SOLANA_DEPLOYER_SECRET_HEX=${solanaSecretHex}

# High-Throughput Free Price Streams
PYTH_HERMES_ENDPOINT=${PYTH_HERMES_URL}
HYPERLIQUID_TESTNET_API=https://api.hyperliquid-testnet.xyz/info
PORT=4000
`;

  fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent, 'utf-8');
  console.log('\n💾 Saved configuration to backend/.env');

  // Also write deployer info summary for user
  const infoFile = {
    evmDeployer: {
      address: evmWallet.address,
      privateKey: evmWallet.privateKey,
      network: 'Arbitrum Sepolia',
      faucetUrl: 'https://www.alchemy.com/faucets/arbitrum-sepolia'
    },
    solanaDeployer: {
      publicKey: solanaPubkey,
      secretKeyHex: solanaSecretHex,
      network: 'Solana Devnet',
      faucetUrl: 'https://faucet.solana.com'
    },
    alchemyRpc: ARB_SEPOLIA_RPC,
    pythStream: PYTH_HERMES_URL
  };
  fs.writeFileSync(path.join(__dirname, '..', 'deployer-keys.json'), JSON.stringify(infoFile, null, 2), 'utf-8');
  console.log('💾 Saved deployer info to backend/deployer-keys.json\n');
}

setup();
