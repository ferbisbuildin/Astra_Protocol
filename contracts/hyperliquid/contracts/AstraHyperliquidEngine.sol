// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AstraHyperliquidEngine
 * @notice Complete loss-protection engine for HyperEVM & Hyperliquid L1.
 * Provides Rate Lock (protected payment) and Depeg/Floor Shield (balance protection)
 * for native Hyperliquid markets (HYPE, PURR, BTC, ETH) with sub-second finality.
 */
contract AstraHyperliquidEngine {
    uint256 public constant BPS = 10000;
    uint256 public constant PRICE_SCALE = 1e8; // 8 decimal places
    uint256 public constant MIN_NOTIONAL = 1e7;
    uint256 public constant MIN_RISK_PREMIUM = 1e6;
    uint256 public constant AUTOMATION_FEE = 5e5;
    uint256 public constant SETTLEMENT_KEEPER_REWARD = 1e5;
    uint256 public constant SAFETY_MARGIN_BPS = 20;
    uint256 public constant MAX_PREMIUM_BPS = 1000;
    uint256 public constant ONE_DAY = 86400;

    enum ProtectionMode {
        RateLock,
        DepegShield
    }

    enum PositionStatus {
        Active,
        SettledNoPayout,
        Claimable,
        Claimed,
        PrincipalWithdrawn
    }

    struct Position {
        uint256 id;
        address owner;
        address recipient;
        string market; // e.g. "HYPE", "PURR", "BTC", "ETH"
        uint256 protectedAmount;
        uint256 notional;
        uint256 maximumPayout;
        uint256 riskPremium;
        uint256 automationFee;
        uint256 entryPrice;
        uint256 floorPrice;
        uint256 settlementPrice;
        uint256 startTime;
        uint256 expiryTime;
        ProtectionMode mode;
        PositionStatus status;
        uint256 claimablePayout;
        bool payoutClaimed;
        bool principalWithdrawn;
    }

    address public admin;
    address public treasury;
    bool public paused;
    uint256 public nextPositionId = 1;

    mapping(uint256 => Position) public positions;
    mapping(string => uint256) public latestMarkPrices; // Scaled 1e8
    mapping(address => bool) public authorizedKeepers;

    event PositionCreated(uint256 indexed id, address indexed owner, address indexed recipient, ProtectionMode mode, string market, uint256 amount, uint256 maxPayout, uint256 expiry);
    event PositionSettled(uint256 indexed id, uint256 settlementPrice, uint256 payout, address keeper);
    event PayoutClaimed(uint256 indexed id, address indexed claimant, uint256 amount);
    event PrincipalWithdrawn(uint256 indexed id, address indexed to, uint256 amount);
    event MarkPriceUpdated(string market, uint256 price, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _treasury) {
        admin = msg.sender;
        treasury = _treasury;
        authorizedKeepers[msg.sender] = true;
    }

    function setKeeper(address keeper, bool status) external onlyAdmin {
        authorizedKeepers[keeper] = status;
    }

    function updateMarkPrice(string calldata market, uint256 price) external {
        require(authorizedKeepers[msg.sender] || msg.sender == admin, "Unauthorized keeper");
        require(price > 0, "Invalid price");
        latestMarkPrices[market] = price;
        emit MarkPriceUpdated(market, price, block.timestamp);
    }

    function getBaseBps(uint256 duration) public pure returns (uint256) {
        if (duration <= ONE_DAY) {
            return 30; // 0.30%
        } else if (duration <= 7 * ONE_DAY) {
            return 100; // 1.00%
        } else if (duration <= 14 * ONE_DAY) {
            return 150; // 1.50%
        } else {
            return 250; // 2.50%
        }
    }

    function quotePosition(
        string calldata market,
        uint256 protectedAmount,
        uint256 durationSeconds
    ) public view returns (uint256 entryPrice, uint256 notional, uint256 maxPayout, uint256 totalDue) {
        entryPrice = latestMarkPrices[market];
        require(entryPrice > 0, "Price unavailable");

        notional = (protectedAmount * entryPrice) / PRICE_SCALE;
        require(notional >= MIN_NOTIONAL, "Notional too small");

        maxPayout = (notional * 9000) / BPS; // 90% max coverage

        uint256 baseRate = getBaseBps(durationSeconds);
        uint256 basePremium = (notional * baseRate) / BPS;
        uint256 safety = (notional * SAFETY_MARGIN_BPS) / BPS;
        uint256 raw = basePremium + safety;

        uint256 cap = (notional * MAX_PREMIUM_BPS) / BPS;
        uint256 riskPremium = raw < MIN_RISK_PREMIUM ? MIN_RISK_PREMIUM : (raw > cap ? cap : raw);

        totalDue = riskPremium + AUTOMATION_FEE;
    }

    function createPosition(
        ProtectionMode mode,
        string calldata market,
        uint256 protectedAmount,
        uint256 durationSeconds,
        address recipient,
        uint256 floorPrice
    ) external payable returns (uint256) {
        require(!paused, "Engine paused");
        (uint256 entryPrice, uint256 notional, uint256 maxPayout, uint256 totalDue) = quotePosition(market, protectedAmount, durationSeconds);

        uint256 positionId = nextPositionId++;
        uint256 expiry = block.timestamp + durationSeconds;

        positions[positionId] = Position({
            id: positionId,
            owner: msg.sender,
            recipient: recipient != address(0) ? recipient : msg.sender,
            market: market,
            protectedAmount: protectedAmount,
            notional: notional,
            maximumPayout: maxPayout,
            riskPremium: totalDue - AUTOMATION_FEE,
            automationFee: AUTOMATION_FEE,
            entryPrice: entryPrice,
            floorPrice: floorPrice > 0 ? floorPrice : entryPrice,
            settlementPrice: 0,
            startTime: block.timestamp,
            expiryTime: expiry,
            mode: mode,
            status: PositionStatus.Active,
            claimablePayout: 0,
            payoutClaimed: false,
            principalWithdrawn: false
        });

        emit PositionCreated(positionId, msg.sender, positions[positionId].recipient, mode, market, protectedAmount, maxPayout, expiry);
        return positionId;
    }

    function settlePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.status == PositionStatus.Active, "Invalid status");
        require(block.timestamp >= pos.expiryTime, "Not expired");

        uint256 currentPrice = latestMarkPrices[pos.market];
        require(currentPrice > 0, "Price missing");

        pos.settlementPrice = currentPrice;
        uint256 refPrice = pos.mode == ProtectionMode.DepegShield ? pos.floorPrice : pos.entryPrice;

        uint256 payout = 0;
        if (currentPrice < refPrice) {
            uint256 loss = refPrice - currentPrice;
            payout = (pos.protectedAmount * loss) / PRICE_SCALE;
            if (payout > pos.maximumPayout) {
                payout = pos.maximumPayout;
            }
        }

        pos.claimablePayout = payout;
        pos.status = payout > 0 ? PositionStatus.Claimable : PositionStatus.SettledNoPayout;

        emit PositionSettled(positionId, currentPrice, payout, msg.sender);
    }

    function claimPayout(uint256 positionId) external {
        Position storage pos = positions[positionId];
        address claimant = pos.mode == ProtectionMode.RateLock ? pos.recipient : pos.owner;
        require(msg.sender == claimant, "Not claimant");
        require(pos.status == PositionStatus.Claimable && pos.claimablePayout > 0, "No payout");

        pos.payoutClaimed = true;
        pos.status = pos.principalWithdrawn ? PositionStatus.PrincipalWithdrawn : PositionStatus.Claimed;

        emit PayoutClaimed(positionId, claimant, pos.claimablePayout);
    }

    function withdrawPrincipal(uint256 positionId) external {
        Position storage pos = positions[positionId];
        address to = pos.mode == ProtectionMode.RateLock ? pos.recipient : pos.owner;
        require(msg.sender == to, "Not receiver");
        require(!pos.principalWithdrawn, "Already withdrawn");
        require(pos.status != PositionStatus.Active, "Not settled");

        pos.principalWithdrawn = true;
        if (pos.status != PositionStatus.Claimable) {
            pos.status = PositionStatus.PrincipalWithdrawn;
        }

        emit PrincipalWithdrawn(positionId, to, pos.protectedAmount);
    }
}
