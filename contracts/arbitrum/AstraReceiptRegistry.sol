// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AstraReceiptRegistry
 * @notice Stores cryptographic receipt proof metadata, payment hashes, and disputes.
 * Prevents duplicate payment executions and anchors decentralized proof verification.
 */
contract AstraReceiptRegistry {
    address public admin;

    struct Receipt {
        bytes32 paymentHash;
        address payer;
        address recipient;
        address token;
        uint256 amount;
        uint256 timestamp;
        bytes metadataProof;
        bool disputed;
    }

    mapping(bytes32 => Receipt) public receipts;
    mapping(bytes32 => bool) public usedPaymentHashes;

    event ReceiptRegistered(
        bytes32 indexed paymentHash,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    event ReceiptDisputed(bytes32 indexed paymentHash, address indexed disputer, string reason);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerReceipt(
        bytes32 paymentHash,
        address recipient,
        address token,
        uint256 amount,
        bytes calldata metadataProof
    ) external returns (bool) {
        require(!usedPaymentHashes[paymentHash], "Duplicate payment hash");
        require(paymentHash != bytes32(0), "Invalid hash");

        usedPaymentHashes[paymentHash] = true;
        receipts[paymentHash] = Receipt({
            paymentHash: paymentHash,
            payer: msg.sender,
            recipient: recipient,
            token: token,
            amount: amount,
            timestamp: block.timestamp,
            metadataProof: metadataProof,
            disputed: false
        });

        emit ReceiptRegistered(paymentHash, msg.sender, recipient, amount, block.timestamp);
        return true;
    }

    function disputeReceipt(bytes32 paymentHash, string calldata reason) external {
        Receipt storage receipt = receipts[paymentHash];
        require(receipt.paymentHash != bytes32(0), "Receipt does not exist");
        require(msg.sender == receipt.payer || msg.sender == receipt.recipient || msg.sender == admin, "Unauthorized");

        receipt.disputed = true;
        emit ReceiptDisputed(paymentHash, msg.sender, reason);
    }

    function getReceipt(bytes32 paymentHash) external view returns (Receipt memory) {
        return receipts[paymentHash];
    }
}
