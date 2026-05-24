// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IPyth (subset)
 * @notice Minimal interface to Pyth's EVM contract — only the methods Velo
 *         calls. The full SDK is at https://github.com/pyth-network/pyth-sdk-solidity.
 *
 * Pyth contract on Base Sepolia: 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
 *   verified at https://docs.base.org/learn/onchain-app-development/finance/access-real-time-asset-data-pyth-price-feeds
 */
interface IPyth {
    /// @param price       Price in fixed-point. Decimal places given by `expo`.
    /// @param conf        Confidence interval (uncertainty) at the same scale.
    /// @param expo        Decimal exponent (negative for crypto pairs in practice).
    /// @param publishTime Unix timestamp the price was published.
    struct Price {
        int64  price;
        uint64 conf;
        int32  expo;
        uint   publishTime;
    }

    /// @notice Submit fresh price data. Caller pays msg.value >= getUpdateFee(updateData).
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Fee in wei the caller must send with updatePriceFeeds.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount);

    /// @notice Read a price feed, reverting if the update is older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory);
}
