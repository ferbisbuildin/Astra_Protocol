// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IAstraContracts.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

/**
 * @title AstraOracleAdapter
 * @notice Multi-source price oracle adapter for Arbitrum.
 * Provides normalized 8-decimal asset prices, historical price point lookups for expiry settlement,
 * and Chainlink / Fallback publisher consensus.
 */
contract AstraOracleAdapter is IAstraOracleAdapter {
    address public admin;
    uint256 public constant PRICE_SCALE = 1e8; // 8 decimal places: 1.00 = 100_000_000

    struct AssetFeedConfig {
        address chainlinkFeed;
        uint8 feedDecimals;
        bool isActive;
        uint256 maxHeartbeat; // e.g., 3600 seconds
    }

    mapping(address => AssetFeedConfig) public feedConfigs;
    mapping(address => PriceObservation[]) private historicalObservations;
    mapping(address => mapping(address => bool)) public fallbackPublishers; // asset -> publisher -> allowed

    event FeedConfigured(address indexed asset, address chainlinkFeed, uint8 feedDecimals, uint256 heartbeat);
    event PriceObservationRecorded(address indexed asset, uint256 price, uint256 timestamp);
    event FallbackPublisherSet(address indexed asset, address indexed publisher, bool allowed);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AstraOracleAdapter: Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setFeedConfig(
        address asset,
        address chainlinkFeed,
        uint8 feedDecimals,
        uint256 heartbeat
    ) external onlyAdmin {
        feedConfigs[asset] = AssetFeedConfig({
            chainlinkFeed: chainlinkFeed,
            feedDecimals: feedDecimals,
            isActive: true,
            maxHeartbeat: heartbeat
        });
        emit FeedConfigured(asset, chainlinkFeed, feedDecimals, heartbeat);
    }

    function setFallbackPublisher(address asset, address publisher, bool allowed) external onlyAdmin {
        fallbackPublishers[asset][publisher] = allowed;
        emit FallbackPublisherSet(asset, publisher, allowed);
    }

    function recordObservation(address asset, uint256 price) public {
        require(
            msg.sender == admin || fallbackPublishers[asset][msg.sender],
            "AstraOracleAdapter: Unauthorized publisher"
        );
        require(price > 0, "AstraOracleAdapter: Invalid price");

        historicalObservations[asset].push(PriceObservation({
            price: price,
            timestamp: block.timestamp,
            isFresh: true
        }));

        emit PriceObservationRecorded(asset, price, block.timestamp);
    }

    function setManualPrice(address asset, uint256 price) external override {
        recordObservation(asset, price);
    }

    function getLatestPrice(address asset) public view override returns (PriceObservation memory) {
        AssetFeedConfig memory config = feedConfigs[asset];
        if (config.isActive && config.chainlinkFeed != address(0)) {
            try AggregatorV3Interface(config.chainlinkFeed).latestRoundData() returns (
                uint80 /* roundId */,
                int256 answer,
                uint256 /* startedAt */,
                uint256 updatedAt,
                uint80 /* answeredInRound */
            ) {
                if (answer > 0 && block.timestamp - updatedAt <= config.maxHeartbeat) {
                    uint256 scaledPrice;
                    if (config.feedDecimals == 8) {
                        scaledPrice = uint256(answer);
                    } else if (config.feedDecimals < 8) {
                        scaledPrice = uint256(answer) * (10 ** (8 - config.feedDecimals));
                    } else {
                        scaledPrice = uint256(answer) / (10 ** (config.feedDecimals - 8));
                    }
                    return PriceObservation({
                        price: scaledPrice,
                        timestamp: updatedAt,
                        isFresh: true
                    });
                }
            } catch {}
        }

        // Fallback to recorded historical observations
        PriceObservation[] storage history = historicalObservations[asset];
        require(history.length > 0, "AstraOracleAdapter: No price available");
        PriceObservation memory latest = history[history.length - 1];
        bool fresh = (block.timestamp - latest.timestamp <= 86400); // 24hr freshness fallback
        return PriceObservation({
            price: latest.price,
            timestamp: latest.timestamp,
            isFresh: fresh
        });
    }

    function getPriceAtOrBefore(
        address asset,
        uint256 targetTimestamp,
        uint256 maxAge
    ) external view override returns (PriceObservation memory) {
        PriceObservation[] storage history = historicalObservations[asset];
        for (int256 i = int256(history.length) - 1; i >= 0; i--) {
            PriceObservation memory obs = history[uint256(i)];
            if (obs.timestamp <= targetTimestamp) {
                if (targetTimestamp - obs.timestamp <= maxAge) {
                    return obs;
                }
                break;
            }
        }

        // If target timestamp is current/recent, check live feed
        PriceObservation memory latest = getLatestPrice(asset);
        if (latest.timestamp <= targetTimestamp && (targetTimestamp - latest.timestamp <= maxAge)) {
            return latest;
        }

        revert("AstraOracleAdapter: No observation within maxAge");
    }
}
