// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IAstraContracts.sol";

interface IERC20Vault {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title AstraProtectedBalanceVault
 * @notice Segregated custodian vault for protected principal balances on Arbitrum.
 * Principal remains safe in isolation and can only be withdrawn back to the owner after settlement.
 */
contract AstraProtectedBalanceVault is IAstraProtectedBalanceVault {
    address public admin;
    address public protectionEngine;

    struct PositionDeposit {
        address asset;
        uint256 amount;
        bool withdrawn;
    }

    mapping(uint256 => PositionDeposit) public deposits;

    event ProtectedPrincipalDeposited(uint256 indexed positionId, address indexed user, address indexed asset, uint256 amount);
    event ProtectedPrincipalWithdrawn(uint256 indexed positionId, address indexed to, address indexed asset, uint256 amount);
    event ProtectionEngineSet(address indexed engine);

    modifier onlyAdmin() {
        require(msg.sender == admin, "AstraProtectedVault: Only admin");
        _;
    }

    modifier onlyEngine() {
        require(msg.sender == protectionEngine, "AstraProtectedVault: Only engine");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function setProtectionEngine(address _engine) external onlyAdmin {
        protectionEngine = _engine;
        emit ProtectionEngineSet(_engine);
    }

    function depositFor(
        address from,
        address asset,
        uint256 amount,
        uint256 positionId
    ) external override onlyEngine {
        require(amount > 0, "Zero amount");
        require(deposits[positionId].amount == 0, "Position deposit already exists");

        deposits[positionId] = PositionDeposit({
            asset: asset,
            amount: amount,
            withdrawn: false
        });

        require(
            IERC20Vault(asset).transferFrom(from, address(this), amount),
            "Principal transfer failed"
        );

        emit ProtectedPrincipalDeposited(positionId, from, asset, amount);
    }

    function withdrawTo(
        address /* engine */,
        address to,
        address asset,
        uint256 amount,
        uint256 positionId
    ) external override onlyEngine {
        PositionDeposit storage dep = deposits[positionId];
        require(!dep.withdrawn, "Already withdrawn");
        require(dep.asset == asset && dep.amount >= amount, "Invalid deposit info");

        dep.withdrawn = true;
        require(IERC20Vault(asset).transfer(to, amount), "Withdrawal failed");

        emit ProtectedPrincipalWithdrawn(positionId, to, asset, amount);
    }
}
