// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AstraUsernameRegistry
 * @notice Maps human-readable usernames to wallet addresses with lease expiries and renewals.
 */
contract AstraUsernameRegistry {
    address public admin;
    uint256 public constant LEASE_DURATION = 365 days;
    uint256 public leaseFee = 0.001 ether; // Lease fee in native ETH

    struct Lease {
        address owner;
        address targetAddress;
        uint256 expiry;
    }

    mapping(string => Lease) public leases;
    mapping(address => string) public primaryUsername;

    event UsernameRegistered(string indexed username, address indexed owner, address indexed target, uint256 expiry);
    event UsernameRenewed(string indexed username, uint256 newExpiry);
    event TargetUpdated(string indexed username, address indexed newTarget);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerUsername(
        string calldata username,
        address targetAddress
    ) external payable {
        require(msg.value >= leaseFee, "Insufficient fee");
        require(bytes(username).length >= 3 && bytes(username).length <= 32, "Invalid username length");

        Lease storage lease = leases[username];
        require(lease.expiry < block.timestamp || lease.owner == msg.sender, "Username currently leased");

        uint256 expiry = block.timestamp + LEASE_DURATION;
        leases[username] = Lease({
            owner: msg.sender,
            targetAddress: targetAddress != address(0) ? targetAddress : msg.sender,
            expiry: expiry
        });

        if (bytes(primaryUsername[msg.sender]).length == 0) {
            primaryUsername[msg.sender] = username;
        }

        emit UsernameRegistered(username, msg.sender, leases[username].targetAddress, expiry);
    }

    function renewUsername(string calldata username) external payable {
        require(msg.value >= leaseFee, "Insufficient fee");
        Lease storage lease = leases[username];
        require(lease.owner == msg.sender, "Not username owner");

        lease.expiry += LEASE_DURATION;
        emit UsernameRenewed(username, lease.expiry);
    }

    function setTargetAddress(string calldata username, address newTarget) external {
        Lease storage lease = leases[username];
        require(lease.owner == msg.sender, "Not username owner");
        require(lease.expiry >= block.timestamp, "Lease expired");

        lease.targetAddress = newTarget;
        emit TargetUpdated(username, newTarget);
    }

    function resolveUsername(string calldata username) external view returns (address target, bool isValid) {
        Lease memory lease = leases[username];
        if (lease.expiry >= block.timestamp) {
            return (lease.targetAddress, true);
        }
        return (address(0), false);
    }

    function withdrawFees(address payable recipient) external onlyAdmin {
        recipient.transfer(address(this).balance);
    }
}
