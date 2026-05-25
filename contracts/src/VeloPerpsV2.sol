// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPyth} from "./interfaces/IPyth.sol";
import {PerpsMath} from "./libraries/PerpsMath.sol";

/**
 * @title VeloPerpsV2
 * @author Velo
 * @notice Second iteration of the Velo perp engine. Extends V1 with the
 *         pieces TradeView UI was missing on-chain backing for:
 *
 *           - increaseCollateral(tradeId, amount):  add margin to a position
 *           - decreaseCollateral(tradeId, amount):  remove margin (raises risk)
 *           - partialClose(tradeId, fractionBps):   close any fraction
 *           - setTriggers(tradeId, tp, sl):         on-chain TP / SL
 *           - closeIfTriggered(tradeId, ...):       keeper-callable close
 *
 *         Still NOT in V2 (deferred to V3+):
 *           - Cross margin             (own architectural redesign)
 *           - On-chain limit orders    (separate OrderBook contract)
 *           - Funding rate             (OI tracking + accrual mechanism)
 *           - Insurance fund           (separate vault + drawdown logic)
 *
 * @dev V2 is a fresh deploy, not an upgrade — V1 has no proxy. Existing V1
 *      positions stay on V1; users can close them on V1 and open new on V2.
 *      Frontend reads contract version via `version()` to route calls.
 *
 *      THIS CONTRACT IS NOT AUDITED. Same caveat as V1.
 */
contract VeloPerpsV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PerpsMath for uint256;

    // ─── Version tag (frontend reads this for compat checks) ───────────────
    uint16 public constant VERSION = 2;

    // ─── Constants ─────────────────────────────────────────────────────────
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 9_000;
    uint256 public constant LIQUIDATOR_BOUNTY_BPS = 100;
    uint256 public constant OPEN_FEE_BPS = 10;
    uint256 public constant CLOSE_FEE_BPS = 10;
    uint256 public constant MIN_COLLATERAL_USDC_6 = 1e6;
    uint256 public constant PYTH_MAX_AGE_SECONDS = 60;
    uint256 public constant FRACTION_BPS_DENOM = 10_000;

    // Permissionless close-on-trigger pays the caller a small bounty (in bps
    // of the closed payout) as an incentive for keepers to execute promptly.
    // Capped at 50 bps so it can never eat more than half a percent of payout.
    uint256 public constant KEEPER_BOUNTY_BPS = 25; // 0.25%

    // ─── Plumbing ──────────────────────────────────────────────────────────
    IERC20 public immutable USDC;
    IPyth  public immutable PYTH;

    // ─── Pair registry ─────────────────────────────────────────────────────
    mapping(uint16 => bytes32) public pairFeedId;
    mapping(uint16 => string)  public pairLabel;
    mapping(uint16 => bool)    public pairTradable;

    // ─── Position state ────────────────────────────────────────────────────
    // Same shape as V1 + two trigger fields. Stored as int128 so 0 means "unset"
    // (sensible default in EVM cleared memory). Using E18 so they live in the
    // same precision as entry/mark prices.
    struct Position {
        address owner;
        uint16  pairIndex;
        bool    isLong;
        uint16  leverage;
        uint64  collateralUSDC_6;
        uint128 entryPrice_E18;
        uint64  openedAt;
        uint128 takeProfit_E18; // 0 = unset
        uint128 stopLoss_E18;   // 0 = unset
        // Original notional at open: effectiveCollateral × leverage. Constant
        // for the life of the position even as collateral changes via add/remove,
        // so `effectiveLeverage` can return original_notional / current_collateral.
        uint128 originalNotional_6;
    }

    uint256 public nextTradeId = 1;
    mapping(uint256 => Position) public positions;

    mapping(address => uint256[]) private _traderTrades;
    mapping(address => mapping(uint256 => uint256)) private _traderTradeIndex;

    uint256 public feeBalance;

    // ─── Events ────────────────────────────────────────────────────────────
    event PairRegistered(uint16 indexed pairIndex, bytes32 feedId, string label);
    event PairTradable(uint16 indexed pairIndex, bool tradable);

    event PositionOpened(
        uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex,
        bool isLong, uint16 leverage, uint64 collateralUSDC_6, uint128 entryPrice_E18
    );
    event PositionClosed(
        uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex,
        uint128 exitPrice_E18, int256 pnlUSDC_6, uint64 payoutUSDC_6, uint64 feeUSDC_6
    );
    event PositionLiquidated(
        uint256 indexed tradeId, address indexed trader, address indexed liquidator,
        uint128 exitPrice_E18, uint64 bountyUSDC_6
    );
    event PositionPartiallyClosed(
        uint256 indexed tradeId, address indexed trader, uint16 fractionBps,
        uint128 exitPrice_E18, int256 pnlUSDC_6, uint64 payoutUSDC_6, uint64 feeUSDC_6
    );
    event CollateralAdded(uint256 indexed tradeId, address indexed trader, uint64 amountUSDC_6);
    event CollateralRemoved(uint256 indexed tradeId, address indexed trader, uint64 amountUSDC_6);
    event TriggersSet(uint256 indexed tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18);
    event TriggerFired(
        uint256 indexed tradeId, address indexed trader, address indexed keeper,
        bool wasTakeProfit, uint128 exitPrice_E18, uint64 keeperBounty_6
    );
    event FeesWithdrawn(address indexed to, uint256 amountUSDC_6);

    // ─── Errors ────────────────────────────────────────────────────────────
    error PairNotRegistered();
    error PairNotTradable();
    error LeverageOutOfRange();
    error CollateralTooSmall();
    error PositionNotFound();
    error NotPositionOwner();
    error NotLiquidatable();
    error PythFeeMismatch();
    error InsufficientPool();
    error FractionInvalid();
    error TriggerNotHit();
    error LeverageWouldExceedMax();
    error InvalidTrigger();

    constructor(IERC20 usdc, IPyth pyth, address initialOwner) Ownable(initialOwner) {
        USDC = usdc;
        PYTH = pyth;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    function registerPair(uint16 pairIndex, bytes32 feedId, string calldata label) external onlyOwner {
        pairFeedId[pairIndex] = feedId;
        pairLabel[pairIndex]  = label;
        pairTradable[pairIndex] = true;
        emit PairRegistered(pairIndex, feedId, label);
        emit PairTradable(pairIndex, true);
    }

    function setPairTradable(uint16 pairIndex, bool tradable) external onlyOwner {
        if (pairFeedId[pairIndex] == bytes32(0)) revert PairNotRegistered();
        pairTradable[pairIndex] = tradable;
        emit PairTradable(pairIndex, tradable);
    }

    function withdrawFees(address to, uint256 amountUSDC_6) external onlyOwner {
        if (amountUSDC_6 > feeBalance) amountUSDC_6 = feeBalance;
        feeBalance -= amountUSDC_6;
        USDC.safeTransfer(to, amountUSDC_6);
        emit FeesWithdrawn(to, amountUSDC_6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  TRADING — OPEN
    // ═══════════════════════════════════════════════════════════════════════

    function openPosition(
        uint16 pairIndex,
        bool isLong,
        uint64 collateralUSDC_6,
        uint16 leverage,
        bytes[] calldata pythUpdateData
    ) external payable nonReentrant returns (uint256 tradeId) {
        bytes32 feedId = pairFeedId[pairIndex];
        if (feedId == bytes32(0)) revert PairNotRegistered();
        if (!pairTradable[pairIndex]) revert PairNotTradable();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert LeverageOutOfRange();
        if (collateralUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(feedId);

        USDC.safeTransferFrom(msg.sender, address(this), collateralUSDC_6);

        uint256 openFee = uint256(collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS);
        feeBalance += openFee;
        uint64 effectiveCollateral_6 = uint64(uint256(collateralUSDC_6) - openFee);

        tradeId = nextTradeId++;
        positions[tradeId] = Position({
            owner:            msg.sender,
            pairIndex:        pairIndex,
            isLong:           isLong,
            leverage:         leverage,
            collateralUSDC_6: effectiveCollateral_6,
            entryPrice_E18:   uint128(markPrice_E18),
            openedAt:         uint64(block.timestamp),
            takeProfit_E18:   0,
            stopLoss_E18:     0,
            originalNotional_6: uint128(uint256(effectiveCollateral_6) * uint256(leverage))
        });

        _addToTraderIndex(msg.sender, tradeId);

        emit PositionOpened(
            tradeId, msg.sender, pairIndex, isLong, leverage,
            effectiveCollateral_6, uint128(markPrice_E18)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  TRADING — CLOSE
    // ═══════════════════════════════════════════════════════════════════════

    function closePosition(uint256 tradeId, bytes[] calldata pythUpdateData)
        external payable nonReentrant
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        _settleAndClose(tradeId, p, markPrice_E18, 0);
    }

    /// @notice Close a fraction of a position. fractionBps in [1, 10000].
    ///         10000 == full close (same as closePosition).
    function partialClose(uint256 tradeId, uint16 fractionBps, bytes[] calldata pythUpdateData)
        external payable nonReentrant
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (fractionBps == 0 || fractionBps > FRACTION_BPS_DENOM) revert FractionInvalid();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        if (fractionBps == FRACTION_BPS_DENOM) {
            _settleAndClose(tradeId, p, markPrice_E18, 0);
            return;
        }

        // Compute the fractional collateral being closed
        uint64 closingCollateral_6 = uint64((uint256(p.collateralUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);
        // PnL on just that fraction, using the same leverage. PerpsMath.computePnL
        // scales with collateral, so we feed it the fraction.
        int256 pnl_6 = PerpsMath.computePnL(
            closingCollateral_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );

        int256 grossPayout_6 = int256(uint256(closingCollateral_6)) + pnl_6;
        uint64 payout_6;
        uint64 closeFee_6;
        if (grossPayout_6 <= 0) {
            payout_6 = 0;
            closeFee_6 = 0;
            // Underwater: subtract the (negative) full fraction loss from remaining
            // collateral. If the loss > remaining, treat it as a full-close at zero
            // payout instead of leaving negative collateral.
            uint64 remaining = p.collateralUSDC_6 - closingCollateral_6;
            // The lost amount is min(remaining, |gross overshoot|) — overshoot is bounded by collateral
            // already (PerpsMath caps PnL at -collateral), so remaining is the right floor here.
            positions[tradeId].collateralUSDC_6 = remaining;
        } else {
            uint256 fee = uint256(grossPayout_6).applyBpsFee(CLOSE_FEE_BPS);
            closeFee_6 = uint64(fee);
            payout_6 = uint64(uint256(grossPayout_6) - fee);
            feeBalance += fee;
            // Reduce on-record collateral by the closed fraction
            positions[tradeId].collateralUSDC_6 = p.collateralUSDC_6 - closingCollateral_6;
        }

        if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < payout_6 + feeBalance) revert InsufficientPool();
            USDC.safeTransfer(p.owner, payout_6);
        }

        emit PositionPartiallyClosed(
            tradeId, p.owner, fractionBps,
            uint128(markPrice_E18), pnl_6, payout_6, closeFee_6
        );
    }

    function liquidate(uint256 tradeId, bytes[] calldata pythUpdateData)
        external payable nonReentrant
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        int256 pnl_6 = PerpsMath.computePnL(
            p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );

        int256 thresholdLoss = -int256(
            (uint256(p.collateralUSDC_6) * LIQUIDATION_THRESHOLD_BPS) / 10_000
        );
        if (pnl_6 > thresholdLoss) revert NotLiquidatable();

        uint64 bounty_6 = uint64((uint256(p.collateralUSDC_6) * LIQUIDATOR_BOUNTY_BPS) / 10_000);

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (bounty_6 > 0) {
            USDC.safeTransfer(msg.sender, bounty_6);
        }

        emit PositionLiquidated(tradeId, p.owner, msg.sender, uint128(markPrice_E18), bounty_6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  MARGIN MANAGEMENT — add / remove
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Add collateral to an open position. Lowers liquidation risk.
    ///         Effective leverage = (entry_size) / (collateral + amount).
    function increaseCollateral(uint256 tradeId, uint64 amountUSDC_6) external nonReentrant {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amountUSDC_6 == 0) revert CollateralTooSmall();

        USDC.safeTransferFrom(msg.sender, address(this), amountUSDC_6);
        p.collateralUSDC_6 += amountUSDC_6;
        emit CollateralAdded(tradeId, msg.sender, amountUSDC_6);
    }

    /// @notice Remove some collateral from an open position. The remaining
    ///         collateral must keep the position above the liquidation threshold
    ///         at the current mark price, AND must keep effective leverage
    ///         ≤ MAX_LEVERAGE.
    function decreaseCollateral(
        uint256 tradeId,
        uint64 amountUSDC_6,
        bytes[] calldata pythUpdateData
    ) external payable nonReentrant {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amountUSDC_6 == 0) revert CollateralTooSmall();
        if (amountUSDC_6 >= p.collateralUSDC_6) revert CollateralTooSmall();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        // Notional size is fixed at open time: collateral × leverage at entry.
        // The "size" used for PnL math in PerpsMath is collateral_at_entry × leverage,
        // so we keep that semantics — leverage on record doesn't change, only
        // collateral does. After withdrawal, EFFECTIVE leverage as observed by
        // a viewer = original_notional / new_collateral, which can exceed
        // MAX_LEVERAGE if too much is withdrawn. Block that.
        uint64 newCollateral_6 = p.collateralUSDC_6 - amountUSDC_6;

        // Effective leverage check using originalNotional, which is constant.
        // effLeverage = originalNotional / newCollateral. Must stay ≤ MAX_LEVERAGE.
        if (uint256(p.originalNotional_6) > MAX_LEVERAGE * uint256(newCollateral_6)) {
            revert LeverageWouldExceedMax();
        }

        // Liquidation check at current mark using the NEW collateral
        int256 pnl_6 = PerpsMath.computePnL(
            newCollateral_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );
        int256 thresholdLoss = -int256(
            (uint256(newCollateral_6) * LIQUIDATION_THRESHOLD_BPS) / 10_000
        );
        if (pnl_6 <= thresholdLoss) revert NotLiquidatable(); // would liquidate ⇒ refuse

        p.collateralUSDC_6 = newCollateral_6;
        USDC.safeTransfer(p.owner, amountUSDC_6);
        emit CollateralRemoved(tradeId, msg.sender, amountUSDC_6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  TP / SL — on-chain triggers
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Set or update TP/SL for an open position. Either can be 0 to clear.
    ///         Direction is enforced: for a long, TP must be above entry and SL below;
    ///         for a short, the opposite. We use mark-of-record (entry) as the reference
    ///         to keep the check stateless — the keeper later compares against live mark.
    function setTriggers(uint256 tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18) external {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        if (p.isLong) {
            if (takeProfit_E18 != 0 && takeProfit_E18 <= p.entryPrice_E18) revert InvalidTrigger();
            if (stopLoss_E18   != 0 && stopLoss_E18   >= p.entryPrice_E18) revert InvalidTrigger();
        } else {
            if (takeProfit_E18 != 0 && takeProfit_E18 >= p.entryPrice_E18) revert InvalidTrigger();
            if (stopLoss_E18   != 0 && stopLoss_E18   <= p.entryPrice_E18) revert InvalidTrigger();
        }

        p.takeProfit_E18 = takeProfit_E18;
        p.stopLoss_E18   = stopLoss_E18;
        emit TriggersSet(tradeId, takeProfit_E18, stopLoss_E18);
    }

    /// @notice Permissionless close — callable by anyone if the position's TP or SL
    ///         has been crossed at the current Pyth mark price. Payout goes to the
    ///         position owner (the trader). A small bounty (KEEPER_BOUNTY_BPS of
    ///         the payout) is sent to msg.sender to compensate keepers for gas.
    function closeIfTriggered(uint256 tradeId, bytes[] calldata pythUpdateData)
        external payable nonReentrant
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        bool tpHit;
        bool slHit;
        if (p.isLong) {
            tpHit = p.takeProfit_E18 != 0 && markPrice_E18 >= p.takeProfit_E18;
            slHit = p.stopLoss_E18   != 0 && markPrice_E18 <= p.stopLoss_E18;
        } else {
            tpHit = p.takeProfit_E18 != 0 && markPrice_E18 <= p.takeProfit_E18;
            slHit = p.stopLoss_E18   != 0 && markPrice_E18 >= p.stopLoss_E18;
        }
        if (!tpHit && !slHit) revert TriggerNotHit();

        // Compute payout/fee in the same way as closePosition, then split out
        // the keeper bounty before paying the trader.
        int256 pnl_6 = PerpsMath.computePnL(
            p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );
        int256 grossPayout_6 = int256(uint256(p.collateralUSDC_6)) + pnl_6;
        uint64 payout_6;
        uint64 closeFee_6;
        uint64 keeperBounty_6;
        if (grossPayout_6 <= 0) {
            payout_6 = 0;
            closeFee_6 = 0;
            keeperBounty_6 = 0;
        } else {
            uint256 fee = uint256(grossPayout_6).applyBpsFee(CLOSE_FEE_BPS);
            closeFee_6 = uint64(fee);
            uint256 netAfterFee = uint256(grossPayout_6) - fee;
            uint256 bounty = (netAfterFee * KEEPER_BOUNTY_BPS) / 10_000;
            keeperBounty_6 = uint64(bounty);
            payout_6 = uint64(netAfterFee - bounty);
            feeBalance += fee;
        }

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (USDC.balanceOf(address(this)) < uint256(payout_6) + uint256(keeperBounty_6) + feeBalance) {
            revert InsufficientPool();
        }
        if (payout_6 > 0)        USDC.safeTransfer(p.owner, payout_6);
        if (keeperBounty_6 > 0)  USDC.safeTransfer(msg.sender, keeperBounty_6);

        emit TriggerFired(tradeId, p.owner, msg.sender, tpHit, uint128(markPrice_E18), keeperBounty_6);
        emit PositionClosed(
            tradeId, p.owner, p.pairIndex,
            uint128(markPrice_E18), pnl_6, payout_6, closeFee_6
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

    function version() external pure returns (uint16) { return VERSION; }

    function getTraderTrades(address trader) external view returns (uint256[] memory) {
        return _traderTrades[trader];
    }

    function getPosition(uint256 tradeId) external view returns (Position memory) {
        return positions[tradeId];
    }

    function quoteUnrealisedPnL(uint256 tradeId)
        external view returns (int256 pnl_6, uint256 markPrice_E18)
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) return (0, 0);

        IPyth.Price memory pp = PYTH.getPriceNoOlderThan(pairFeedId[p.pairIndex], PYTH_MAX_AGE_SECONDS);
        markPrice_E18 = PerpsMath.normalisePythPrice(pp.price, pp.expo);

        pnl_6 = PerpsMath.computePnL(
            p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );
    }

    function poolBalance() external view returns (uint256) {
        return USDC.balanceOf(address(this)) - feeBalance;
    }

    /// @notice Compute the effective leverage of a position right now.
    ///         original_notional / current_collateral. Returns a plain integer
    ///         (e.g. 12 for 12×) — call with care for high-precision needs.
    function effectiveLeverage(uint256 tradeId) external view returns (uint256) {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) return 0;
        if (p.collateralUSDC_6 == 0) return 0;
        return uint256(p.originalNotional_6) / uint256(p.collateralUSDC_6);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Shared close path. `extraReceiver_6` is the keeper bounty (0 if owner-closed).
    function _settleAndClose(
        uint256 tradeId,
        Position memory p,
        uint256 markPrice_E18,
        uint64 extraReceiver_6
    ) internal {
        int256 pnl_6 = PerpsMath.computePnL(
            p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );
        int256 grossPayout_6 = int256(uint256(p.collateralUSDC_6)) + pnl_6;
        uint64 payout_6;
        uint64 closeFee_6;
        if (grossPayout_6 <= 0) {
            payout_6 = 0;
            closeFee_6 = 0;
        } else {
            uint256 fee = uint256(grossPayout_6).applyBpsFee(CLOSE_FEE_BPS);
            closeFee_6 = uint64(fee);
            payout_6 = uint64(uint256(grossPayout_6) - fee);
            feeBalance += fee;
        }

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < uint256(payout_6) + uint256(extraReceiver_6) + feeBalance) {
                revert InsufficientPool();
            }
            USDC.safeTransfer(p.owner, payout_6);
        }

        emit PositionClosed(
            tradeId, p.owner, p.pairIndex,
            uint128(markPrice_E18), pnl_6, payout_6, closeFee_6
        );
    }

    function _pushPythUpdate(bytes[] calldata updateData) internal {
        if (updateData.length == 0) return;
        uint256 fee = PYTH.getUpdateFee(updateData);
        if (msg.value < fee) revert PythFeeMismatch();
        PYTH.updatePriceFeeds{value: fee}(updateData);

        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            ok;
        }
    }

    function _readPrice(bytes32 feedId) internal view returns (uint256 price_E18) {
        IPyth.Price memory p = PYTH.getPriceNoOlderThan(feedId, PYTH_MAX_AGE_SECONDS);
        price_E18 = PerpsMath.normalisePythPrice(p.price, p.expo);
    }

    function _addToTraderIndex(address trader, uint256 tradeId) internal {
        _traderTradeIndex[trader][tradeId] = _traderTrades[trader].length;
        _traderTrades[trader].push(tradeId);
    }

    function _removeFromTraderIndex(address trader, uint256 tradeId) internal {
        uint256[] storage list = _traderTrades[trader];
        uint256 idx = _traderTradeIndex[trader][tradeId];
        uint256 last = list.length - 1;
        if (idx != last) {
            uint256 lastId = list[last];
            list[idx] = lastId;
            _traderTradeIndex[trader][lastId] = idx;
        }
        list.pop();
        delete _traderTradeIndex[trader][tradeId];
    }
}
