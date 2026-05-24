// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * @title PerpsMath
 * @notice Pure math used by VeloPerps. Library form so unit tests can poke it
 *         directly and the main contract reads as business logic, not arithmetic.
 *
 * Decimal conventions used throughout VeloPerps:
 *   USDC                       6 decimals (matches Circle USDC everywhere)
 *   Pyth price                 int64 with int32 expo (typically -8 for crypto)
 *   Internal price (PRICE_E18) 18-decimal fixed point — what we store / reason about
 *   Leverage                   integer 1..MAX_LEVERAGE (no fractional leverage in v1)
 *   Basis points               1 bp = 1/10000
 *
 * All conversions happen at the contract boundary via normalisePythPrice().
 */
library PerpsMath {
    uint256 internal constant PRICE_E18 = 1e18;
    uint256 internal constant USDC_6 = 1e6;
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    error InvalidPythPrice();
    error InvalidLeverage();

    /**
     * @notice Convert a Pyth (price, expo) pair into our 18-decimal internal format.
     * @dev    Reverts on non-positive price (a bad oracle should never settle trades).
     *         Reverts if expo > 0 (no supported crypto feed has positive expo).
     */
    function normalisePythPrice(int64 pythPrice, int32 expo) internal pure returns (uint256) {
        if (pythPrice <= 0) revert InvalidPythPrice();
        if (expo > 0) revert InvalidPythPrice();

        uint256 absPrice = uint256(uint64(pythPrice));
        uint32 absExpo = uint32(-expo);
        if (absExpo <= 18) {
            return absPrice * 10 ** (18 - absExpo);
        } else {
            return absPrice / 10 ** (absExpo - 18);
        }
    }

    /**
     * @notice Unrealised PnL of a position, in signed 1e6 USDC.
     * @dev    pnl = collateral * leverage * (mark - entry) / entry, sign-flipped for shorts.
     *         Massive headroom for sane values — collateral 1e12 * lev 25 fits easily in uint256.
     */
    function computePnL(
        uint256 collateralUSDC_6,
        uint256 leverage,
        uint256 entryPrice_E18,
        uint256 markPrice_E18,
        bool isLong
    ) internal pure returns (int256 pnlUSDC_6) {
        if (entryPrice_E18 == 0) return 0;

        int256 priceDelta_E18 = int256(markPrice_E18) - int256(entryPrice_E18);
        if (!isLong) priceDelta_E18 = -priceDelta_E18;

        if (priceDelta_E18 >= 0) {
            uint256 magnitude =
                (collateralUSDC_6 * leverage * uint256(priceDelta_E18)) / entryPrice_E18;
            return int256(magnitude);
        } else {
            uint256 magnitude =
                (collateralUSDC_6 * leverage * uint256(-priceDelta_E18)) / entryPrice_E18;
            return -int256(magnitude);
        }
    }

    /// @notice Price at which a position would lose `liqThresholdBps` of its collateral.
    function computeLiquidationPrice(
        uint256 entryPrice_E18,
        uint256 leverage,
        uint256 liqThresholdBps,
        bool isLong
    ) internal pure returns (uint256) {
        if (leverage == 0) revert InvalidLeverage();
        uint256 delta = (entryPrice_E18 * liqThresholdBps) / (leverage * BPS_DENOMINATOR);
        if (isLong) {
            return entryPrice_E18 > delta ? entryPrice_E18 - delta : 0;
        } else {
            return entryPrice_E18 + delta;
        }
    }

    /// @notice Take a basis-points fee from a USDC amount.
    function applyBpsFee(uint256 amountUSDC_6, uint256 feeBps) internal pure returns (uint256 fee) {
        return (amountUSDC_6 * feeBps) / BPS_DENOMINATOR;
    }
}
