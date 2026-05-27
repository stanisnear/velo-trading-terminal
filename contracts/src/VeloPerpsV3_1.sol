// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPythV2} from "./interfaces/IPythV2.sol";
import {PerpsMath} from "./libraries/PerpsMath.sol";

/**
 * @title VeloPerpsV3
 * @notice V3 extends V2 with:
 *         - dual margin modes (ISOLATED and CROSS account)
 *         - on-chain conditional orders (LIMIT / STOP) with reduce-only support
 *         - editable TP/SL still on-chain via setTriggers
 *
 * @dev Not audited. Testnet-focused release candidate for full FE->chain parity.
 */
contract VeloPerpsV3_1 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PerpsMath for uint256;

    uint16 public constant VERSION = 31; // 3.1

    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 9_000;
    uint256 public constant LIQUIDATOR_BOUNTY_BPS = 100;
    uint256 public constant OPEN_FEE_BPS = 10;
    uint256 public constant CLOSE_FEE_BPS = 10;
    uint256 public constant KEEPER_BOUNTY_BPS = 25;
    uint256 public constant MIN_COLLATERAL_USDC_6 = 1e6;
    uint256 public constant FRACTION_BPS_DENOM = 10_000;
    uint256 public constant PYTH_MAX_AGE_SECONDS = 60;

    IERC20 public immutable USDC;
    IPythV2 public immutable PYTH;

    enum MarginMode { ISOLATED, CROSS }
    enum TriggerKind { LIMIT, STOP }

    struct Position {
        address owner;
        uint16 pairIndex;
        bool isLong;
        uint16 leverage;
        uint8 marginMode;
        uint64 collateralUSDC_6;
        uint128 entryPrice_E18;
        uint64 openedAt;
        uint128 takeProfit_E18;
        uint128 stopLoss_E18;
        uint128 originalNotional_6;
    }

    struct ConditionalOrder {
        address owner;
        uint16 pairIndex;
        bool isLong;
        uint16 leverage;
        uint8 marginMode;
        uint8 triggerKind;
        bool reduceOnly;
        uint16 reduceBps;
        uint64 collateralUSDC_6;
        uint128 triggerPrice_E18;
        uint64 createdAt;
        bool active;
    }

    struct PlaceConditionalOrderParams {
        uint16 pairIndex;
        bool isLong;
        uint16 leverage;
        uint8 marginMode;
        uint8 triggerKind;
        uint128 triggerPrice_E18;
        uint64 collateralUSDC_6;
        bool reduceOnly;
        uint16 reduceBps;
    }

    mapping(uint16 => bytes32) public pairFeedId;
    mapping(uint16 => string) public pairLabel;
    mapping(uint16 => bool) public pairTradable;

    uint256 public nextTradeId = 1;
    mapping(uint256 => Position) public positions;

    uint256 public nextOrderId = 1;
    mapping(uint256 => ConditionalOrder) public conditionalOrders;

    mapping(address => uint256) public crossBalanceUSDC_6;
    mapping(address => uint256) public crossLockedUSDC_6;

    mapping(address => uint256[]) private _traderTrades;
    mapping(address => mapping(uint256 => uint256)) private _traderTradeIndex;

    mapping(address => uint256[]) private _traderOrders;
    mapping(address => mapping(uint256 => uint256)) private _traderOrderIndex;

    uint256 public feeBalance;

    event PairRegistered(uint16 indexed pairIndex, bytes32 feedId, string label);
    event PairTradable(uint16 indexed pairIndex, bool tradable);

    event CrossDeposited(address indexed trader, uint64 amountUSDC_6);
    event CrossWithdrawn(address indexed trader, uint64 amountUSDC_6);

    event PositionOpened(
        uint256 indexed tradeId,
        address indexed trader,
        uint16 indexed pairIndex,
        bool isLong,
        uint16 leverage,
        uint8 marginMode,
        uint64 collateralUSDC_6,
        uint128 entryPrice_E18
    );
    event PositionClosed(
        uint256 indexed tradeId,
        address indexed trader,
        uint16 indexed pairIndex,
        uint128 exitPrice_E18,
        int256 pnlUSDC_6,
        uint64 payoutUSDC_6,
        uint64 feeUSDC_6
    );
    event PositionPartiallyClosed(
        uint256 indexed tradeId,
        address indexed trader,
        uint16 fractionBps,
        uint128 exitPrice_E18,
        int256 pnlUSDC_6,
        uint64 payoutUSDC_6,
        uint64 feeUSDC_6
    );
    event PositionLiquidated(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed liquidator,
        uint128 exitPrice_E18,
        uint64 bountyUSDC_6
    );

    event CollateralAdded(uint256 indexed tradeId, address indexed trader, uint64 amountUSDC_6);
    event CollateralRemoved(uint256 indexed tradeId, address indexed trader, uint64 amountUSDC_6);
    event TriggersSet(uint256 indexed tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18);
    event TriggerFired(
        uint256 indexed tradeId,
        address indexed trader,
        address indexed keeper,
        bool wasTakeProfit,
        uint128 exitPrice_E18,
        uint64 keeperBounty_6
    );

    event ConditionalOrderPlaced(
        uint256 indexed orderId,
        address indexed trader,
        uint16 indexed pairIndex,
        bool isLong,
        uint8 triggerKind,
        uint8 marginMode,
        bool reduceOnly,
        uint16 reduceBps,
        uint128 triggerPrice_E18,
        uint64 collateralUSDC_6,
        uint16 leverage
    );
    event ConditionalOrderCancelled(uint256 indexed orderId, address indexed trader);
    event ConditionalOrderExecuted(uint256 indexed orderId, address indexed trader, uint256 linkedTradeId, uint128 markPrice_E18);

    event FeesWithdrawn(address indexed to, uint256 amountUSDC_6);

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
    error InvalidMarginMode();
    error InsufficientCrossBalance();
    error OrderNotFound();
    error OrderNotOwner();
    error OrderNotActive();
    error OrderNotTriggered();
    error ReduceOnlyNoPosition();

    constructor(IERC20 usdc, IPythV2 pyth, address initialOwner) Ownable(initialOwner) {
        USDC = usdc;
        PYTH = pyth;
    }

    function registerPair(uint16 pairIndex, bytes32 feedId, string calldata label) external onlyOwner {
        pairFeedId[pairIndex] = feedId;
        pairLabel[pairIndex] = label;
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

    function depositCross(uint64 amountUSDC_6) external nonReentrant {
        if (amountUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();
        USDC.safeTransferFrom(msg.sender, address(this), amountUSDC_6);
        crossBalanceUSDC_6[msg.sender] += amountUSDC_6;
        emit CrossDeposited(msg.sender, amountUSDC_6);
    }

    function withdrawCross(uint64 amountUSDC_6) external nonReentrant {
        uint256 free = crossFreeBalance(msg.sender);
        if (amountUSDC_6 == 0 || uint256(amountUSDC_6) > free) revert InsufficientCrossBalance();
        crossBalanceUSDC_6[msg.sender] -= amountUSDC_6;
        USDC.safeTransfer(msg.sender, amountUSDC_6);
        emit CrossWithdrawn(msg.sender, amountUSDC_6);
    }

    function openPosition(
        uint16 pairIndex,
        bool isLong,
        uint64 collateralUSDC_6,
        uint16 leverage,
        uint8 marginMode,
        bytes[] calldata pythUpdateData
    ) external payable nonReentrant returns (uint256 tradeId) {
        bytes32 feedId = pairFeedId[pairIndex];
        if (feedId == bytes32(0)) revert PairNotRegistered();
        if (!pairTradable[pairIndex]) revert PairNotTradable();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert LeverageOutOfRange();
        if (collateralUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();
        if (marginMode > uint8(MarginMode.CROSS)) revert InvalidMarginMode();

        uint256 markPrice_E18 = _extractPrice(feedId, pythUpdateData);

        if (marginMode == uint8(MarginMode.ISOLATED)) {
            USDC.safeTransferFrom(msg.sender, address(this), collateralUSDC_6);
        } else {
            uint256 free = crossFreeBalance(msg.sender);
            if (free < collateralUSDC_6) revert InsufficientCrossBalance();
            crossLockedUSDC_6[msg.sender] += collateralUSDC_6;
        }

        uint256 openFee = uint256(collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS);
        feeBalance += openFee;

        uint64 effectiveCollateral_6 = uint64(uint256(collateralUSDC_6) - openFee);
        if (marginMode == uint8(MarginMode.CROSS)) {
            // Keep locked collateral equal to effective amount post open fee.
            crossLockedUSDC_6[msg.sender] -= openFee;
            crossBalanceUSDC_6[msg.sender] -= openFee;
        }

        tradeId = nextTradeId++;
        positions[tradeId] = Position({
            owner: msg.sender,
            pairIndex: pairIndex,
            isLong: isLong,
            leverage: leverage,
            marginMode: marginMode,
            collateralUSDC_6: effectiveCollateral_6,
            entryPrice_E18: uint128(markPrice_E18),
            openedAt: uint64(block.timestamp),
            takeProfit_E18: 0,
            stopLoss_E18: 0,
            originalNotional_6: uint128(uint256(effectiveCollateral_6) * uint256(leverage))
        });

        _addToTraderIndex(msg.sender, tradeId);

        emit PositionOpened(
            tradeId,
            msg.sender,
            pairIndex,
            isLong,
            leverage,
            marginMode,
            effectiveCollateral_6,
            uint128(markPrice_E18)
        );
    }

    function closePosition(uint256 tradeId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[p.pairIndex], pythUpdateData);

        _settleAndClose(tradeId, p, markPrice_E18, 0, msg.sender);
    }

    function partialClose(uint256 tradeId, uint16 fractionBps, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (fractionBps == 0 || fractionBps > FRACTION_BPS_DENOM) revert FractionInvalid();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[p.pairIndex], pythUpdateData);

        if (fractionBps == FRACTION_BPS_DENOM) {
            _settleAndClose(tradeId, p, markPrice_E18, 0, msg.sender);
            return;
        }

        uint64 closingCollateral_6 = uint64((uint256(p.collateralUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);
        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(closingCollateral_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong);

        positions[tradeId].collateralUSDC_6 = p.collateralUSDC_6 - closingCollateral_6;

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= closingCollateral_6;
            crossBalanceUSDC_6[p.owner] += payout_6;
        } else if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < uint256(payout_6) + feeBalance) revert InsufficientPool();
            USDC.safeTransfer(p.owner, payout_6);
        }

        emit PositionPartiallyClosed(tradeId, p.owner, fractionBps, uint128(markPrice_E18), pnl_6, payout_6, closeFee_6);
    }

    function liquidate(uint256 tradeId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[p.pairIndex], pythUpdateData);

        int256 pnl_6 = PerpsMath.computePnL(
            p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong
        );

        int256 thresholdLoss = -int256((uint256(p.collateralUSDC_6) * LIQUIDATION_THRESHOLD_BPS) / 10_000);
        if (pnl_6 > thresholdLoss) revert NotLiquidatable();

        uint64 bounty_6 = uint64((uint256(p.collateralUSDC_6) * LIQUIDATOR_BOUNTY_BPS) / 10_000);

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            if (bounty_6 > 0) {
                if (crossBalanceUSDC_6[p.owner] >= bounty_6) {
                    crossBalanceUSDC_6[p.owner] -= bounty_6;
                    USDC.safeTransfer(msg.sender, bounty_6);
                }
            }
        } else if (bounty_6 > 0) {
            USDC.safeTransfer(msg.sender, bounty_6);
        }

        emit PositionLiquidated(tradeId, p.owner, msg.sender, uint128(markPrice_E18), bounty_6);
    }

    function increaseCollateral(uint256 tradeId, uint64 amountUSDC_6) external nonReentrant {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amountUSDC_6 == 0) revert CollateralTooSmall();

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            uint256 free = crossFreeBalance(msg.sender);
            if (free < amountUSDC_6) revert InsufficientCrossBalance();
            crossLockedUSDC_6[msg.sender] += amountUSDC_6;
        } else {
            USDC.safeTransferFrom(msg.sender, address(this), amountUSDC_6);
        }

        p.collateralUSDC_6 += amountUSDC_6;
        emit CollateralAdded(tradeId, msg.sender, amountUSDC_6);
    }

    function decreaseCollateral(uint256 tradeId, uint64 amountUSDC_6, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (amountUSDC_6 == 0) revert CollateralTooSmall();
        if (amountUSDC_6 >= p.collateralUSDC_6) revert CollateralTooSmall();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[p.pairIndex], pythUpdateData);

        uint64 newCollateral_6 = p.collateralUSDC_6 - amountUSDC_6;
        if (uint256(p.originalNotional_6) > MAX_LEVERAGE * uint256(newCollateral_6)) revert LeverageWouldExceedMax();

        int256 pnl_6 = PerpsMath.computePnL(newCollateral_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong);
        int256 thresholdLoss = -int256((uint256(newCollateral_6) * LIQUIDATION_THRESHOLD_BPS) / 10_000);
        if (pnl_6 <= thresholdLoss) revert NotLiquidatable();

        p.collateralUSDC_6 = newCollateral_6;

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= amountUSDC_6;
        } else {
            USDC.safeTransfer(p.owner, amountUSDC_6);
        }

        emit CollateralRemoved(tradeId, msg.sender, amountUSDC_6);
    }

    function setTriggers(uint256 tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18) external {
        Position storage p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        if (p.isLong) {
            if (takeProfit_E18 != 0 && takeProfit_E18 <= p.entryPrice_E18) revert InvalidTrigger();
            if (stopLoss_E18 != 0 && stopLoss_E18 >= p.entryPrice_E18) revert InvalidTrigger();
        } else {
            if (takeProfit_E18 != 0 && takeProfit_E18 >= p.entryPrice_E18) revert InvalidTrigger();
            if (stopLoss_E18 != 0 && stopLoss_E18 <= p.entryPrice_E18) revert InvalidTrigger();
        }

        p.takeProfit_E18 = takeProfit_E18;
        p.stopLoss_E18 = stopLoss_E18;

        emit TriggersSet(tradeId, takeProfit_E18, stopLoss_E18);
    }

    function closeIfTriggered(uint256 tradeId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[p.pairIndex], pythUpdateData);

        bool tpHit;
        bool slHit;
        if (p.isLong) {
            tpHit = p.takeProfit_E18 != 0 && markPrice_E18 >= p.takeProfit_E18;
            slHit = p.stopLoss_E18 != 0 && markPrice_E18 <= p.stopLoss_E18;
        } else {
            tpHit = p.takeProfit_E18 != 0 && markPrice_E18 <= p.takeProfit_E18;
            slHit = p.stopLoss_E18 != 0 && markPrice_E18 >= p.stopLoss_E18;
        }
        if (!tpHit && !slHit) revert TriggerNotHit();

        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(
            p.collateralUSDC_6,
            p.leverage,
            p.entryPrice_E18,
            markPrice_E18,
            p.isLong
        );

        uint64 keeperBounty_6 = payout_6 == 0 ? 0 : uint64((uint256(payout_6) * KEEPER_BOUNTY_BPS) / 10_000);
        uint64 traderPayout_6 = payout_6 - keeperBounty_6;

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            crossBalanceUSDC_6[p.owner] += traderPayout_6;
            if (keeperBounty_6 > 0 && crossBalanceUSDC_6[p.owner] >= keeperBounty_6) {
                crossBalanceUSDC_6[p.owner] -= keeperBounty_6;
                USDC.safeTransfer(msg.sender, keeperBounty_6);
            }
        } else {
            if (USDC.balanceOf(address(this)) < uint256(traderPayout_6) + uint256(keeperBounty_6) + feeBalance) {
                revert InsufficientPool();
            }
            if (traderPayout_6 > 0) USDC.safeTransfer(p.owner, traderPayout_6);
            if (keeperBounty_6 > 0) USDC.safeTransfer(msg.sender, keeperBounty_6);
        }

        emit TriggerFired(tradeId, p.owner, msg.sender, tpHit, uint128(markPrice_E18), keeperBounty_6);
        emit PositionClosed(tradeId, p.owner, p.pairIndex, uint128(markPrice_E18), pnl_6, traderPayout_6, closeFee_6);
    }

    function placeConditionalOrder(PlaceConditionalOrderParams calldata p) external nonReentrant returns (uint256 orderId) {
        if (pairFeedId[p.pairIndex] == bytes32(0)) revert PairNotRegistered();
        if (!pairTradable[p.pairIndex]) revert PairNotTradable();
        if (p.leverage == 0 || p.leverage > MAX_LEVERAGE) revert LeverageOutOfRange();
        if (p.marginMode > uint8(MarginMode.CROSS)) revert InvalidMarginMode();
        if (p.triggerKind > uint8(TriggerKind.STOP)) revert InvalidTrigger();
        if (p.triggerPrice_E18 == 0) revert InvalidTrigger();

        if (p.reduceOnly) {
            if (p.reduceBps == 0 || p.reduceBps > FRACTION_BPS_DENOM) revert FractionInvalid();
        } else {
            if (p.collateralUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();
        }

        if (!p.reduceOnly) {
            if (p.marginMode == uint8(MarginMode.CROSS)) {
                if (crossFreeBalance(msg.sender) < p.collateralUSDC_6) revert InsufficientCrossBalance();
            } else {
                USDC.safeTransferFrom(msg.sender, address(this), p.collateralUSDC_6);
            }
        }

        orderId = nextOrderId++;
        conditionalOrders[orderId] = ConditionalOrder({
            owner: msg.sender,
            pairIndex: p.pairIndex,
            isLong: p.isLong,
            leverage: p.leverage,
            marginMode: p.marginMode,
            triggerKind: p.triggerKind,
            reduceOnly: p.reduceOnly,
            reduceBps: p.reduceBps,
            collateralUSDC_6: p.collateralUSDC_6,
            triggerPrice_E18: p.triggerPrice_E18,
            createdAt: uint64(block.timestamp),
            active: true
        });
        _addToOrderIndex(msg.sender, orderId);

        emit ConditionalOrderPlaced(
            orderId,
            msg.sender,
            p.pairIndex,
            p.isLong,
            p.triggerKind,
            p.marginMode,
            p.reduceOnly,
            p.reduceBps,
            p.triggerPrice_E18,
            p.collateralUSDC_6,
            p.leverage
        );
    }

    function cancelConditionalOrder(uint256 orderId) external nonReentrant {
        ConditionalOrder memory o = conditionalOrders[orderId];
        if (o.owner == address(0)) revert OrderNotFound();
        if (!o.active) revert OrderNotActive();
        if (o.owner != msg.sender) revert OrderNotOwner();

        delete conditionalOrders[orderId];
        _removeFromOrderIndex(msg.sender, orderId);

        if (!o.reduceOnly && o.collateralUSDC_6 > 0) {
            if (o.marginMode == uint8(MarginMode.CROSS)) {
                // Nothing was locked from cross here, only checked at place time.
            } else {
                USDC.safeTransfer(msg.sender, o.collateralUSDC_6);
            }
        }

        emit ConditionalOrderCancelled(orderId, msg.sender);
    }

    function executeConditionalOrder(uint256 orderId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        ConditionalOrder memory o = conditionalOrders[orderId];
        if (o.owner == address(0)) revert OrderNotFound();
        if (!o.active) revert OrderNotActive();

        uint256 markPrice_E18 = _extractPrice(pairFeedId[o.pairIndex], pythUpdateData);

        bool triggered = _isOrderTriggered(o, markPrice_E18);
        if (!triggered) revert OrderNotTriggered();

        delete conditionalOrders[orderId];
        _removeFromOrderIndex(o.owner, orderId);

        uint256 linkedTradeId;

        if (o.reduceOnly) {
            linkedTradeId = _executeReduceOnlyOrder(o, markPrice_E18);
        } else {
            linkedTradeId = _executeOpeningOrder(o, markPrice_E18);
        }

        emit ConditionalOrderExecuted(orderId, o.owner, linkedTradeId, uint128(markPrice_E18));
    }

    function getTraderTrades(address trader) external view returns (uint256[] memory) {
        return _traderTrades[trader];
    }

    function getTraderOrders(address trader) external view returns (uint256[] memory) {
        return _traderOrders[trader];
    }

    function getPosition(uint256 tradeId) external view returns (Position memory) {
        return positions[tradeId];
    }

    function crossFreeBalance(address trader) public view returns (uint256) {
        uint256 total = crossBalanceUSDC_6[trader];
        uint256 locked = crossLockedUSDC_6[trader];
        return total > locked ? total - locked : 0;
    }

    function quoteUnrealisedPnL(uint256 tradeId) external view returns (int256 pnl_6, uint256 markPrice_E18) {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) return (0, 0);

        IPyth.Price memory pp = PYTH.getPriceNoOlderThan(pairFeedId[p.pairIndex], PYTH_MAX_AGE_SECONDS);
        markPrice_E18 = PerpsMath.normalisePythPrice(pp.price, pp.expo);
        pnl_6 = PerpsMath.computePnL(p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong);
    }

    function poolBalance() external view returns (uint256) {
        uint256 liabilities = feeBalance;
        return USDC.balanceOf(address(this)) > liabilities ? USDC.balanceOf(address(this)) - liabilities : 0;
    }

    function effectiveLeverage(uint256 tradeId) external view returns (uint256) {
        Position memory p = positions[tradeId];
        if (p.owner == address(0) || p.collateralUSDC_6 == 0) return 0;
        return uint256(p.originalNotional_6) / uint256(p.collateralUSDC_6);
    }

    function _executeOpeningOrder(ConditionalOrder memory o, uint256 markPrice_E18) internal returns (uint256 tradeId) {
        if (o.marginMode == uint8(MarginMode.CROSS)) {
            uint256 free = crossFreeBalance(o.owner);
            if (free < o.collateralUSDC_6) revert InsufficientCrossBalance();
            crossLockedUSDC_6[o.owner] += o.collateralUSDC_6;
        }

        uint256 openFee = uint256(o.collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS);
        feeBalance += openFee;

        uint64 effectiveCollateral_6 = uint64(uint256(o.collateralUSDC_6) - openFee);
        if (o.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[o.owner] -= openFee;
            crossBalanceUSDC_6[o.owner] -= openFee;
        }

        tradeId = nextTradeId++;
        positions[tradeId] = Position({
            owner: o.owner,
            pairIndex: o.pairIndex,
            isLong: o.isLong,
            leverage: o.leverage,
            marginMode: o.marginMode,
            collateralUSDC_6: effectiveCollateral_6,
            entryPrice_E18: uint128(markPrice_E18),
            openedAt: uint64(block.timestamp),
            takeProfit_E18: 0,
            stopLoss_E18: 0,
            originalNotional_6: uint128(uint256(effectiveCollateral_6) * uint256(o.leverage))
        });

        _addToTraderIndex(o.owner, tradeId);

        emit PositionOpened(
            tradeId,
            o.owner,
            o.pairIndex,
            o.isLong,
            o.leverage,
            o.marginMode,
            effectiveCollateral_6,
            uint128(markPrice_E18)
        );
    }

    function _executeReduceOnlyOrder(ConditionalOrder memory o, uint256 markPrice_E18) internal returns (uint256 tradeId) {
        tradeId = _findTraderPosition(o.owner, o.pairIndex, o.isLong);
        if (tradeId == 0) revert ReduceOnlyNoPosition();

        Position memory p = positions[tradeId];
        uint16 fractionBps = o.reduceBps;
        if (fractionBps == 0 || fractionBps > FRACTION_BPS_DENOM) revert FractionInvalid();

        if (fractionBps == FRACTION_BPS_DENOM) {
            _settleAndClose(tradeId, p, markPrice_E18, 0, o.owner);
            return tradeId;
        }

        uint64 closingCollateral_6 = uint64((uint256(p.collateralUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);
        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(closingCollateral_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong);

        positions[tradeId].collateralUSDC_6 = p.collateralUSDC_6 - closingCollateral_6;

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= closingCollateral_6;
            crossBalanceUSDC_6[p.owner] += payout_6;
        } else if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < uint256(payout_6) + feeBalance) revert InsufficientPool();
            USDC.safeTransfer(p.owner, payout_6);
        }

        emit PositionPartiallyClosed(tradeId, p.owner, fractionBps, uint128(markPrice_E18), pnl_6, payout_6, closeFee_6);
    }

    function _isOrderTriggered(ConditionalOrder memory o, uint256 markPrice_E18) internal pure returns (bool) {
        if (o.triggerKind == uint8(TriggerKind.LIMIT)) {
            return o.isLong ? (markPrice_E18 <= o.triggerPrice_E18) : (markPrice_E18 >= o.triggerPrice_E18);
        }
        return o.isLong ? (markPrice_E18 >= o.triggerPrice_E18) : (markPrice_E18 <= o.triggerPrice_E18);
    }

    function _findTraderPosition(address trader, uint16 pairIndex, bool isLong) internal view returns (uint256) {
        uint256[] storage ids = _traderTrades[trader];
        for (uint256 i = 0; i < ids.length; i++) {
            Position memory p = positions[ids[i]];
            if (p.owner == trader && p.pairIndex == pairIndex && p.isLong == isLong) return ids[i];
        }
        return 0;
    }

    function _computeCloseTerms(
        uint64 collateral_6,
        uint16 leverage,
        uint128 entry_E18,
        uint256 mark_E18,
        bool isLong
    ) internal returns (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) {
        pnl_6 = PerpsMath.computePnL(collateral_6, leverage, entry_E18, mark_E18, isLong);

        int256 minPnl = -int256(uint256(collateral_6));
        if (pnl_6 < minPnl) pnl_6 = minPnl;

        int256 grossPayout_6 = int256(uint256(collateral_6)) + pnl_6;
        if (grossPayout_6 <= 0) {
            payout_6 = 0;
            closeFee_6 = 0;
            return (pnl_6, payout_6, closeFee_6);
        }

        uint256 fee = uint256(grossPayout_6).applyBpsFee(CLOSE_FEE_BPS);
        closeFee_6 = uint64(fee);
        payout_6 = uint64(uint256(grossPayout_6) - fee);
        feeBalance += fee;
    }

    function _settleAndClose(
        uint256 tradeId,
        Position memory p,
        uint256 markPrice_E18,
        uint64 extraReceiver_6,
        address payoutOwner
    ) internal {
        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(
            p.collateralUSDC_6,
            p.leverage,
            p.entryPrice_E18,
            markPrice_E18,
            p.isLong
        );

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            crossBalanceUSDC_6[p.owner] += payout_6;
        } else if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < uint256(payout_6) + uint256(extraReceiver_6) + feeBalance) {
                revert InsufficientPool();
            }
            USDC.safeTransfer(payoutOwner, payout_6);
        }

        emit PositionClosed(tradeId, payoutOwner, p.pairIndex, uint128(markPrice_E18), pnl_6, payout_6, closeFee_6);
    }

    /**
     * @notice Extract the price for `feedId` directly from the VAA blob.
     *         Uses parsePriceFeedUpdates — does NOT depend on the on-chain cache.
     *         This is the V3.1 fix: updatePriceFeeds() silently no-ops when the
     *         incoming publishTime <= cached publishTime on testnet, causing
     *         _readPrice() to return a stale near-zero value.  parsePriceFeedUpdates()
     *         always returns the price embedded in the blob itself.
     */
    function _extractPrice(
        bytes32 feedId,
        bytes[] calldata updateData
    ) internal returns (uint256 price_E18) {
        uint256 fee = PYTH.getUpdateFee(updateData);
        if (msg.value != fee) revert PythFeeMismatch();

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = feedId;

        // minPublishTime: must be no older than PYTH_MAX_AGE_SECONDS
        // maxPublishTime: no upper bound
        uint64 minPub = uint64(block.timestamp - PYTH_MAX_AGE_SECONDS);
        uint64 maxPub = type(uint64).max;

        IPythV2.PriceFeed[] memory feeds = PYTH.parsePriceFeedUpdates{value: fee}(
            updateData, ids, minPub, maxPub
        );

        require(feeds.length == 1 && feeds[0].id == feedId, "Pyth: feed not found in blob");
        price_E18 = PerpsMath.normalisePythPrice(feeds[0].price.price, feeds[0].price.expo);
    }

    function _addToTraderIndex(address trader, uint256 tradeId) internal {
        _traderTradeIndex[trader][tradeId] = _traderTrades[trader].length;
        _traderTrades[trader].push(tradeId);
    }

    function _removeFromTraderIndex(address trader, uint256 tradeId) internal {
        uint256 idx = _traderTradeIndex[trader][tradeId];
        uint256 lastIdx = _traderTrades[trader].length - 1;

        if (idx != lastIdx) {
            uint256 lastId = _traderTrades[trader][lastIdx];
            _traderTrades[trader][idx] = lastId;
            _traderTradeIndex[trader][lastId] = idx;
        }

        _traderTrades[trader].pop();
        delete _traderTradeIndex[trader][tradeId];
    }

    function _addToOrderIndex(address trader, uint256 orderId) internal {
        _traderOrderIndex[trader][orderId] = _traderOrders[trader].length;
        _traderOrders[trader].push(orderId);
    }

    function _removeFromOrderIndex(address trader, uint256 orderId) internal {
        uint256 idx = _traderOrderIndex[trader][orderId];
        uint256 lastIdx = _traderOrders[trader].length - 1;

        if (idx != lastIdx) {
            uint256 lastId = _traderOrders[trader][lastIdx];
            _traderOrders[trader][idx] = lastId;
            _traderOrderIndex[trader][lastId] = idx;
        }

        _traderOrders[trader].pop();
        delete _traderOrderIndex[trader][orderId];
    }
}
