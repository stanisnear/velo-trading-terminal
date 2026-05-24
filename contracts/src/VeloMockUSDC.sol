// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OFT} from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeloMockUSDC
 * @notice Velo's testnet USDC. ERC-20 with 6 decimals (matches real USDC) plus:
 *           • a public mint() faucet, rate-limited per address
 *           • LayerZero V2 OFT, so balances move atomically across Base/Arb/OP/Eth Sepolias
 *
 * Faucet rules (anti-abuse):
 *   FAUCET_AMOUNT     = 1000 mUSDC per call
 *   FAUCET_COOLDOWN   = 6 hours per address
 *   FAUCET_MAX_BALANCE = 10000 mUSDC (don't top up if already over this)
 *
 * Owner can also mint without limit (mintTo) for liquidity bootstrap / grant demos.
 */
contract VeloMockUSDC is OFT {
    uint256 public constant FAUCET_AMOUNT      = 1_000 * 1e6;
    uint256 public constant FAUCET_COOLDOWN    = 6 hours;
    uint256 public constant FAUCET_MAX_BALANCE = 10_000 * 1e6;

    mapping(address => uint256) public lastFaucetClaim;

    event FaucetClaimed(address indexed user, uint256 amount);

    error FaucetCooldownActive(uint256 retryAfter);
    error FaucetBalanceCapReached();

    constructor(address lzEndpoint, address delegate)
        OFT("Velo Mock USDC", "mUSDC", lzEndpoint, delegate)
        Ownable(delegate)
    {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function sharedDecimals() public pure override returns (uint8) {
        return 6;
    }

    function mint() external {
        uint256 last = lastFaucetClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldownActive(last + FAUCET_COOLDOWN);
        }
        if (balanceOf(msg.sender) >= FAUCET_MAX_BALANCE) {
            revert FaucetBalanceCapReached();
        }
        lastFaucetClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    function mintTo(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
