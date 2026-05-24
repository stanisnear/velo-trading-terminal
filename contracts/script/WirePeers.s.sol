// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {VeloMockUSDC} from "../src/VeloMockUSDC.sol";

/**
 * @title WirePeers
 * @notice After deploying VeloMockUSDC on all four Sepolias, run this from each
 *         chain to connect them to the other three via OFT setPeer(eid, peerAddr).
 *
 * Endpoint IDs (LayerZero V2):
 *   Ethereum Sepolia: 40161
 *   Arbitrum Sepolia: 40231
 *   Optimism Sepolia: 40232
 *   Base Sepolia:     40245
 *
 * Required env:
 *   LOCAL_USDC      — VeloMockUSDC on the chain the RPC points at
 *   PEER_BASE       — VeloMockUSDC on Base Sepolia      (0x0 to skip)
 *   PEER_ARB        — VeloMockUSDC on Arbitrum Sepolia  (0x0 to skip)
 *   PEER_OP         — VeloMockUSDC on Optimism Sepolia  (0x0 to skip)
 *   PEER_ETH        — VeloMockUSDC on Ethereum Sepolia  (0x0 to skip)
 *   PRIVATE_KEY     — owner of the local USDC
 */
contract WirePeers is Script {
    uint32 constant EID_ETH_SEPOLIA  = 40161;
    uint32 constant EID_ARB_SEPOLIA  = 40231;
    uint32 constant EID_OP_SEPOLIA   = 40232;
    uint32 constant EID_BASE_SEPOLIA = 40245;

    function run() external {
        uint256 pk         = vm.envUint("PRIVATE_KEY");
        address localUsdc  = vm.envAddress("LOCAL_USDC");

        address peerBase = vm.envOr("PEER_BASE", address(0));
        address peerArb  = vm.envOr("PEER_ARB",  address(0));
        address peerOp   = vm.envOr("PEER_OP",   address(0));
        address peerEth  = vm.envOr("PEER_ETH",  address(0));

        VeloMockUSDC usdc = VeloMockUSDC(localUsdc);

        vm.startBroadcast(pk);

        if (peerBase != address(0)) {
            usdc.setPeer(EID_BASE_SEPOLIA, _addrToBytes32(peerBase));
            console2.log("Wired to Base Sepolia:", peerBase);
        }
        if (peerArb != address(0)) {
            usdc.setPeer(EID_ARB_SEPOLIA, _addrToBytes32(peerArb));
            console2.log("Wired to Arb Sepolia: ", peerArb);
        }
        if (peerOp != address(0)) {
            usdc.setPeer(EID_OP_SEPOLIA, _addrToBytes32(peerOp));
            console2.log("Wired to OP Sepolia:  ", peerOp);
        }
        if (peerEth != address(0)) {
            usdc.setPeer(EID_ETH_SEPOLIA, _addrToBytes32(peerEth));
            console2.log("Wired to Eth Sepolia: ", peerEth);
        }

        vm.stopBroadcast();
    }

    function _addrToBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(a)));
    }
}
