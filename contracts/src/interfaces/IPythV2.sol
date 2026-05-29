// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title IPythV2
 * @notice Extended Pyth interface adding parsePriceFeedUpdates, which extracts
 *         the price directly from the VAA blob WITHOUT touching the on-chain cache.
 *
 * This is the fix for Base Sepolia testnet: updatePriceFeeds() silently no-ops
 * when incoming.publishTime <= cached.publishTime, causing _readPrice() to read
 * a stale/near-zero cached value. parsePriceFeedUpdates() bypasses the cache
 * entirely and returns the price embedded in the blob itself.
 *
 * Pyth contract on Base Sepolia: 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
 */
interface IPythV2 {
    struct Price {
        int64  price;
        uint64 conf;
        int32  expo;
        uint   publishTime;
    }

    struct PriceFeed {
        bytes32 id;
        Price   price;
        Price   emaPrice;
    }

    /// @notice Submit fresh price data. Caller pays msg.value >= getUpdateFee(updateData).
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Fee in wei the caller must send with updatePriceFeeds / parsePriceFeedUpdates.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount);

    /// @notice Read a price feed from cache, reverting if older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory);

    /**
     * @notice Parse price feeds directly from the VAA blob - does NOT update the cache.
     *         Returns the price embedded in the blob regardless of what's in cache.
     *         Caller pays getUpdateFee(updateData) in msg.value.
     *
     * @param updateData  VAA blobs (same format as updatePriceFeeds).
     * @param priceIds    Feed IDs to extract (must all be present in updateData).
     * @param minPublishTime  Reject blobs older than this timestamp.
     * @param maxPublishTime  Reject blobs newer than this timestamp (use type(uint64).max).
     */
    function parsePriceFeedUpdates(
        bytes[]  calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PriceFeed[] memory priceFeeds);
}
