// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title VeloRegistry
 * @notice First-claim-wins username registry. Maps a Velo username to a wallet address.
 *
 * Every claim is on-chain. The frontend uses this to resolve a username
 * (e.g. "stan") to its wallet address before submitting an ERC-20 transfer,
 * so all transfers happen via standard token primitives — no custodial mapping,
 * no off-chain identity service, no trust violation.
 *
 * Rules:
 *   - 3..16 chars, lowercase a-z / 0-9 / underscore. First char must be a-z.
 *   - One username per address (claiming a new one releases the old).
 *   - One address per username (first to claim wins).
 *   - 30-day cooldown between username changes (anti-squat).
 */
contract VeloRegistry {
    uint256 public constant USERNAME_CHANGE_COOLDOWN = 30 days;

    mapping(bytes32 => address) public usernameToAddress;
    mapping(address => bytes32) public addressToUsername;
    mapping(address => uint256) public nextChangeAllowed;

    event UsernameClaimed(address indexed who, bytes32 indexed username, string usernameStr);
    event UsernameReleased(address indexed who, bytes32 indexed username);

    error UsernameInvalid();
    error UsernameTaken();
    error ChangeCooldownActive(uint256 retryAfter);

    function setUsername(string calldata u) external {
        bytes32 packed = _packAndValidate(u);

        bytes32 prior = addressToUsername[msg.sender];
        if (prior != bytes32(0)) {
            if (block.timestamp < nextChangeAllowed[msg.sender]) {
                revert ChangeCooldownActive(nextChangeAllowed[msg.sender]);
            }
            delete usernameToAddress[prior];
            emit UsernameReleased(msg.sender, prior);
        }

        if (usernameToAddress[packed] != address(0)) revert UsernameTaken();
        usernameToAddress[packed] = msg.sender;
        addressToUsername[msg.sender] = packed;
        nextChangeAllowed[msg.sender] = block.timestamp + USERNAME_CHANGE_COOLDOWN;

        emit UsernameClaimed(msg.sender, packed, u);
    }

    function resolve(string calldata u) external view returns (address) {
        return usernameToAddress[_pack(u)];
    }

    function usernameOf(address who) external view returns (string memory) {
        return _unpack(addressToUsername[who]);
    }

    function _packAndValidate(string memory u) internal pure returns (bytes32 packed) {
        bytes memory b = bytes(u);
        if (b.length < 3 || b.length > 16) revert UsernameInvalid();

        bytes1 first = b[0];
        if (!(first >= 0x61 && first <= 0x7a)) revert UsernameInvalid();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok =
                (c >= 0x61 && c <= 0x7a) ||  // a-z
                (c >= 0x30 && c <= 0x39) ||  // 0-9
                (c == 0x5f);                  // _
            if (!ok) revert UsernameInvalid();
        }

        assembly {
            packed := mload(add(b, 32))
        }
    }

    function _pack(string memory u) internal pure returns (bytes32 packed) {
        bytes memory b = bytes(u);
        if (b.length == 0 || b.length > 16) return bytes32(0);
        assembly {
            packed := mload(add(b, 32))
        }
    }

    function _unpack(bytes32 packed) internal pure returns (string memory) {
        if (packed == bytes32(0)) return "";
        uint256 len = 0;
        for (uint256 i = 0; i < 16; i++) {
            if (packed[i] == 0) break;
            len++;
        }
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = packed[i];
        }
        return string(out);
    }
}
