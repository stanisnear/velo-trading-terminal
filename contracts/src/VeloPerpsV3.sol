// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPyth} from "./interfaces/IPyth.sol";
import {PerpsMath} from "./libraries/PerpsMath.sol";

contract VeloPerpsV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PerpsMath for uint256;

    uint16 public constant VERSION = 3;

    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 9_000;
    uint256 public constant LIQUIDATOR_BOUNTY_BPS = 100;
    uint256 public constant OPEN_FEE_BPS = 10;
    uint256 public constant CLOSE_FEE_BPS = 10;
    uint256 public constant KEEPER_BOUNTY_BPS = 25;
    uint256 public constant MIN_COLLATERAL_USDC_6 = 1e6;
    uint256 public constant FRACTION_BPS_DENOM = 10_000;
    uint256 public constant PYTH_MAX_AGE_SECONDS = 60;
    int256 private constant ONE_E18 = 1e18;

    IERC20 public immutable USDC;
    IPyth public immutable PYTH;

    enum MarginMode { ISOLATED, CROSS }
    enum TriggerKind { LIMIT, STOP }

    struct Position {
        address owner;
        uint16 pairIndex;
        bool isLong;
        uint16 leverage;
        uint8 marginMode;
        uint64 collateralUSDC_6;
        uint128 notionalUSDC_6;
        uint128 entryPrice_E18;
        int128 fundingEntry_E18;
        uint64 openedAt;
        uint128 takeProfit_E18;
        uint128 stopLoss_E18;
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

    struct PairRisk {
        uint128 maxNotionalUSDC_6;
        int64 fundingRateBpsPerHour;
        uint64 lastFundingTs;
        int128 fundingIndexLong_E18;
        int128 fundingIndexShort_E18;
        uint128 oiLongUSDC_6;
        uint128 oiShortUSDC_6;
    }

    mapping(uint16 => bytes32) public pairFeedId;
    mapping(uint16 => string) public pairLabel;
    mapping(uint16 => bool) public pairTradable;
    mapping(uint16 => PairRisk) public pairRisk;

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
    event PairRiskUpdated(uint16 indexed pairIndex, uint128 maxNotionalUSDC_6, int64 fundingRateBpsPerHour);
    event FundingAccrued(uint16 indexed pairIndex, int128 longIndex_E18, int128 shortIndex_E18, uint64 ts);

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
    error PairLiquidityExceeded();

    constructor(IERC20 usdc, IPyth pyth, address initialOwner) Ownable(initialOwner) {
        USDC = usdc;
        PYTH = pyth;
    }

    function registerPair(uint16 pairIndex, bytes32 feedId, string calldata label) external onlyOwner {
        pairFeedId[pairIndex] = feedId;
        pairLabel[pairIndex] = label;
        pairTradable[pairIndex] = true;
        if (pairRisk[pairIndex].maxNotionalUSDC_6 == 0) {
            pairRisk[pairIndex].maxNotionalUSDC_6 = type(uint128).max;
        }
        if (pairRisk[pairIndex].lastFundingTs == 0) {
            pairRisk[pairIndex].lastFundingTs = uint64(block.timestamp);
        }
        emit PairRegistered(pairIndex, feedId, label);
        emit PairTradable(pairIndex, true);
    }

    function setPairTradable(uint16 pairIndex, bool tradable) external onlyOwner {
        if (pairFeedId[pairIndex] == bytes32(0)) revert PairNotRegistered();
        pairTradable[pairIndex] = tradable;
        emit PairTradable(pairIndex, tradable);
    }

    function setPairRisk(uint16 pairIndex, uint128 maxNotionalUSDC_6, int64 fundingRateBpsPerHour) external onlyOwner {
        if (pairFeedId[pairIndex] == bytes32(0)) revert PairNotRegistered();
        _accrueFunding(pairIndex);
        pairRisk[pairIndex].maxNotionalUSDC_6 = maxNotionalUSDC_6 == 0 ? type(uint128).max : maxNotionalUSDC_6;
        pairRisk[pairIndex].fundingRateBpsPerHour = fundingRateBpsPerHour;
        emit PairRiskUpdated(pairIndex, pairRisk[pairIndex].maxNotionalUSDC_6, fundingRateBpsPerHour);
    }

    function accrueFunding(uint16 pairIndex) external {
        _accrueFunding(pairIndex);
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
        if (pairFeedId[pairIndex] == bytes32(0)) revert PairNotRegistered();
        if (!pairTradable[pairIndex]) revert PairNotTradable();
        if (leverage == 0 || leverage > MAX_LEVERAGE) revert LeverageOutOfRange();
        if (collateralUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();
        if (marginMode > uint8(MarginMode.CROSS)) revert InvalidMarginMode();

        _accrueFunding(pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[pairIndex]);

        if (marginMode == uint8(MarginMode.ISOLATED)) {
            USDC.safeTransferFrom(msg.sender, address(this), collateralUSDC_6);
        } else {
            if (crossFreeBalance(msg.sender) < collateralUSDC_6) revert InsufficientCrossBalance();
            crossLockedUSDC_6[msg.sender] += collateralUSDC_6;
        }

        uint256 openFee = uint256(collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS);
        feeBalance += openFee;

        uint64 effectiveCollateral_6 = uint64(uint256(collateralUSDC_6) - openFee);
        uint128 notional_6 = uint128(uint256(effectiveCollateral_6) * uint256(leverage));

        if (marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[msg.sender] -= openFee;
            crossBalanceUSDC_6[msg.sender] -= openFee;
        }

        _increaseOI(pairIndex, isLong, notional_6);

        tradeId = nextTradeId++;
        positions[tradeId] = Position({
            owner: msg.sender,
            pairIndex: pairIndex,
            isLong: isLong,
            leverage: leverage,
            marginMode: marginMode,
            collateralUSDC_6: effectiveCollateral_6,
            notionalUSDC_6: notional_6,
            entryPrice_E18: uint128(markPrice_E18),
            fundingEntry_E18: isLong ? pairRisk[pairIndex].fundingIndexLong_E18 : pairRisk[pairIndex].fundingIndexShort_E18,
            openedAt: uint64(block.timestamp),
            takeProfit_E18: 0,
            stopLoss_E18: 0
        });

        _addToTraderIndex(msg.sender, tradeId);

        emit PositionOpened(tradeId, msg.sender, pairIndex, isLong, leverage, marginMode, effectiveCollateral_6, uint128(markPrice_E18));
    }

    function closePosition(uint256 tradeId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        _accrueFunding(p.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        _settleAndClose(tradeId, p, markPrice_E18, 0, msg.sender);
    }

    function partialClose(uint256 tradeId, uint16 fractionBps, bytes[] calldata pythUpdateData) external payable nonReentrant {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();
        if (fractionBps == 0 || fractionBps > FRACTION_BPS_DENOM) revert FractionInvalid();

        _accrueFunding(p.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        if (fractionBps == FRACTION_BPS_DENOM) {
            _settleAndClose(tradeId, p, markPrice_E18, 0, msg.sender);
            return;
        }

        uint64 closingCollateral_6 = uint64((uint256(p.collateralUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);
        uint128 closingNotional_6 = uint128((uint256(p.notionalUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);

        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(
            closingCollateral_6,
            closingNotional_6,
            p.entryPrice_E18,
            p.fundingEntry_E18,
            markPrice_E18,
            p.isLong,
            p.pairIndex
        );

        positions[tradeId].collateralUSDC_6 = p.collateralUSDC_6 - closingCollateral_6;
        positions[tradeId].notionalUSDC_6 = p.notionalUSDC_6 - closingNotional_6;

        _decreaseOI(p.pairIndex, p.isLong, closingNotional_6);

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

        _accrueFunding(p.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        int256 pnl_6 = PerpsMath.computePnL(p.collateralUSDC_6, p.leverage, p.entryPrice_E18, markPrice_E18, p.isLong);
        int256 thresholdLoss = -int256((uint256(p.collateralUSDC_6) * LIQUIDATION_THRESHOLD_BPS) / 10_000);
        if (pnl_6 > thresholdLoss) revert NotLiquidatable();

        uint64 bounty_6 = uint64((uint256(p.collateralUSDC_6) * LIQUIDATOR_BOUNTY_BPS) / 10_000);

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];
        _decreaseOI(p.pairIndex, p.isLong, p.notionalUSDC_6);

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            if (bounty_6 > 0 && crossBalanceUSDC_6[p.owner] >= bounty_6) {
                crossBalanceUSDC_6[p.owner] -= bounty_6;
                USDC.safeTransfer(msg.sender, bounty_6);
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
            if (crossFreeBalance(msg.sender) < amountUSDC_6) revert InsufficientCrossBalance();
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
        if (amountUSDC_6 == 0 || amountUSDC_6 >= p.collateralUSDC_6) revert CollateralTooSmall();

        _accrueFunding(p.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

        uint64 newCollateral_6 = p.collateralUSDC_6 - amountUSDC_6;
        if (uint256(p.notionalUSDC_6) > MAX_LEVERAGE * uint256(newCollateral_6)) revert LeverageWouldExceedMax();

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

        _accrueFunding(p.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

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
            p.notionalUSDC_6,
            p.entryPrice_E18,
            p.fundingEntry_E18,
            markPrice_E18,
            p.isLong,
            p.pairIndex
        );

        uint64 keeperBounty_6 = payout_6 == 0 ? 0 : uint64((uint256(payout_6) * KEEPER_BOUNTY_BPS) / 10_000);
        uint64 traderPayout_6 = payout_6 - keeperBounty_6;

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];
        _decreaseOI(p.pairIndex, p.isLong, p.notionalUSDC_6);

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            crossBalanceUSDC_6[p.owner] += traderPayout_6;
            if (keeperBounty_6 > 0 && crossBalanceUSDC_6[p.owner] >= keeperBounty_6) {
                crossBalanceUSDC_6[p.owner] -= keeperBounty_6;
                USDC.safeTransfer(msg.sender, keeperBounty_6);
            }
        } else {
            if (USDC.balanceOf(address(this)) < uint256(traderPayout_6) + uint256(keeperBounty_6) + feeBalance) revert InsufficientPool();
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
        if (p.triggerKind > uint8(TriggerKind.STOP) || p.triggerPrice_E18 == 0) revert InvalidTrigger();

        if (p.reduceOnly) {
            if (p.reduceBps == 0 || p.reduceBps > FRACTION_BPS_DENOM) revert FractionInvalid();
        } else {
            if (p.collateralUSDC_6 < MIN_COLLATERAL_USDC_6) revert CollateralTooSmall();
            uint64 estEffCollateral_6 = uint64(uint256(p.collateralUSDC_6) - uint256(p.collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS));
            uint128 estNotional_6 = uint128(uint256(estEffCollateral_6) * uint256(p.leverage));
            _checkPairLiquidity(p.pairIndex, p.isLong, estNotional_6);
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

        emit ConditionalOrderPlaced(orderId, msg.sender, p.pairIndex, p.isLong, p.triggerKind, p.marginMode, p.reduceOnly, p.reduceBps, p.triggerPrice_E18, p.collateralUSDC_6, p.leverage);
    }

    function cancelConditionalOrder(uint256 orderId) external nonReentrant {
        ConditionalOrder memory o = conditionalOrders[orderId];
        if (o.owner == address(0)) revert OrderNotFound();
        if (!o.active) revert OrderNotActive();
        if (o.owner != msg.sender) revert OrderNotOwner();

        delete conditionalOrders[orderId];
        _removeFromOrderIndex(msg.sender, orderId);

        if (!o.reduceOnly && o.collateralUSDC_6 > 0 && o.marginMode == uint8(MarginMode.ISOLATED)) {
            USDC.safeTransfer(msg.sender, o.collateralUSDC_6);
        }

        emit ConditionalOrderCancelled(orderId, msg.sender);
    }

    function executeConditionalOrder(uint256 orderId, bytes[] calldata pythUpdateData) external payable nonReentrant {
        ConditionalOrder memory o = conditionalOrders[orderId];
        if (o.owner == address(0)) revert OrderNotFound();
        if (!o.active) revert OrderNotActive();

        _accrueFunding(o.pairIndex);
        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[o.pairIndex]);

        if (!_isOrderTriggered(o, markPrice_E18)) revert OrderNotTriggered();

        delete conditionalOrders[orderId];
        _removeFromOrderIndex(o.owner, orderId);

        uint256 linkedTradeId = o.reduceOnly ? _executeReduceOnlyOrder(o, markPrice_E18) : _executeOpeningOrder(o, markPrice_E18);
        emit ConditionalOrderExecuted(orderId, o.owner, linkedTradeId, uint128(markPrice_E18));
    }

    function getTraderTrades(address trader) external view returns (uint256[] memory) { return _traderTrades[trader]; }
    function getTraderOrders(address trader) external view returns (uint256[] memory) { return _traderOrders[trader]; }
    function getPosition(uint256 tradeId) external view returns (Position memory) { return positions[tradeId]; }

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
        pnl_6 -= _fundingPayment(p.notionalUSDC_6, p.fundingEntry_E18, p.isLong, p.pairIndex);
    }

    function quoteFundingPayment(uint256 tradeId) external view returns (int256 fundingUSDC_6) {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) return 0;
        fundingUSDC_6 = _fundingPayment(p.notionalUSDC_6, p.fundingEntry_E18, p.isLong, p.pairIndex);
    }

    function poolBalance() external view returns (uint256) {
        uint256 liabilities = feeBalance;
        return USDC.balanceOf(address(this)) > liabilities ? USDC.balanceOf(address(this)) - liabilities : 0;
    }

    function effectiveLeverage(uint256 tradeId) external view returns (uint256) {
        Position memory p = positions[tradeId];
        if (p.owner == address(0) || p.collateralUSDC_6 == 0) return 0;
        return uint256(p.notionalUSDC_6) / uint256(p.collateralUSDC_6);
    }

    function _executeOpeningOrder(ConditionalOrder memory o, uint256 markPrice_E18) internal returns (uint256 tradeId) {
        uint256 openFee = uint256(o.collateralUSDC_6).applyBpsFee(OPEN_FEE_BPS);
        uint64 effectiveCollateral_6 = uint64(uint256(o.collateralUSDC_6) - openFee);
        uint128 notional_6 = uint128(uint256(effectiveCollateral_6) * uint256(o.leverage));
        _checkPairLiquidity(o.pairIndex, o.isLong, notional_6);

        if (o.marginMode == uint8(MarginMode.CROSS)) {
            if (crossFreeBalance(o.owner) < o.collateralUSDC_6) revert InsufficientCrossBalance();
            crossLockedUSDC_6[o.owner] += o.collateralUSDC_6;
            crossLockedUSDC_6[o.owner] -= openFee;
            crossBalanceUSDC_6[o.owner] -= openFee;
        }

        feeBalance += openFee;
        _increaseOI(o.pairIndex, o.isLong, notional_6);

        tradeId = nextTradeId++;
        positions[tradeId] = Position({
            owner: o.owner,
            pairIndex: o.pairIndex,
            isLong: o.isLong,
            leverage: o.leverage,
            marginMode: o.marginMode,
            collateralUSDC_6: effectiveCollateral_6,
            notionalUSDC_6: notional_6,
            entryPrice_E18: uint128(markPrice_E18),
            fundingEntry_E18: o.isLong ? pairRisk[o.pairIndex].fundingIndexLong_E18 : pairRisk[o.pairIndex].fundingIndexShort_E18,
            openedAt: uint64(block.timestamp),
            takeProfit_E18: 0,
            stopLoss_E18: 0
        });

        _addToTraderIndex(o.owner, tradeId);
        emit PositionOpened(tradeId, o.owner, o.pairIndex, o.isLong, o.leverage, o.marginMode, effectiveCollateral_6, uint128(markPrice_E18));
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
        uint128 closingNotional_6 = uint128((uint256(p.notionalUSDC_6) * fractionBps) / FRACTION_BPS_DENOM);

        (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) = _computeCloseTerms(
            closingCollateral_6,
            closingNotional_6,
            p.entryPrice_E18,
            p.fundingEntry_E18,
            markPrice_E18,
            p.isLong,
            p.pairIndex
        );

        positions[tradeId].collateralUSDC_6 = p.collateralUSDC_6 - closingCollateral_6;
        positions[tradeId].notionalUSDC_6 = p.notionalUSDC_6 - closingNotional_6;
        _decreaseOI(p.pairIndex, p.isLong, closingNotional_6);

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
        uint128 notional_6,
        uint128 entry_E18,
        int128 fundingEntry_E18,
        uint256 mark_E18,
        bool isLong,
        uint16 pairIndex
    ) internal returns (int256 pnl_6, uint64 payout_6, uint64 closeFee_6) {
        uint16 leverage = uint16(uint256(notional_6) / uint256(collateral_6));
        pnl_6 = PerpsMath.computePnL(collateral_6, leverage, entry_E18, mark_E18, isLong);
        pnl_6 -= _fundingPayment(notional_6, fundingEntry_E18, isLong, pairIndex);

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
            p.notionalUSDC_6,
            p.entryPrice_E18,
            p.fundingEntry_E18,
            markPrice_E18,
            p.isLong,
            p.pairIndex
        );

        _removeFromTraderIndex(p.owner, tradeId);
        delete positions[tradeId];
        _decreaseOI(p.pairIndex, p.isLong, p.notionalUSDC_6);

        if (p.marginMode == uint8(MarginMode.CROSS)) {
            crossLockedUSDC_6[p.owner] -= p.collateralUSDC_6;
            crossBalanceUSDC_6[p.owner] += payout_6;
        } else if (payout_6 > 0) {
            if (USDC.balanceOf(address(this)) < uint256(payout_6) + uint256(extraReceiver_6) + feeBalance) revert InsufficientPool();
            USDC.safeTransfer(payoutOwner, payout_6);
        }

        emit PositionClosed(tradeId, payoutOwner, p.pairIndex, uint128(markPrice_E18), pnl_6, payout_6, closeFee_6);
    }

    function _fundingPayment(uint128 notionalUSDC_6, int128 fundingEntry_E18, bool isLong, uint16 pairIndex) internal view returns (int256) {
        int256 current = isLong ? int256(pairRisk[pairIndex].fundingIndexLong_E18) : int256(pairRisk[pairIndex].fundingIndexShort_E18);
        int256 delta = current - int256(fundingEntry_E18);
        return (int256(uint256(notionalUSDC_6)) * delta) / ONE_E18;
    }

    function _checkPairLiquidity(uint16 pairIndex, bool isLong, uint128 notionalToAdd_6) internal view {
        PairRisk memory r = pairRisk[pairIndex];
        uint256 oiSide = isLong ? r.oiLongUSDC_6 : r.oiShortUSDC_6;
        if (oiSide + notionalToAdd_6 > r.maxNotionalUSDC_6) revert PairLiquidityExceeded();
    }

    function _increaseOI(uint16 pairIndex, bool isLong, uint128 notional_6) internal {
        _checkPairLiquidity(pairIndex, isLong, notional_6);
        if (isLong) pairRisk[pairIndex].oiLongUSDC_6 += notional_6;
        else pairRisk[pairIndex].oiShortUSDC_6 += notional_6;
    }

    function _decreaseOI(uint16 pairIndex, bool isLong, uint128 notional_6) internal {
        if (isLong) {
            uint128 oi = pairRisk[pairIndex].oiLongUSDC_6;
            pairRisk[pairIndex].oiLongUSDC_6 = oi > notional_6 ? oi - notional_6 : 0;
        } else {
            uint128 oi = pairRisk[pairIndex].oiShortUSDC_6;
            pairRisk[pairIndex].oiShortUSDC_6 = oi > notional_6 ? oi - notional_6 : 0;
        }
    }

    function _accrueFunding(uint16 pairIndex) internal {
        PairRisk storage r = pairRisk[pairIndex];
        uint64 last = r.lastFundingTs;
        uint64 nowTs = uint64(block.timestamp);
        if (last == 0) {
            r.lastFundingTs = nowTs;
            return;
        }
        if (nowTs <= last) return;
        int64 rate = r.fundingRateBpsPerHour;
        if (rate == 0) {
            r.lastFundingTs = nowTs;
            return;
        }

        uint256 dt = uint256(nowTs - last);
        int256 delta = (int256(rate) * int256(dt) * ONE_E18) / int256(3600 * 10_000);

        // Positive rate => longs pay, shorts receive.
        r.fundingIndexLong_E18 += int128(delta);
        r.fundingIndexShort_E18 -= int128(delta);
        r.lastFundingTs = nowTs;

        emit FundingAccrued(pairIndex, r.fundingIndexLong_E18, r.fundingIndexShort_E18, nowTs);
    }

    function _pushPythUpdate(bytes[] calldata updateData) internal {
        uint256 fee = PYTH.getUpdateFee(updateData);
        if (msg.value != fee) revert PythFeeMismatch();
        PYTH.updatePriceFeeds{value: fee}(updateData);
    }

    function _readPrice(bytes32 feedId) internal view returns (uint256 price_E18) {
        IPyth.Price memory pp = PYTH.getPriceNoOlderThan(feedId, PYTH_MAX_AGE_SECONDS);
        price_E18 = PerpsMath.normalisePythPrice(pp.price, pp.expo);
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
