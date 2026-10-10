// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAstraOracleAdapter {
    struct PriceObservation {
        uint256 price;       // 8 decimals scale (1.00 = 100_000_000)
        uint256 timestamp;
        bool isFresh;
    }

    function getLatestPrice(address asset) external view returns (PriceObservation memory);
    function getPriceAtOrBefore(address asset, uint256 targetTimestamp, uint256 maxAge) external view returns (PriceObservation memory);
    function setManualPrice(address asset, uint256 price) external;
}

interface IAstraReserveVault {
    function lockPayoutCapacity(uint256 positionId, uint256 maxPayout) external;
    function collectPremiumFrom(
        address payer,
        uint256 positionId,
        uint256 riskPremium,
        uint256 automationFee
    ) external;
    function settlePosition(
        address engine,
        address user,
        uint256 positionId,
        uint256 payout
    ) external;
    function claimPayout(
        address engine,
        address user,
        uint256 positionId
    ) external returns (uint256);
    function payKeeper(
        address engine,
        address token,
        address keeper,
        bytes32 reason,
        uint256 positionId,
        uint256 amount
    ) external returns (bool);
    function availableCapacity() external view returns (uint256);
}

interface IAstraProtectedBalanceVault {
    function depositFor(
        address from,
        address asset,
        uint256 amount,
        uint256 positionId
    ) external;
    function withdrawTo(
        address engine,
        address to,
        address asset,
        uint256 amount,
        uint256 positionId
    ) external;
}
