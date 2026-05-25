// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "forge-std/console2.sol";
import {VeloPerpsV2}    from "../src/VeloPerpsV2.sol";
import {IPyth}          from "../src/interfaces/IPyth.sol";
import {IERC20}         from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DeployVeloPerpsV2
 * @notice Deploys VeloPerpsV2 on Base Sepolia and registers all 17 pairs.
 *
 *   - Uses the EXISTING VeloMockUSDC at 0x5EFa…6699 (don't redeploy).
 *   - Pyth oracle at 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 (same as V1).
 *   - Seeds the new pool with 100k mUSDC so V2 has reserves on day 1.
 *
 * After running:
 *   - Update VITE_VELO_PERPS_V2_ADDRESS in Vercel env vars
 *   - Frontend reads `version()` to route open/close/manage calls to V2
 *     (V1 stays alive for any positions opened before V2 was deployed)
 *
 * Run:
 *   forge script script/DeployVeloPerpsV2.s.sol \
 *     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
 */
contract DeployVeloPerpsV2 is Script {
    address constant PYTH_BASE_SEPOLIA = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    address constant MUSDC_BASE_SEPOLIA = 0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699;

    // All Pyth feed IDs (chain-independent). Same as V1's RegisterPairs script,
    // plus the 11 we added in the Admin Panel work.
    bytes32 constant BTC_USD    = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant ETH_USD    = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant SOL_USD    = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 constant AVAX_USD   = 0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7;
    bytes32 constant LINK_USD   = 0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221;
    bytes32 constant DOGE_USD   = 0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c;
    bytes32 constant NEAR_USD   = 0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750;
    bytes32 constant INJ_USD    = 0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592;
    bytes32 constant APT_USD    = 0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5;
    bytes32 constant ARB_USD    = 0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5;
    bytes32 constant OP_USD     = 0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf;
    bytes32 constant SUI_USD    = 0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744;
    bytes32 constant TIA_USD    = 0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723;
    bytes32 constant SEI_USD    = 0x53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb;
    bytes32 constant RENDER_USD = 0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d;
    bytes32 constant WLFI_USD   = 0xd41369178d64f41d51ca95465c144a2c74d2fff30be69164835911943fa64c3e;
    bytes32 constant POL_USD    = 0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        VeloPerpsV2 perps = new VeloPerpsV2(
            IERC20(MUSDC_BASE_SEPOLIA),
            IPyth(PYTH_BASE_SEPOLIA),
            deployer
        );
        console2.log("VeloPerpsV2:", address(perps));

        // Register all 17 pairs in one tx batch
        perps.registerPair(0,  BTC_USD,    "BTC/USD");
        perps.registerPair(1,  ETH_USD,    "ETH/USD");
        perps.registerPair(2,  SOL_USD,    "SOL/USD");
        perps.registerPair(3,  AVAX_USD,   "AVAX/USD");
        perps.registerPair(4,  LINK_USD,   "LINK/USD");
        perps.registerPair(5,  DOGE_USD,   "DOGE/USD");
        perps.registerPair(6,  NEAR_USD,   "NEAR/USD");
        perps.registerPair(7,  INJ_USD,    "INJ/USD");
        perps.registerPair(8,  APT_USD,    "APT/USD");
        perps.registerPair(9,  ARB_USD,    "ARB/USD");
        perps.registerPair(10, OP_USD,     "OP/USD");
        perps.registerPair(11, SUI_USD,    "SUI/USD");
        perps.registerPair(12, TIA_USD,    "TIA/USD");
        perps.registerPair(13, SEI_USD,    "SEI/USD");
        perps.registerPair(14, RENDER_USD, "RENDER/USD");
        perps.registerPair(15, WLFI_USD,   "WLFI/USD");
        perps.registerPair(16, POL_USD,    "POL/USD");

        // Seed pool. Owner needs to have already minted (or transferred) 100k mUSDC.
        // If the deployer is the mUSDC owner, the next line will mint it. Otherwise
        // do a manual transfer before running this script.
        try this.seedPool(perps, deployer) {} catch {
            console2.log("Pool not seeded - owner needs to send mUSDC to:", address(perps));
        }

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment complete ===");
        console2.log("VeloPerpsV2:", address(perps));
        console2.log("Update VITE_VELO_PERPS_V2_ADDRESS in Vercel.");
    }

    /// @dev External so the try/catch above can wrap it.
    function seedPool(VeloPerpsV2 perps, address from) external {
        IERC20(MUSDC_BASE_SEPOLIA).transferFrom(from, address(perps), 100_000 * 1e6);
    }
}
