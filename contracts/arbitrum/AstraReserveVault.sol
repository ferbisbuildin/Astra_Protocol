// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IAstraContracts.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title AstraReserveVault
 * @notice Underwriting reserve pool for Astra loss protection on Arbitrum.
 * Manages provider shares, premium routing, locked capacity, and keeper execution bounties.
 */
contract AstraReserveVault is IAstraReserveVault {
    address public admin;
    address public treasury;
    address public protectionEngine;
    IERC20 public payoutAsset; // e.g., USDC

    // Routing parameters (in basis points, 10,000 = 100%)
    uint256 public constant TOTAL_BPS = 10000;
    uint256 public underwritingBps = 7800; // 78%
    uint256 public protocolFeeBps = 1200;   // 12%
    uint256 public safetyBps = 700;        // 7%
    uint256 public automationBps = 300;    // 3%

    uint256 public totalLiquidity;
    uint256 public totalLockedCapacity;
    uint256 public totalShares;
    mapping(address => uint256) public providerShares;

    // Position-specific capacity tracking
    mapping(uint256 => uint256) public positionLockedCapacity;
    mapping(uint256 => uint256) public positionClaimablePayout;

    // Automation gas reserve balance for keepers
    uint256 public automationBalance;
    uint256 public safetyPoolBalance;

    event LiquidityDeposited(address indexed provider, uint256 amount, uint256 sharesMinted);
    event LiquidityWithdrawn(address indexed provider, uint256 amount, uint256 sharesBurned);
    event CapacityLocked(uint256 indexed positionId, uint256 maxPayout);
    event CapacityReleased(uint256 indexed positionId, uint256 releasedAmount, uint256 payoutClaimable);
    event PremiumCollected(uint256 indexed positionId, uint256 riskPremium, uint256 underwritingAmt, uint256 treasuryAmt);
    event PayoutClaimed(uint256 indexed positionId, address indexed user, uint256 amount);
    event KeeperPaid(address indexed keeper, uint256 indexed positionId, uint256 amount, bytes32 reason);
    event TreasuryUpdated(address indexed newTreasury);
    event ProtectionEngineSet(address indexed engine);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AstraReserveVault: Only admin");
        _;
    }

    modifier onlyEngine() {
        require(msg.sender == protectionEngine, "AstraReserveVault: Only engine");
        _;
    }

    constructor(address _payoutAsset, address _treasury) {
        require(_payoutAsset != address(0) && _treasury != address(0), "Invalid parameters");
        admin = msg.sender;
        payoutAsset = IERC20(_payoutAsset);
        treasury = _treasury;
    }

    function setProtectionEngine(address _engine) external onlyAdmin {
        protectionEngine = _engine;
        emit ProtectionEngineSet(_engine);
    }

    function setTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setFeeRouting(
        uint256 _underwritingBps,
        uint256 _protocolFeeBps,
        uint256 _safetyBps,
        uint256 _automationBps
    ) external onlyAdmin {
        require(
            _underwritingBps + _protocolFeeBps + _safetyBps + _automationBps == TOTAL_BPS,
            "Must sum to 10000 bps"
        );
        underwritingBps = _underwritingBps;
        protocolFeeBps = _protocolFeeBps;
        safetyBps = _safetyBps;
        automationBps = _automationBps;
    }

    // --- LP Provider Functions ---

    function deposit(uint256 amount) external returns (uint256 shares) {
        require(amount > 0, "Zero amount");
        require(payoutAsset.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        if (totalShares == 0 || totalLiquidity == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / totalLiquidity;
        }

        totalShares += shares;
        providerShares[msg.sender] += shares;
        totalLiquidity += amount;

        emit LiquidityDeposited(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 amount) {
        require(shares > 0 && providerShares[msg.sender] >= shares, "Insufficient shares");
        amount = (shares * totalLiquidity) / totalShares;
        
        uint256 freeLiquidity = availableCapacity();
        require(amount <= freeLiquidity, "Capacity currently locked for protection");

        providerShares[msg.sender] -= shares;
        totalShares -= shares;
        totalLiquidity -= amount;

        require(payoutAsset.transfer(msg.sender, amount), "Transfer failed");
        emit LiquidityWithdrawn(msg.sender, amount, shares);
    }

    function availableCapacity() public view override returns (uint256) {
        if (totalLiquidity > totalLockedCapacity) {
            return totalLiquidity - totalLockedCapacity;
        }
        return 0;
    }

    // --- Protection Engine Protocol Operations ---

    function lockPayoutCapacity(uint256 positionId, uint256 maxPayout) external override onlyEngine {
        require(maxPayout <= availableCapacity(), "AstraReserveVault: Insufficient reserve capacity");
        positionLockedCapacity[positionId] = maxPayout;
        totalLockedCapacity += maxPayout;

        emit CapacityLocked(positionId, maxPayout);
    }

    function collectPremiumFrom(
        address payer,
        uint256 positionId,
        uint256 riskPremium,
        uint256 automationFee
    ) external override onlyEngine {
        uint256 totalDue = riskPremium + automationFee;
        require(payoutAsset.transferFrom(payer, address(this), totalDue), "Premium transfer failed");

        uint256 underwritingPortion = (riskPremium * underwritingBps) / TOTAL_BPS;
        uint256 protocolTreasuryPortion = (riskPremium * protocolFeeBps) / TOTAL_BPS;
        uint256 safetyPortion = (riskPremium * safetyBps) / TOTAL_BPS;
        uint256 autoPortion = (riskPremium * automationBps) / TOTAL_BPS + automationFee;

        // Route to underwriting yield
        totalLiquidity += underwritingPortion;
        // Route to protocol treasury
        if (protocolTreasuryPortion > 0) {
            payoutAsset.transfer(treasury, protocolTreasuryPortion);
        }
        // Retain safety & automation balance
        safetyPoolBalance += safetyPortion;
        automationBalance += autoPortion;

        emit PremiumCollected(positionId, riskPremium, underwritingPortion, protocolTreasuryPortion);
    }

    function settlePosition(
        address /* engine */,
        address /* user */,
        uint256 positionId,
        uint256 payout
    ) external override onlyEngine {
        uint256 locked = positionLockedCapacity[positionId];
        require(locked > 0, "No capacity locked");

        if (payout > locked) {
            payout = locked;
        }

        totalLockedCapacity -= locked;
        positionLockedCapacity[positionId] = 0;

        if (payout > 0) {
            positionClaimablePayout[positionId] = payout;
            totalLiquidity -= payout; // Deduction from underwriting capital
        }

        emit CapacityReleased(positionId, locked - payout, payout);
    }

    function claimPayout(
        address /* engine */,
        address user,
        uint256 positionId
    ) external override onlyEngine returns (uint256) {
        uint256 payout = positionClaimablePayout[positionId];
        require(payout > 0, "No payout claimable");

        positionClaimablePayout[positionId] = 0;
        require(payoutAsset.transfer(user, payout), "Payout transfer failed");

        emit PayoutClaimed(positionId, user, payout);
        return payout;
    }

    function payKeeper(
        address /* engine */,
        address /* token */,
        address keeper,
        bytes32 reason,
        uint256 positionId,
        uint256 amount
    ) external override onlyEngine returns (bool) {
        if (amount <= automationBalance && keeper != address(0)) {
            automationBalance -= amount;
            payoutAsset.transfer(keeper, amount);
            emit KeeperPaid(keeper, positionId, amount, reason);
            return true;
        }
        return false;
    }
}
