import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  
  // Arbitrum Settings
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    engineAddress: process.env.ARBITRUM_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000',
    reserveVaultAddress: process.env.ARBITRUM_RESERVE_ADDRESS || '0x0000000000000000000000000000000000000000',
    oracleAddress: process.env.ARBITRUM_ORACLE_ADDRESS || '0x0000000000000000000000000000000000000000',
    receiptRegistryAddress: process.env.ARBITRUM_RECEIPT_ADDRESS || '0x0000000000000000000000000000000000000000',
  },

  // Solana Settings
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    programId: process.env.SOLANA_PROGRAM_ID || 'AstraProtocoL1111111111111111111111111111111',
    pythSolUsdFeed: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4SEBy6',
  },

  // Hyperliquid Settings
  hyperliquid: {
    apiUrl: process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid.xyz/info',
    wsUrl: process.env.HYPERLIQUID_WS_URL || 'wss://api.hyperliquid.xyz/ws',
    engineAddress: process.env.HYPEREVM_ENGINE_ADDRESS || '0x0000000000000000000000000000000000000000',
  },

  // Protocol Defaults
  protocol: {
    priceScale: 100_000_000, // 8 decimals
    maxPayoutBps: 9000,      // 90%
    baseDailyRateBps: 15,    // 0.15% per day
    keeperRewardUsdc: 2,     // 2 USDC
  }
};
