// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPyth} from "./interfaces/IPyth.sol";
import {PerpsMath} from "./libraries/PerpsMath.sol";

/**
 * @title VeloPerps
 * @author Velo
 * @notice Minimal oracle-priced perpetual futures contract on Base Sepolia.
 *
 * Every state change is verifiable on-chain. No off-chain matching, no admin
 * price manipulation. The only trust assumption is Pyth itself.
 *
 * Risk model for v1:
 *   - No insurance fund. Pool can go insolvent if cumulative wins > reserves.
 *     Testnet acceptable. Mainnet needs per-pair OI caps + insurance fund + audit.
 *   - No funding rate. Mark = oracle exactly. v2.
 *   - Cross-margin not supported. Each trade is isolated.
 *
 * THIS CONTRACT IS NOT AUDITED. Do NOT deploy to mainnet without an audit.
 */
contract VeloPerps is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PerpsMath for uint256;

    // ─── Constants ─────────────────────────────────────────────────────────
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant LIQUIDATION_THRESHOLD_BPS = 9_000; // 90% loss = liquidatable
    uint256 public constant LIQUIDATOR_BOUNTY_BPS = 100;       //  1% of collateral
    uint256 public constant OPEN_FEE_BPS = 10;                 // 0.10% open
    uint256 public constant CLOSE_FEE_BPS = 10;                // 0.10% close
    uint256 public constant MIN_COLLATERAL_USDC_6 = 1e6;       // 1 USDC minimum
    uint256 public constant PYTH_MAX_AGE_SECONDS = 60;         // refuse data > 60s old

    // ─── Plumbing ──────────────────────────────────────────────────────────
    IERC20 public immutable USDC;
    IPyth  public immutable PYTH;

    // ─── Pair registry ─────────────────────────────────────────────────────
    mapping(uint16 => bytes32) public pairFeedId;
    mapping(uint16 => string)  public pairLabel;
    mapping(uint16 => bool)    public pairTradable;

    // ─── Position state ────────────────────────────────────────────────────
    struct Position {
        address owner;
        uint16  pairIndex;
        bool    isLong;
        uint16  leverage;
        uint64  collateralUSDC_6;
        uint128 entryPrice_E18;
        uint64  openedAt;
    }

    uint256 public nextTradeId = 1;
    mapping(uint256 => Position) public positions;

    // Reverse index for "all open trades for trader X". Frontends iterate this.
    mapping(address => uint256[]) private _traderTrades;
    mapping(address => mapping(uint256 => uint256)) private _traderTradeIndex;

    // ─── Accounting ────────────────────────────────────────────────────────
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
    //  TRADING
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
            openedAt:         uint64(block.timestamp)
        });

        _addToTraderIndex(msg.sender, tradeId);

        emit PositionOpened(
            tradeId, msg.sender, pairIndex, isLong, leverage,
            effectiveCollateral_6, uint128(markPrice_E18)
        );
    }

    function closePosition(uint256 tradeId, bytes[] calldata pythUpdateData)
        external payable nonReentrant
    {
        Position memory p = positions[tradeId];
        if (p.owner == address(0)) revert PositionNotFound();
        if (p.owner != msg.sender) revert NotPositionOwner();

        _pushPythUpdate(pythUpdateData);
        uint256 markPrice_E18 = _readPrice(pairFeedId[p.pairIndex]);

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
            if (USDC.balanceOf(address(this)) < payout_6 + feeBalance) revert InsufficientPool();
            USDC.safeTransfer(p.owner, payout_6);
        }

        emit PositionClosed(
            tradeId, p.owner, p.pairIndex,
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
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════════════

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
