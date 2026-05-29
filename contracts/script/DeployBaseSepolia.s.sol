// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {VeloPerps}     from "../src/VeloPerps.sol";
import {VeloMockUSDC}  from "../src/VeloMockUSDC.sol";
import {VeloRegistry}  from "../src/VeloRegistry.sol";
import {IPyth}         from "../src/interfaces/IPyth.sol";
import {IERC20}        from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeployBaseSepolia
 * @notice Deploys Velo's full stack on Base Sepolia (Perps + USDC OFT + Registry).
 *
 * Verified constants:
 *   Pyth on Base Sepolia        0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
 *   LayerZero V2 EndpointV2     0x6EDCE65403992e310A62460808c4b910D972f10f
 *   BTC/USD feed id             0xe62d…415b43
 *   ETH/USD feed id             0xff61…fd0ace
 *
 * Run:
 *   forge script script/DeployBaseSepolia.s.sol \
 *     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
 */
contract DeployBaseSepolia is Script {
    address constant PYTH_BASE_SEPOLIA       = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    address constant LZ_ENDPOINT_BASE_SEPOLIA = 0x6EDCE65403992e310A62460808c4b910D972f10f;

    bytes32 constant BTC_USD_FEED = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant ETH_USD_FEED = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        VeloMockUSDC usdc = new VeloMockUSDC(LZ_ENDPOINT_BASE_SEPOLIA, deployer);
        console2.log("VeloMockUSDC:", address(usdc));

        VeloPerps perps = new VeloPerps(IERC20(address(usdc)), IPyth(PYTH_BASE_SEPOLIA), deployer);
        console2.log("VeloPerps:   ", address(perps));

        perps.registerPair(0, BTC_USD_FEED, "BTC/USD");
        perps.registerPair(1, ETH_USD_FEED, "ETH/USD");

        VeloRegistry registry = new VeloRegistry();
        console2.log("VeloRegistry:", address(registry));

        // Seed 100k mUSDC into the pool so winning trades have something to settle against.
        usdc.mintTo(address(perps), 100_000 * 1e6);

        vm.stopBroadcast();

        string memory json = string.concat(
            "{",
              "\"chain\":\"base_sepolia\",",
              "\"chainId\":84532,",
              "\"VeloMockUSDC\":\"", vm.toString(address(usdc)), "\",",
              "\"VeloPerps\":\"",     vm.toString(address(perps)), "\",",
              "\"VeloRegistry\":\"",  vm.toString(address(registry)), "\",",
              "\"pyth\":\"",          vm.toString(PYTH_BASE_SEPOLIA), "\",",
              "\"lzEndpoint\":\"",    vm.toString(LZ_ENDPOINT_BASE_SEPOLIA), "\"",
            "}"
        );
        vm.writeFile("./deployments/base_sepolia.json", json);
    }
}
