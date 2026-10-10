# Astra Protocol — Multi-Chain Loss Protection Protocol

Astra is an open-source, multi-chain loss protection and decentralized finance protocol built on **Solana**, **Arbitrum One**, and **Hyperliquid (HyperEVM)**, evolved from the open-source architecture of CoverFi.

---

## 🌟 Architecture & Evolution from CoverFi

The cloned repositories in `coverfi/` (`coverfi-contracts`, `CoverFi-backend`, `CoverFI-logic-pages`, `Coverfi-landing`, `coverfi-docs`, `coverfi-research`) have been studied and ported into a multi-chain architecture:

| Component | CoverFi (Original) | Astra Protocol (Multi-Chain) |
| :--- | :--- | :--- |
| **Primary Chain** | Stellar / Soroban (Rust) | **Solana** (Anchor), **Arbitrum One** (Solidity), **Hyperliquid** (HyperEVM) |
| **Oracle Feed** | Band / Soroban Oracle Adapter | **Pyth Network** (Solana), **Chainlink** (Arbitrum), **Hyperliquid L1 Mark Price** (HyperEVM) |
| **Protection Modes** | Rate Lock & Depeg Shield | **Rate Lock** (Protected Payments) & **Depeg/Floor Shield** (Balance Floor) |
| **Pricing Model** | Tiered Duration (30, 100, 150, 250 bps) + Surcharges | Exact Non-Linear Duration Curve + Volatility/Utilization/Concentration Surcharges |
| **Fee Routing** | 78% LP / 12% Treasury / 7% Safety / 3% Keepers | Identical 7,800 / 1,200 / 700 / 300 bps routing with automated keeper bounties |
| **Landing Page** | Astro / React | **Pure Single-File Self-Contained `index.html`** with seamless looping globe video |
| **Web App** | React / Freighter Wallet | **Interactive Multi-Chain App (`app/index.html`)** supporting Solana, Arbitrum & Hyperliquid |

---

## 🛡️ Core Protocol Features

### 1. Dual Protection Modes
- **Mode A: Rate Lock (Payment Protection)**:
  - Protects payments sent to a recipient for short settlement windows (`15m`, `1h`, `24h`).
  - If the token's market price falls during the window, the recipient receives automatic compensation in stablecoins from the underwriting reserve.
  - Seamlessly integrates with merchant invoices.
- **Mode B: Depeg / Floor Shield (Balance Protection)**:
  - Users select a price floor (e.g. `$0.99` for stablecoins or custom levels for volatile assets) and duration (`1 day`, `7 days`, `30 days`).
  - The principal is securely custodied in `ProtectedBalanceVault`.
  - Upon expiration, permissionless keepers settle the position. If the price dropped below the floor, the user receives the payout and reclaims their principal.

### 2. Underwriting Reserves & LP Yield
- Liquidity providers supply stablecoins (USDC) to `ReserveVault`.
- LPs earn **78% of all protocol risk premiums** (projected APY **11.8%**).
- Includes 7-day withdrawal maturation and pool concentration safety guards.

### 3. Cryptographic ZK Receipts & Username Registry
- **ZK Receipt Registry**: Stores SHA-256 payment hashes and verifies BN254 pairing proofs, preventing duplicate payments and anchoring disputes.
- **Username Registry**: Maps human-readable handles (`@username`) across Solana, Arbitrum, and Hyperliquid.

---

## 📁 Workspace Layout

```
Astra/
├── index.html                   # High-end self-contained landing page (dual video, PJS font, --u unit)
├── app/
│   └── index.html               # Multi-Chain DeFi Application (Rate Lock, Depeg Shield, Invoices, Reserves)
├── contracts/
│   ├── arbitrum/                # Arbitrum One EVM Contracts (Solidity)
│   │   ├── AstraProtectionEngine.sol
│   │   ├── AstraReserveVault.sol
│   │   ├── AstraProtectedBalanceVault.sol
│   │   ├── AstraOracleAdapter.sol
│   │   ├── AstraReceiptRegistry.sol
│   │   ├── AstraUsernameRegistry.sol
│   │   └── interfaces/
│   ├── solana/                  # Solana Anchor Program (Rust)
│   │   ├── Anchor.toml
│   │   ├── Cargo.toml
│   │   └── programs/astra/
│   │       ├── Cargo.toml
│   │       └── src/
│   │           ├── lib.rs
│   │           ├── state.rs
│   │           └── errors.rs
│   └── hyperliquid/             # Hyperliquid / HyperEVM Module
│       ├── contracts/
│       │   └── AstraHyperliquidEngine.sol
│       └── sdk/
│           └── hyperliquid_connector.ts
├── backend/                     # Multi-Chain Backend, Oracle & Settlement Keeper
│   ├── package.json
│   ├── server.js                # Express REST API (Quotes, Invoices, Positions, Usernames, Receipts)
│   ├── config.js
│   └── services/
│       ├── oracle_service.js    # Oracle aggregation (Pyth, Chainlink, Hyperliquid)
│       ├── settlement_keeper.js # Automated settlement bot
│       └── receipt_service.js   # Cryptographic payment receipts
├── coverfi/                     # Cloned upstream CoverFi reference repositories
│   ├── coverfi-contracts/
│   ├── CoverFi-backend/
│   ├── CoverFI-logic-pages/
│   ├── Coverfi-landing/
│   ├── coverfi-docs/
│   └── coverfi-research/
└── README.md
```

---

## 🚀 How to Run

### 1. View Landing Page & Application
- Open [index.html](file:///c:/Users/varda/Documents/CryptoTradeFair/Astra/index.html) in your browser.
- Open [app/index.html](file:///c:/Users/varda/Documents/CryptoTradeFair/Astra/app/index.html) for the multi-chain DeFi dashboard.

### 2. Run the Multi-Chain Backend & Keeper Server
```bash
cd backend
npm install
npm run start
```
- REST API is active at `http://localhost:4000`.
- The automated settlement keeper will automatically run and poll for expired positions.

### 3. Solana Anchor Program
```bash
cd contracts/solana
cargo build-sbf
anchor test
```

### 4. Arbitrum Solidity Contracts
```bash
cd contracts/arbitrum
# Build with Foundry (forge build) or Hardhat (npx hardhat compile)
```
