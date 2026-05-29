// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {Script, console} from "forge-std/Script.sol";
import {VeloPerps} from "../src/VeloPerps.sol";

/**
 * RegisterPairs — adds SOL/USD, AVAX/USD, LINK/USD, DOGE/USD to the
 * VeloPerps contract on Base Sepolia.
 *
 * Pyth feed IDs verified at https://www.pyth.network/price-feeds.
 *
 * Usage:
 *   forge script script/RegisterPairs.s.sol:RegisterPairs \
 *     --rpc-url $BASE_SEPOLIA_RPC --broadcast \
 *     --private-key $PRIVATE_KEY
 */
contract RegisterPairs is Script {
    address constant VELO_PERPS = 0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163;

    // Pyth Network feed IDs (Stable channel, mainnet — same IDs on testnet)
    // Verified: https://www.pyth.network/developers/price-feed-ids
    bytes32 constant SOL_USD  = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 constant AVAX_USD = 0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7;
    bytes32 constant LINK_USD = 0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221;
    bytes32 constant DOGE_USD = 0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        VeloPerps perps = VeloPerps(VELO_PERPS);

        vm.startBroadcast(pk);

        // Pair index 2: SOL/USD
        perps.registerPair(2, SOL_USD, "SOL/USD");
        console.log("Registered SOL/USD at index 2");

        // Pair index 3: AVAX/USD
        perps.registerPair(3, AVAX_USD, "AVAX/USD");
        console.log("Registered AVAX/USD at index 3");

        // Pair index 4: LINK/USD
        perps.registerPair(4, LINK_USD, "LINK/USD");
        console.log("Registered LINK/USD at index 4");

        // Pair index 5: DOGE/USD
        perps.registerPair(5, DOGE_USD, "DOGE/USD");
        console.log("Registered DOGE/USD at index 5");

        vm.stopBroadcast();
    }
}
