import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  
  // Arbitrum Sepolia Testnet Settings
  arbitrum: {
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    chainId: 421614,
    engineAddress: '0x732E212e3d745a8d6493e9aB065771dDeC0f9342',
    reserveVaultAddress: '0x7FdA9C1d8806495476cAa4871cB6fF663b8F1A04',
    oracleAddress: '0xB1342904AcB57B803bea11a5B4691Dc8492EC433',
    receiptRegistryAddress: '0xF481bf304CA3F8624D6F6B135ABA811283B8494C',
    usernameRegistryAddress: '0xB90f861F38B31d726c660AEF12b7c0cb83b15c27',
    balanceVaultAddress: '0xCDF50aE966C65f3f62eE2eD53db83F6CDbab2619',
  },

  // Solana Devnet Settings
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    programId: 'AstraProtocoL1111111111111111111111111111111',
    authority: 'GBoQWwa5SWsAFcRh1NQhWQ3Avmvwgsms6MmF2jg3Verk',
    pythSolUsdFeed: 'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4SEBy6',
  },

  // Hyperliquid Testnet Settings
  hyperliquid: {
    apiUrl: process.env.HYPERLIQUID_API_URL || 'https://api.hyperliquid-testnet.xyz/info',
    wsUrl: process.env.HYPERLIQUID_WS_URL || 'wss://api.hyperliquid-testnet.xyz/ws',
    engineAddress: '0x732E212e3d745a8d6493e9aB065771dDeC0f9342',
  },

  // Protocol Parameter Defaults
  protocol: {
    priceScale: 100_000_000, // 8 decimals
    maxPayoutBps: 9000,      // 90%
    baseDailyRateBps: 15,    // 0.15% per day
    keeperRewardUsdc: 2,     // 2 USDC
  }
};
