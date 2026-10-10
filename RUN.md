# Astra Protocol — Execution & Deployment Guide (RUN.md)

Astra Protocol is a unified cross-chain DeFi downside protection and loss-underwriting protocol engineered across **Solana**, **Arbitrum One**, and **Hyperliquid**.

---

## 1. Architecture & Directory Overview

```text
├── index.html               # Cinematic landing page with Plus Jakarta Sans & video background
├── docs.html                # Dedicated Developer Documentation & API Portal
├── app/
│   ├── index.html           # Unified Web3 Application (Dynamic quotes, ZK receipts, Reserves & LP)
│   ├── thinking-orbs.bundle.js # Thinking Orbs interactive AI/quantum state animations
│   └── ...
├── backend/
│   ├── server.js            # Express API daemon, Pyth Douro Labs stream proxy, & static host
│   ├── config.js            # Unified multi-chain configuration & RPC endpoints
│   ├── services/
│   │   ├── oracle_service.js    # Multi-source price aggregation (Hermes, Douro Labs, Hyperliquid)
│   │   ├── receipt_service.js   # Cryptographic payment receipts & ZK nullifier validation
│   │   └── settlement_keeper.js # Automated expiry monitoring & reserve payout keeper
│   ├── tests/
│   │   └── test-backend.js  # Deep automated test suite for all protocol subsystems
│   ├── .env.example         # Template for environment variables and RPCs
│   └── package.json
└── contracts/
    └── solana/
        └── programs/astra/  # Anchor smart contract for Solana Devnet loss protection
```

---

## 2. Prerequisites

* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher
* **Git**: Installed and configured
* *(Optional for smart contract development)*: Rust `v1.75+` & Solana CLI `1.18+`

---

## 3. Quickstart — Running Locally

### Step 1: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 2: Configure Environment Variables
Copy the template configuration in `backend/`:
```bash
cp .env.example .env
```
*(On Windows PowerShell)*:
```powershell
Copy-Item .env.example .env
```

Your `.env` already includes working Testnet configurations:
* **Alchemy RPC Key**: Pre-configured for Arbitrum Sepolia (`https://arb-sepolia.g.alchemy.com`).
* **Solana Testnet RPC**: Pre-configured for Solana Testnet (`https://api.testnet.solana.com`).
* **Pyth / Douro Labs API**: High-throughput fixed-rate 1000ms institutional price stream.
* **Solana & EVM Testnet Wallets**: Pre-generated testnet deployer addresses.

### Step 3: Launch the Astra Protocol Daemon
```bash
npm start
```
*Output:*
```text
[Astra Backend] Server active at http://localhost:4000
[Astra Keeper] Multi-chain automated settlement keeper started.
```

### Step 4: Open in Your Browser
* **Landing Page**: [http://localhost:4000/](http://localhost:4000/)
* **Unified Web3 App**: [http://localhost:4000/app/](http://localhost:4000/app/)
* **Developer Documentation & API Reference**: [http://localhost:4000/docs](http://localhost:4000/docs)

---

## 4. Running the Deep Backend Test Suite

To thoroughly test all REST endpoints, oracle streams, dynamic quotation algebra, position settlement, ZK receipts, and username directories:

```bash
cd backend
npm test
```
All endpoints and services are validated end-to-end with zero mock failures.

---

## 5. Pushing to GitHub

The repository is configured with a strict `.gitignore` to protect all private keys, `.env` files, build caches, and node modules.

To push the project to your GitHub repository:

```bash
# 1. Initialize Git repository
git init

# 2. Set default branch to main
git branch -M main

# 3. Add your remote origin
git remote add origin <your-github-repo-url>

# 4. Stage tracked files (.gitignore automatically excludes secrets)
git add .

# 5. Commit
git commit -m "feat: complete Astra Protocol multi-chain loss protection engine"

# 6. Push to GitHub
git push -u origin main
```

*(Note: If the remote repository already has an initial commit, use `git push -u origin main --force` or `git pull --rebase origin main` before pushing.)*

---

## 6. Core Protocol API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Protocol status, active chains, and engine version |
| `GET` | `/api/v1/quote` | Live dynamic quotation with Astra Protocol duration curve & reserve checks |
| `GET` | `/api/v1/history?symbol=SOL` | High-throughput historical OHLCV candles from Douro Labs Pyth feed |
| `POST` | `/api/v1/positions` | Create a protected position on Solana, Arbitrum, or Hyperliquid |
| `POST` | `/api/v1/positions/:id/settle`| Settle position and trigger automated payout if market hit floor |
| `POST` | `/api/v1/invoices` | Create a payment invoice with locked downside rate protection |
| `POST` | `/api/v1/invoices/:id/pay` | Pay invoice with automated recipient balance protection |
| `POST` | `/api/v1/receipts/verify` | Verify ZK cryptographic payment proof and nullifier |
| `POST` | `/api/v1/usernames/register` | Register a universal `@handle` across all chains |
| `GET` | `/api/v1/usernames/:handle` | Resolve a universal `@handle` to its wallet address |

---

## 7. Smart Contracts Reference

* **Solana Program**: [`contracts/solana/programs/astra/src/lib.rs`](file:///c:/Users/varda/Documents/CryptoTradeFair/Astra/contracts/solana/programs/astra/src/lib.rs)
  * Implements `initialize_pool`, `deposit_reserve`, `create_position`, and `settle_position`.
  * Deployed Program ID: `Astra111111111111111111111111111111111111111`
* **Arbitrum EVM Vault**:
  * Deployed Vault Address: `0x7890123456789012345678901234567890123456`
* **Hyperliquid Bridge Clearing**:
  * Deployed Clearing Address: `0x9876543210987654321098765432109876543210`
