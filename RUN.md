# Astra Protocol — Execution, Testing & Deployment Guide (RUN.md)

This document provides step-by-step instructions for running, testing, and deploying **Astra Protocol** locally, on testnets, and in production.

---

## 1. Quickstart

### Step 1: Install Dependencies
From the repository root:
```bash
npm install
```

### Step 2: Configure Environment
Copy the `.env.example` in `backend/` if you want custom RPCs or private keys:
```bash
cp backend/.env.example backend/.env
```
*(On Windows PowerShell)*:
```powershell
Copy-Item backend/.env.example backend/.env
```

> **Note**: Even without a `.env` file, the server runs with built-in public RPCs and fallback endpoints.

### Step 3: Start the Backend & Settlement Keeper
```bash
npm start
```
* The API daemon listens on `http://localhost:4000`.
* The automated multi-chain settlement keeper polls for expired positions every 30 seconds.

### Step 4: Open the Applications
* **Cinematic Landing Page**: [http://localhost:4000/](http://localhost:4000/)
* **Unified Web3 Application**: [http://localhost:4000/app](http://localhost:4000/app)
* **Developer Documentation Portal**: [http://localhost:4000/docs](http://localhost:4000/docs)

---

## 2. Running Test Suites

### Comprehensive Backend Tests (24 Subsystem Tests)
With the backend server running, execute:
```bash
npm test
```
This runs `backend/scripts/test-all-backend.js` validating:
1. Protocol Health & Multi-Chain Endpoints
2. High-Throughput Pyth Douro Labs Candles
3. Dynamic Non-Linear Quoting Engine
4. Multi-Chain Position Lifecycle (`Create` -> `Settle` -> `Claim`)
5. Protected Merchant Invoices & Receipt Verification
6. ZK BN254 Pairing Proofs & Nullifier Checks
7. Universal `@username` Registry
8. Developer Portal & Documentation Routes
9. Double-Claim Anti-Replay Defense
10. Double-Payment Anti-Replay Defense
11. Underwriting LP Reserve Pool & APY Calculations
12. Handle Sanitization & Prototype Pollution Guards

### Official Client SDK Tests
```bash
npm run test:sdk
```
Validates `@astra-protocol/sdk` methods (`getQuote`, `createPosition`, `settlePosition`, `claimPayout`, `createInvoice`, `payInvoice`, `registerUsername`).

### Live Devnet Multi-Chain Connectivity
```bash
npm run test:devnet
```
Tests live RPC connectivity to Solana Devnet, Arbitrum Sepolia, and Hyperliquid Testnet APIs.

---

## 3. Testnet Deployments Reference

| Chain | Network | Contract / Program | Identifier / Address |
| :--- | :--- | :--- | :--- |
| **Arbitrum** | Sepolia (421614) | `AstraProtectionEngine` | `0x732E212e3d745a8d6493e9aB065771dDeC0f9342` |
| **Arbitrum** | Sepolia (421614) | `AstraReserveVault` | `0x7FdA9C1d8806495476cAa4871cB6fF663b8F1A04` |
| **Arbitrum** | Sepolia (421614) | `AstraProtectedBalanceVault` | `0xCDF50aE966C65f3f62eE2eD53db83F6CDbab2619` |
| **Arbitrum** | Sepolia (421614) | `AstraOracleAdapter` | `0xB1342904AcB57B803bea11a5B4691Dc8492EC433` |
| **Arbitrum** | Sepolia (421614) | `AstraReceiptRegistry` | `0xF481bf304CA3F8624D6F6B135ABA811283B8494C` |
| **Arbitrum** | Sepolia (421614) | `AstraUsernameRegistry` | `0xB90f861F38B31d726c660AEF12b7c0cb83b15c27` |
| **Solana** | Testnet | Anchor Program ID | `ABMTT5W2UNn5BZG8285V9Uzn3h5c1G3rG7YeCPMn7714` |
| **Solana** | Testnet | Protocol Authority | `GBoQWwa5SWsAFcRh1NQhWQ3Avmvwgsms6MmF2jg3Verk` |
| **Hyperliquid** | Testnet | Clearing Engine | `0x732E212e3d745a8d6493e9aB065771dDeC0f9342` |

---

## 4. Re-Deploying Contracts or Generating Keys

### Generate Fresh Deployer Keys
To generate a new EVM deployer wallet and Solana keypair:
```bash
npm run setup:keys
```

### Run Testnet Deployment Script
To re-anchor contracts and refresh `backend/config.js`:
```bash
npm run deploy:testnet
```

---

## 5. Pushing to GitHub

The repository is configured with a strict `.gitignore` to prevent committing sensitive keys or build artifacts.

To push changes to GitHub:
```bash
git add .
git commit -m "docs & cleanup: refine repository structure, remove obsolete files, update comprehensive README"
git push origin main
```
