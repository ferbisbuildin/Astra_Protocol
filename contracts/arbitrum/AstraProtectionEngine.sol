// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IAstraContracts.sol";

/**
 * @title AstraProtectionEngine
 * @notice Complete loss-protection engine for Astra on Arbitrum.
 * Provides autonomous Rate Lock, Depeg/Floor Shield,
 * tiered non-linear pricing, concentration/utilization surcharges, and partner fee routing.
 */
contract AstraProtectionEngine {
    uint256 public constant BPS = 10000;
    uint256 public constant PRICE_SCALE = 1e8; // 8 decimal places: 1.00 = 100_000_000
    uint256 public constant MIN_NOTIONAL = 1e7; // 0.10 units
    uint256 public constant MIN_RISK_PREMIUM = 1e6; // 0.01 units
    uint256 public constant AUTOMATION_FEE = 5e5; // 0.005 units
    uint256 public constant SETTLEMENT_KEEPER_REWARD = 1e5; // 0.001 units
    uint256 public constant SAFETY_MARGIN_BPS = 20; // 0.20%
    uint256 public constant MAX_PREMIUM_BPS = 1000; // 10.00%
    uint256 public constant MAX_UTILIZATION_BPS = 9000; // 90.00%
    uint256 public constant MAX_CONCENTRATION_BPS = 7500; // 75.00%
    uint256 public constant EXPIRY_OBSERVATION_MAX_AGE = 600; // 10 minutes
    uint256 public constant ONE_DAY = 86400;
    uint256 public constant MAX_DURATION = 30 * ONE_DAY;

    enum ProtectionMode {
        RateLock,    // Protected payment to recipient
        DepegShield  // Balance loss protection
    }

    enum PositionStatus {
        Active,
        AwaitingOracle,
        SettledNoPayout,
        Claimable,
        Claimed,
        PrincipalWithdrawn
    }

    struct ProtectionQuote {
        uint256 entryPrice;
        uint256 notional;
        uint256 maximumPayout;
        uint256 basePremium;
        uint256 volatilitySurcharge;
        uint256 utilizationSurcharge;
        uint256 concentrationSurcharge;
        uint256 safetyMargin;
        uint256 riskPremium;
        uint256 protocolCommission;
        uint256 automationFee;
        uint256 totalDue;
        uint256 utilizationBps;
        uint256 concentrationBps;
        uint256 volatilityBps;
    }

    struct Position {
        uint256 id;
        address owner;
        address recipient; // Non-zero for RateLock
        address partner;   // Approved referral/integrator partner
        bytes32 invoiceHash; // Optional invoice reference
        address protectedAsset;
        address payoutAsset;
        uint256 protectedAmount;
        uint256 notional;
        uint256 maximumPayout;
        uint256 riskPremium;
        uint256 automationFee;
        uint256 entryPrice;
        uint256 floorPrice; // For DepegShield
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
    address public pendingAdmin;
    address public protectedVault;
    address public reserveVault;
    address public oracleAdapter;
    address public defaultPayoutAsset;
    uint256 public maxPayoutBps = 9000; // 90% default coverage
    bool public paused;
    uint256 public nextPositionId = 1;

    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private userPositions;

    event PositionCreated(
        uint256 indexed positionId,
        address indexed owner,
        address indexed recipient,
        ProtectionMode mode,
        address protectedAsset,
        uint256 protectedAmount,
        uint256 maximumPayout,
        uint256 totalDue,
        uint256 expiryTime
    );
    event PositionSettled(
        uint256 indexed positionId,
        uint256 settlementPrice,
        uint256 payout,
        address indexed keeper,
        bool keeperRewarded
    );
    event PayoutClaimed(uint256 indexed positionId, address indexed claimant, uint256 amount);
    event PrincipalWithdrawn(uint256 indexed positionId, address indexed owner, uint256 amount);
    event AwaitingOracle(uint256 indexed positionId, uint256 expiryTime);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Engine paused");
        _;
    }

    constructor(
        address _protectedVault,
        address _reserveVault,
        address _oracleAdapter,
        address _payoutAsset
    ) {
        admin = msg.sender;
        protectedVault = _protectedVault;
        reserveVault = _reserveVault;
        oracleAdapter = _oracleAdapter;
        defaultPayoutAsset = _payoutAsset;
    }

    // --- Pricing Engine Core (Astra Dynamic Model) ---

    function getBaseBps(uint256 duration) public pure returns (uint256) {
        require(duration > 0 && duration <= MAX_DURATION, "Invalid duration");
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

    function getVolatilitySurchargeBps(uint256 volBps) public pure returns (uint256) {
        if (volBps < 200) return 0;
        if (volBps < 500) return 25;
        if (volBps < 1000) return 75;
        return 150;
    }

    function getUtilizationSurchargeBps(uint256 utilBps) public pure returns (uint256) {
        require(utilBps < MAX_UTILIZATION_BPS, "Unsafe utilization");
        if (utilBps < 5000) return 0;
        if (utilBps < 7500) return 25;
        return 100;
    }

    function getConcentrationSurchargeBps(uint256 concBps) public pure returns (uint256) {
        require(concBps <= MAX_CONCENTRATION_BPS, "Concentration limit exceeded");
        if (concBps < 4000) return 0;
        if (concBps < 6000) return 25;
        return 75;
    }

    function quotePosition(
        address protectedAsset,
        uint256 protectedAmount,
        uint256 durationSeconds
    ) public view returns (ProtectionQuote memory) {
        require(protectedAmount > 0, "Invalid amount");

        IAstraOracleAdapter.PriceObservation memory obs = IAstraOracleAdapter(oracleAdapter).getLatestPrice(protectedAsset);
        require(obs.price > 0 && obs.isFresh, "Stale oracle");

        uint256 notional = (protectedAmount * obs.price) / PRICE_SCALE;
        require(notional >= MIN_NOTIONAL, "Notional too small");

        uint256 maximumPayout = (notional * maxPayoutBps) / BPS;

        // Reserve projected utilization & concentration checks
        uint256 availCap = IAstraReserveVault(reserveVault).availableCapacity();
        uint256 utilBps = availCap > 0 ? (maximumPayout * BPS) / (availCap + maximumPayout) : 5000;
        uint256 concBps = 3000; // Baseline concentration
        uint256 volBps = 350;   // Baseline 30-day volatility

        uint256 baseRate = getBaseBps(durationSeconds);
        uint256 basePremium = (notional * baseRate) / BPS;
        uint256 volSurcharge = (notional * getVolatilitySurchargeBps(volBps)) / BPS;
        uint256 utilSurcharge = (notional * getUtilizationSurchargeBps(utilBps)) / BPS;
        uint256 concSurcharge = (notional * getConcentrationSurchargeBps(concBps)) / BPS;
        uint256 safetyMargin = (notional * SAFETY_MARGIN_BPS) / BPS;

        uint256 rawPremium = basePremium + volSurcharge + utilSurcharge + concSurcharge + safetyMargin;
        uint256 cap = (notional * MAX_PREMIUM_BPS) / BPS;

        uint256 riskPremium = rawPremium;
        if (riskPremium < MIN_RISK_PREMIUM) riskPremium = MIN_RISK_PREMIUM;
        if (riskPremium > cap) riskPremium = cap;

        uint256 totalDue = riskPremium + AUTOMATION_FEE;
        uint256 protocolCommission = (riskPremium * 1200) / BPS; // 12% protocol share

        return ProtectionQuote({
            entryPrice: obs.price,
            notional: notional,
            maximumPayout: maximumPayout,
            basePremium: basePremium,
            volatilitySurcharge: volSurcharge,
            utilizationSurcharge: utilSurcharge,
            concentrationSurcharge: concSurcharge,
            safetyMargin: safetyMargin,
            riskPremium: riskPremium,
            protocolCommission: protocolCommission,
            automationFee: AUTOMATION_FEE,
            totalDue: totalDue,
            utilizationBps: utilBps,
            concentrationBps: concBps,
            volatilityBps: volBps
        });
    }

    // --- Position Creation ---

    function createPosition(
        ProtectionMode mode,
        address protectedAsset,
        uint256 protectedAmount,
        uint256 durationSeconds,
        address recipient,
        address partner,
        bytes32 invoiceHash,
        uint256 floorPrice
    ) external whenNotPaused returns (uint256) {
        ProtectionQuote memory quote = quotePosition(protectedAsset, protectedAmount, durationSeconds);

        uint256 positionId = nextPositionId++;
        uint256 startTime = block.timestamp;
        uint256 expiryTime = startTime + durationSeconds;

        if (mode == ProtectionMode.RateLock) {
            require(recipient != address(0), "Recipient required for RateLock");
        }

        // 1. Principal Custody in ProtectedBalanceVault
        IAstraProtectedBalanceVault(protectedVault).depositFor(msg.sender, protectedAsset, protectedAmount, positionId);

        // 2. Lock payout capacity in ReserveVault
        IAstraReserveVault(reserveVault).lockPayoutCapacity(positionId, quote.maximumPayout);

        // 3. Collect premium & automation fee
        IAstraReserveVault(reserveVault).collectPremiumFrom(msg.sender, positionId, quote.riskPremium, quote.automationFee);

        // 4. Save position state
        positions[positionId] = Position({
            id: positionId,
            owner: msg.sender,
            recipient: recipient,
            partner: partner,
            invoiceHash: invoiceHash,
            protectedAsset: protectedAsset,
            payoutAsset: defaultPayoutAsset,
            protectedAmount: protectedAmount,
            notional: quote.notional,
            maximumPayout: quote.maximumPayout,
            riskPremium: quote.riskPremium,
            automationFee: quote.automationFee,
            entryPrice: quote.entryPrice,
            floorPrice: floorPrice > 0 ? floorPrice : quote.entryPrice,
            settlementPrice: 0,
            startTime: startTime,
            expiryTime: expiryTime,
            mode: mode,
            status: PositionStatus.Active,
            claimablePayout: 0,
            payoutClaimed: false,
            principalWithdrawn: false
        });

        userPositions[msg.sender].push(positionId);
        if (recipient != address(0) && recipient != msg.sender) {
            userPositions[recipient].push(positionId);
        }

        emit PositionCreated(
            positionId,
            msg.sender,
            recipient,
            mode,
            protectedAsset,
            protectedAmount,
            quote.maximumPayout,
            quote.totalDue,
            expiryTime
        );

        return positionId;
    }

    // --- Settlement Flow ---

    function settlePosition(uint256 positionId) external returns (
        uint256 settlementPrice,
        uint256 payout,
        PositionStatus status,
        bool keeperRewarded
    ) {
        Position storage pos = positions[positionId];
        require(
            pos.status == PositionStatus.Active || pos.status == PositionStatus.AwaitingOracle,
            "Invalid status"
        );
        require(block.timestamp >= pos.expiryTime, "Not expired");

        IAstraOracleAdapter.PriceObservation memory obs;
        try IAstraOracleAdapter(oracleAdapter).getPriceAtOrBefore(
            pos.protectedAsset,
            pos.expiryTime,
            EXPIRY_OBSERVATION_MAX_AGE
        ) returns (IAstraOracleAdapter.PriceObservation memory o) {
            obs = o;
        } catch {
            pos.status = PositionStatus.AwaitingOracle;
            emit AwaitingOracle(positionId, pos.expiryTime);
            return (0, 0, PositionStatus.AwaitingOracle, false);
        }

        require(obs.price > 0, "Invalid price");
        settlementPrice = obs.price;
        pos.settlementPrice = settlementPrice;

        uint256 referencePrice = pos.mode == ProtectionMode.DepegShield ? pos.floorPrice : pos.entryPrice;

        if (settlementPrice < referencePrice) {
            uint256 loss = referencePrice - settlementPrice;
            payout = (pos.protectedAmount * loss) / PRICE_SCALE;
            if (payout > pos.maximumPayout) {
                payout = pos.maximumPayout;
            }
        } else {
            payout = 0;
        }

        // Determine destination of payout: recipient for RateLock, owner for DepegShield
        address claimant = pos.mode == ProtectionMode.RateLock ? pos.recipient : pos.owner;
        IAstraReserveVault(reserveVault).settlePosition(address(this), claimant, positionId, payout);

        pos.claimablePayout = payout;
        pos.status = payout > 0 ? PositionStatus.Claimable : PositionStatus.SettledNoPayout;

        // Reward the keeper who executed settlement
        keeperRewarded = IAstraReserveVault(reserveVault).payKeeper(
            address(this),
            pos.payoutAsset,
            msg.sender,
            bytes32("settlement"),
            positionId,
            SETTLEMENT_KEEPER_REWARD
        );

        emit PositionSettled(positionId, settlementPrice, payout, msg.sender, keeperRewarded);
        return (settlementPrice, payout, pos.status, keeperRewarded);
    }

    // --- Claims and Withdrawals ---

    function claimPayout(uint256 positionId) external returns (uint256) {
        Position storage pos = positions[positionId];
        address claimant = pos.mode == ProtectionMode.RateLock ? pos.recipient : pos.owner;
        require(msg.sender == claimant, "Not authorized claimant");
        require(pos.status == PositionStatus.Claimable && pos.claimablePayout > 0, "Nothing to claim");

        uint256 amount = IAstraReserveVault(reserveVault).claimPayout(address(this), claimant, positionId);
        pos.payoutClaimed = true;
        pos.status = pos.principalWithdrawn ? PositionStatus.PrincipalWithdrawn : PositionStatus.Claimed;

        emit PayoutClaimed(positionId, claimant, amount);
        return amount;
    }

    function withdrawPrincipal(uint256 positionId) external returns (uint256) {
        Position storage pos = positions[positionId];
        require(msg.sender == pos.owner, "Not owner");
        require(!pos.principalWithdrawn, "Already withdrawn");
        require(
            pos.status == PositionStatus.SettledNoPayout ||
            pos.status == PositionStatus.Claimable ||
            pos.status == PositionStatus.Claimed,
            "Settlement required first"
        );

        address to = pos.mode == ProtectionMode.RateLock ? pos.recipient : pos.owner;
        IAstraProtectedBalanceVault(protectedVault).withdrawTo(address(this), to, pos.protectedAsset, pos.protectedAmount, positionId);

        pos.principalWithdrawn = true;
        if (pos.status != PositionStatus.Claimable) {
            pos.status = PositionStatus.PrincipalWithdrawn;
        }

        emit PrincipalWithdrawn(positionId, to, pos.protectedAmount);
        return pos.protectedAmount;
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }

    function getPosition(uint256 positionId) external view returns (Position memory) {
        return positions[positionId];
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
    }

    function setOracleAdapter(address _oracle) external onlyAdmin {
        oracleAdapter = _oracle;
    }
}
