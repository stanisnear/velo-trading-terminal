// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {VeloMockUSDC} from "../src/VeloMockUSDC.sol";

/**
 * @title DeployRemoteUSDC
 * @notice Deploys VeloMockUSDC on Arb / OP / Eth Sepolia. The Perps engine and
 *         Registry stay Base-Sepolia-only. mUSDC bridging brings cross-chain
 *         capital INTO Base Sepolia for trading.
 *
 * LayerZero V2 EndpointV2 — verify before deploy at docs.layerzero.network:
 *   Arbitrum Sepolia:  0x6EDCE65403992e310A62460808c4b910D972f10f
 *   Optimism Sepolia:  0x6EDCE65403992e310A62460808c4b910D972f10f
 *   Ethereum Sepolia:  0x6EDCE65403992e310A62460808c4b910D972f10f
 *
 * Run:
 *   LZ_ENDPOINT=0x6EDCE65403992e310A62460808c4b910D972f10f \
 *   CHAIN_SLUG=arbitrum_sepolia \
 *   forge script script/DeployRemoteUSDC.s.sol --rpc-url $ARB_SEPOLIA_RPC_URL --broadcast --verify
 */
contract DeployRemoteUSDC is Script {
    function run() external {
        uint256 pk         = vm.envUint("PRIVATE_KEY");
        address lzEndpoint = vm.envAddress("LZ_ENDPOINT");
        string memory chainSlug = vm.envString("CHAIN_SLUG");

        address deployer = vm.addr(pk);
        console2.log("Deployer:    ", deployer);
        console2.log("LZ Endpoint: ", lzEndpoint);
        console2.log("Chain slug:  ", chainSlug);

        vm.startBroadcast(pk);
        VeloMockUSDC usdc = new VeloMockUSDC(lzEndpoint, deployer);
        vm.stopBroadcast();

        console2.log("VeloMockUSDC:", address(usdc));

        string memory json = string.concat(
            "{",
              "\"chain\":\"", chainSlug, "\",",
              "\"VeloMockUSDC\":\"", vm.toString(address(usdc)), "\",",
              "\"lzEndpoint\":\"", vm.toString(lzEndpoint), "\"",
            "}"
        );
        vm.writeFile(string.concat("./deployments/", chainSlug, ".json"), json);
    }
}
