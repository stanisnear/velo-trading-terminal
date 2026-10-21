// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPythV2} from "./interfaces/IPythV2.sol";

/// @notice Isolated, fully reserved, protocol-owned-liquidity TESTNET engine.
/// @dev Not independently audited. No cross margin, LP shares, partial closes or margin edits.
contract VeloPerpsV4 is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant VERSION = 4;
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant OPEN_FEE_BPS = 10;
    uint256 public constant CLOSE_FEE_BPS = 10;
    uint256 public constant KEEPER_BOUNTY_BPS = 5;
    uint256 public constant MIN_COLLATERAL_USDC_6 = 1e6;
    uint256 public constant PYTH_MAX_AGE_SECONDS = 5;
    uint256 public constant MIN_HOLD_SECONDS = 2;
    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_ITEMS = 128;

    IERC20 public immutable USDC;
    IPythV2 public immutable PYTH;
    address public guardian;
    bool public entriesPaused = true;

    // USDC liabilities are disjoint. Direct token donations are not automatically liquidity.
    uint256 public poolAssets;
    uint256 public reservedProfit;
    uint256 public collateralEscrow;
    uint256 public orderEscrow;
    uint256 public feeBalance;

    struct MarketRisk {
        uint64 maxPositionUSDC_6;
        uint64 maxOpenInterestUSDC_6;
        uint64 maxBlockVolumeUSDC_6;
        uint16 maxLeverage;
        uint16 maintenanceBps;
        uint16 maxConfidenceBps;
        uint16 borrowBpsPerHour;
    }
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
    struct OpenParams {
        uint16 pairIndex;
        bool isLong;
        uint64 collateralUSDC_6;
        uint16 leverage;
        uint128 takeProfit_E18;
        uint128 stopLoss_E18;
        uint128 priceLimit_E18;
        uint64 deadline;
    }
    // Prefix/layout retained for historical readers; unsupported modes are always zero/false.
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
    struct OrderParams {
        OpenParams position;
        uint8 triggerKind; // 0 limit, 1 stop
        uint128 triggerPrice_E18;
    }
    struct Settlement {
        uint128 price;
        int256 pnl;
        uint64 payout;
        uint64 fee;
        uint64 bounty;
        uint64 borrowFee;
    }

    mapping(uint16 => bytes32) public pairFeedId;
    mapping(bytes32 => bool) public registeredFeed;
    mapping(uint16 => string) public pairLabel;
    mapping(uint16 => bool) public pairTradable;
    mapping(uint16 => MarketRisk) public marketRisk;
    mapping(uint16 => uint256) public openInterest;
    mapping(uint16 => uint256) public pendingOrderCount;
    mapping(uint16 => uint256) public lastPublishTime;
    mapping(uint16 => uint256) private _volumeBlock;
    mapping(uint16 => uint256) private _blockVolume;
    uint256 public nextTradeId = 1;
    uint256 public nextOrderId = 1;
    uint256 public openPositionCount;
    uint256 public activeOrderCount;
    mapping(uint256 => Position) public positions;
    mapping(uint256 => uint256) public positionOpenFee;
    mapping(uint256 => ConditionalOrder) public conditionalOrders;
    mapping(uint256 => OpenParams) public orderTerms;
    mapping(address => uint256[]) private _trades;
    mapping(address => uint256[]) private _orders;
    mapping(uint256 => uint256) private _tradeSlot;
    mapping(uint256 => uint256) private _orderSlot;

    event PairRegistered(uint16 indexed pairIndex, bytes32 feedId, string label);
    event PairTradable(uint16 indexed pairIndex, bool tradable);
    event MarketRiskSet(uint16 indexed pairIndex, MarketRisk risk);
    event EntriesPaused(bool paused);
    event GuardianSet(address indexed guardian);
    event LiquidityAdded(address indexed from, uint256 amountUSDC_6);
    event LiquidityWithdrawn(address indexed to, uint256 amountUSDC_6);
    event FeesWithdrawn(address indexed to, uint256 amountUSDC_6);
    event PositionOpened(uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex,
        bool isLong, uint16 leverage, uint8 marginMode, uint64 collateralUSDC_6, uint128 entryPrice_E18);
    event PositionClosed(uint256 indexed tradeId, address indexed trader, uint16 indexed pairIndex,
        uint128 exitPrice_E18, int256 pnlUSDC_6, uint64 payoutUSDC_6, uint64 feeUSDC_6);
    event PositionLiquidated(uint256 indexed tradeId, address indexed trader, address indexed liquidator,
        uint128 exitPrice_E18, uint64 bountyUSDC_6);
    event SettlementFees(uint256 indexed tradeId, uint64 borrowFeeUSDC_6, uint64 keeperBountyUSDC_6);
    event TriggersSet(uint256 indexed tradeId, uint128 takeProfit_E18, uint128 stopLoss_E18);
    event TriggerFired(uint256 indexed tradeId, address indexed trader, address indexed keeper,
        bool wasTakeProfit, uint128 exitPrice_E18, uint64 keeperBounty_6);
    event ConditionalOrderPlaced(uint256 indexed orderId, address indexed trader, uint16 indexed pairIndex,
        bool isLong, uint8 triggerKind, uint8 marginMode, bool reduceOnly, uint16 reduceBps,
        uint128 triggerPrice_E18, uint64 collateralUSDC_6, uint16 leverage);
    event ConditionalOrderCancelled(uint256 indexed orderId, address indexed trader);
    event ConditionalOrderExecuted(uint256 indexed orderId, address indexed trader, uint256 linkedTradeId, uint128 markPrice_E18);

    error InvalidInput();
    error NotAuthorized();
    error MarketUnavailable();
    error RiskLimit();
    error InsufficientLiquidity();
    error OracleInvalid();
    error OracleFeeMismatch();
    error PriceLimit();
    error Expired();
    error NotFound();
    error TooEarly();
    error TriggerNotHit();
    error NotLiquidatable();
    error AccountingMismatch();

    constructor(IERC20 usdc, IPythV2 pyth, address initialOwner, address initialGuardian) Ownable(initialOwner) {
        if (address(usdc).code.length == 0 || address(pyth).code.length == 0 ||
            IERC20Metadata(address(usdc)).decimals() != 6) revert InvalidInput();
        USDC = usdc;
        PYTH = pyth;
        guardian = initialGuardian;
    }

    function setEntriesPaused(bool paused) external {
        if (msg.sender != owner() && !(paused && msg.sender == guardian)) revert NotAuthorized();
        entriesPaused = paused;
        emit EntriesPaused(paused);
    }

    function setGuardian(address nextGuardian) external onlyOwner {
        guardian = nextGuardian;
        emit GuardianSet(nextGuardian);
    }

    function renounceOwnership() public override onlyOwner { revert InvalidInput(); }

    function registerPair(uint16 id, bytes32 feed, string calldata label, MarketRisk calldata risk) external onlyOwner {
        if (feed == bytes32(0) || bytes(label).length == 0 || bytes(label).length > 24 ||
            pairFeedId[id] != bytes32(0) || registeredFeed[feed]) revert InvalidInput();
        _validateRisk(risk);
        pairFeedId[id] = feed;
        registeredFeed[feed] = true;
        pairLabel[id] = label;
        marketRisk[id] = risk;
        pairTradable[id] = true;
        emit PairRegistered(id, feed, label);
        emit MarketRiskSet(id, risk);
        emit PairTradable(id, true);
    }

    function setMarketRisk(uint16 id, MarketRisk calldata risk) external onlyOwner {
        if (pairFeedId[id] == bytes32(0) || openInterest[id] != 0 || pendingOrderCount[id] != 0) revert RiskLimit();
        _validateRisk(risk);
        marketRisk[id] = risk;
        emit MarketRiskSet(id, risk);
    }

    function setPairTradable(uint16 id, bool tradable) external onlyOwner {
        if (pairFeedId[id] == bytes32(0)) revert InvalidInput();
        pairTradable[id] = tradable;
        emit PairTradable(id, tradable);
    }

    function _validateRisk(MarketRisk memory r) private pure {
        if (r.maxLeverage == 0 || r.maxLeverage > MAX_LEVERAGE || r.maintenanceBps < 50 ||
            r.maintenanceBps > 1_000 || uint256(r.maxLeverage) * (r.maintenanceBps + CLOSE_FEE_BPS + KEEPER_BOUNTY_BPS) >= BPS ||
            r.maxConfidenceBps == 0 || r.maxConfidenceBps > 100 || r.borrowBpsPerHour > 5 ||
            r.maxPositionUSDC_6 < 1e6 || r.maxPositionUSDC_6 > 1_000_000e6 ||
            r.maxOpenInterestUSDC_6 < r.maxPositionUSDC_6 ||
            r.maxBlockVolumeUSDC_6 < r.maxPositionUSDC_6) revert InvalidInput();
    }

    function accountedBalance() public view returns (uint256) {
        return poolAssets + collateralEscrow + orderEscrow + feeBalance;
    }

    function availableLiquidity() public view returns (uint256) { return poolAssets - reservedProfit; }
    function poolBalance() external view returns (uint256) { return poolAssets; }

    function fundPool(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) revert InvalidInput();
        _pull(msg.sender, amount);
        poolAssets += amount;
        emit LiquidityAdded(msg.sender, amount);
    }

    function accountSurplus() external nonReentrant onlyOwner {
        uint256 balance = USDC.balanceOf(address(this));
        if (balance <= accountedBalance()) revert InvalidInput();
        uint256 amount = balance - accountedBalance();
        poolAssets += amount;
        emit LiquidityAdded(msg.sender, amount);
    }

    function withdrawLiquidity(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0) || to == address(this) || amount == 0 || amount > availableLiquidity()) revert InsufficientLiquidity();
        poolAssets -= amount;
        USDC.safeTransfer(to, amount);
        _assertAccounting();
        emit LiquidityWithdrawn(to, amount);
    }

    function withdrawFees(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0) || to == address(this) || amount == 0 || amount > feeBalance) revert InvalidInput();
        feeBalance -= amount;
        USDC.safeTransfer(to, amount);
        _assertAccounting();
        emit FeesWithdrawn(to, amount);
    }

    function openPosition(OpenParams calldata p, bytes[] calldata updateData) external payable nonReentrant returns (uint256 id) {
        _deadline(p.deadline);
        if (p.deadline > block.timestamp + 5 minutes) revert InvalidInput();
        uint256 mark = _price(p.pairIndex, updateData);
        _pull(msg.sender, p.collateralUSDC_6);
        id = _open(msg.sender, p, mark);
        _assertAccounting();
    }

    function _open(address trader, OpenParams memory p, uint256 mark) private returns (uint256 id) {
        MarketRisk memory risk = marketRisk[p.pairIndex];
        if (entriesPaused || !pairTradable[p.pairIndex]) revert MarketUnavailable();
        if (p.leverage == 0 || p.leverage > risk.maxLeverage || _trades[trader].length >= MAX_ITEMS || openPositionCount >= 256) revert RiskLimit();
        uint256 openFee = uint256(p.collateralUSDC_6) * p.leverage * OPEN_FEE_BPS / BPS;
        if (uint256(p.collateralUSDC_6) < MIN_COLLATERAL_USDC_6 + openFee) revert InvalidInput();
        uint64 collateral = uint64(p.collateralUSDC_6 - openFee);
        uint256 notional = uint256(collateral) * p.leverage;
        if (notional > risk.maxPositionUSDC_6 || openInterest[p.pairIndex] + notional > risk.maxOpenInterestUSDC_6) revert RiskLimit();
        if (availableLiquidity() < notional) revert InsufficientLiquidity();
        if (_volumeBlock[p.pairIndex] != block.number) {
            _volumeBlock[p.pairIndex] = block.number;
            _blockVolume[p.pairIndex] = 0;
        }
        if (_blockVolume[p.pairIndex] + notional > risk.maxBlockVolumeUSDC_6) revert RiskLimit();
        uint128 entry = uint128(_executionPrice(p.pairIndex, mark, p.isLong, notional));
        _limit(entry, p.priceLimit_E18, p.isLong);
        _triggers(p.isLong, entry, p.takeProfit_E18, p.stopLoss_E18);
        feeBalance += openFee;
        collateralEscrow += collateral;
        reservedProfit += notional;
        openInterest[p.pairIndex] += notional;
        _blockVolume[p.pairIndex] += notional;
        id = nextTradeId++;
        openPositionCount++;
        positions[id] = Position(trader,p.pairIndex,p.isLong,p.leverage,0,collateral,entry,
            uint64(block.timestamp),p.takeProfit_E18,p.stopLoss_E18,uint128(notional));
        positionOpenFee[id] = openFee;
        _tradeSlot[id] = _trades[trader].length;
        _trades[trader].push(id);
        emit PositionOpened(id,trader,p.pairIndex,p.isLong,p.leverage,0,collateral,entry);
        emit TriggersSet(id,p.takeProfit_E18,p.stopLoss_E18);
    }

    function closePosition(uint256 id, uint128 priceLimit, uint64 deadline, bytes[] calldata updateData) external payable nonReentrant {
        _deadline(deadline);
        Position memory p = _position(id);
        if (msg.sender != p.owner) revert NotAuthorized();
        _holding(p);
        uint256 mark = _price(p.pairIndex,updateData);
        Settlement memory s = _quote(p,mark,false);
        _limit(s.price,priceLimit,!p.isLong);
        _settle(id,p,s,address(0));
    }

    function setTriggers(uint256 id, uint128 takeProfit, uint128 stopLoss) external nonReentrant {
        Position storage p = positions[id];
        if (p.owner == address(0)) revert NotFound();
        if (p.owner != msg.sender) revert NotAuthorized();
        _triggers(p.isLong,p.entryPrice_E18,takeProfit,stopLoss);
        p.takeProfit_E18 = takeProfit;
        p.stopLoss_E18 = stopLoss;
        emit TriggersSet(id,takeProfit,stopLoss);
    }

    function closeIfTriggered(uint256 id, bytes[] calldata updateData) external payable nonReentrant {
        Position memory p = _position(id);
        _holding(p);
        uint256 mark = _price(p.pairIndex,updateData);
        bool tp = p.takeProfit_E18 != 0 && (p.isLong ? mark >= p.takeProfit_E18 : mark <= p.takeProfit_E18);
        bool sl = p.stopLoss_E18 != 0 && (p.isLong ? mark <= p.stopLoss_E18 : mark >= p.stopLoss_E18);
        if (!tp && !sl) revert TriggerNotHit();
        Settlement memory s = _quote(p,mark,true);
        _settle(id,p,s,msg.sender);
        emit TriggerFired(id,p.owner,msg.sender,tp,s.price,s.bounty);
    }

    function liquidate(uint256 id, bytes[] calldata updateData) external payable nonReentrant {
        Position memory p = _position(id);
        uint256 mark = _price(p.pairIndex,updateData);
        Settlement memory s = _quote(p,mark,true);
        uint256 maintenance = uint256(p.originalNotional_6) * marketRisk[p.pairIndex].maintenanceBps / BPS;
        if (uint256(s.payout) + s.bounty > maintenance) revert NotLiquidatable();
        _settle(id,p,s,msg.sender);
        emit PositionLiquidated(id,p.owner,msg.sender,s.price,s.bounty);
    }

    function _quote(Position memory p, uint256 mark, bool keeper) private view returns (Settlement memory s) {
        uint256 notional = p.originalNotional_6;
        s.price = uint128(_executionPrice(p.pairIndex,mark,!p.isLong,notional));
        int256 delta = int256(uint256(s.price)) - int256(uint256(p.entryPrice_E18));
        if (!p.isLong) delta = -delta;
        uint256 magnitude = Math.mulDiv(notional,uint256(delta < 0 ? -delta : delta),p.entryPrice_E18);
        int256 raw = delta < 0 ? -int256(Math.min(magnitude,p.collateralUSDC_6)) : int256(Math.min(magnitude,notional));
        uint256 equity = uint256(int256(uint256(p.collateralUSDC_6)) + raw);
        uint256 borrow = Math.mulDiv(notional * marketRisk[p.pairIndex].borrowBpsPerHour,block.timestamp - p.openedAt,BPS * 1 hours);
        s.borrowFee = uint64(Math.min(borrow,equity));
        equity -= s.borrowFee;
        s.fee = uint64(Math.min(notional * CLOSE_FEE_BPS / BPS,equity));
        equity -= s.fee;
        if (keeper) {
            s.bounty = uint64(Math.min(notional * KEEPER_BOUNTY_BPS / BPS,equity));
            equity -= s.bounty;
        }
        s.payout = uint64(equity);
        s.pnl = int256(equity) - int256(uint256(p.collateralUSDC_6));
    }

    function _settle(uint256 id, Position memory p, Settlement memory s, address keeper) private {
        s.pnl -= int256(positionOpenFee[id]);
        uint256 paid = uint256(s.payout) + s.fee + s.bounty;
        if (paid > p.collateralUSDC_6) poolAssets -= paid - p.collateralUSDC_6;
        else poolAssets += p.collateralUSDC_6 - paid;
        reservedProfit -= p.originalNotional_6;
        openInterest[p.pairIndex] -= p.originalNotional_6;
        collateralEscrow -= p.collateralUSDC_6;
        openPositionCount--;
        feeBalance += s.fee;
        _remove(_trades[p.owner],_tradeSlot,id);
        delete positions[id];
        delete positionOpenFee[id];
        if (s.payout != 0) USDC.safeTransfer(p.owner,s.payout);
        if (s.bounty != 0) USDC.safeTransfer(keeper,s.bounty);
        _assertAccounting();
        emit PositionClosed(id,p.owner,p.pairIndex,s.price,s.pnl,s.payout,s.fee);
        emit SettlementFees(id,s.borrowFee,s.bounty);
    }

    function placeConditionalOrder(OrderParams calldata request) external nonReentrant returns (uint256 id) {
        OpenParams memory p = request.position;
        MarketRisk memory risk = marketRisk[p.pairIndex];
        if (entriesPaused || !pairTradable[p.pairIndex]) revert MarketUnavailable();
        if (request.triggerKind > 1 || request.triggerPrice_E18 == 0 || p.priceLimit_E18 == 0 ||
            p.leverage == 0 || p.leverage > risk.maxLeverage || _orders[msg.sender].length >= MAX_ITEMS || activeOrderCount >= 512 ||
            uint256(p.collateralUSDC_6) < MIN_COLLATERAL_USDC_6 + uint256(p.collateralUSDC_6) * p.leverage * OPEN_FEE_BPS / BPS ||
            uint256(p.collateralUSDC_6) * p.leverage > risk.maxPositionUSDC_6) revert InvalidInput();
        if (request.triggerKind == 1 && (p.isLong ? p.priceLimit_E18 < request.triggerPrice_E18 : p.priceLimit_E18 > request.triggerPrice_E18)) revert InvalidInput();
        _deadline(p.deadline);
        if (p.deadline > block.timestamp + 30 days) revert InvalidInput();
        _triggers(p.isLong,request.triggerPrice_E18,p.takeProfit_E18,p.stopLoss_E18);
        _pull(msg.sender,p.collateralUSDC_6);
        orderEscrow += p.collateralUSDC_6;
        pendingOrderCount[p.pairIndex]++;
        id = nextOrderId++;
        activeOrderCount++;
        conditionalOrders[id] = ConditionalOrder(msg.sender,p.pairIndex,p.isLong,p.leverage,0,
            request.triggerKind,false,0,p.collateralUSDC_6,request.triggerPrice_E18,uint64(block.timestamp),true);
        orderTerms[id] = p;
        _orderSlot[id] = _orders[msg.sender].length;
        _orders[msg.sender].push(id);
        emit ConditionalOrderPlaced(id,msg.sender,p.pairIndex,p.isLong,request.triggerKind,0,false,0,
            request.triggerPrice_E18,p.collateralUSDC_6,p.leverage);
        _assertAccounting();
    }

    function cancelConditionalOrder(uint256 id) external nonReentrant {
        ConditionalOrder memory o = conditionalOrders[id];
        if (!o.active) revert NotFound();
        if (msg.sender != o.owner && block.timestamp <= orderTerms[id].deadline) revert NotAuthorized();
        _removeOrder(id,o);
        USDC.safeTransfer(o.owner,o.collateralUSDC_6);
        emit ConditionalOrderCancelled(id,o.owner);
        _assertAccounting();
    }

    function executeConditionalOrder(uint256 id, bytes[] calldata updateData) external payable nonReentrant {
        ConditionalOrder memory o = conditionalOrders[id];
        if (!o.active) revert NotFound();
        OpenParams memory p = orderTerms[id];
        _deadline(p.deadline);
        uint256 mark = _price(o.pairIndex,updateData);
        bool hit = o.triggerKind == 0 ? (o.isLong ? mark <= o.triggerPrice_E18 : mark >= o.triggerPrice_E18)
            : (o.isLong ? mark >= o.triggerPrice_E18 : mark <= o.triggerPrice_E18);
        if (!hit) revert TriggerNotHit();
        // Limits never fill worse than their trigger; stops have an explicit execution limit.
        if (o.triggerKind == 0) p.priceLimit_E18 = o.isLong ?
            uint128(Math.min(p.priceLimit_E18,o.triggerPrice_E18)) :
            uint128(Math.max(p.priceLimit_E18,o.triggerPrice_E18));
        _removeOrder(id,o);
        uint256 tradeId = _open(o.owner,p,mark);
        emit ConditionalOrderExecuted(id,o.owner,tradeId,uint128(mark));
        _assertAccounting();
    }

    function _removeOrder(uint256 id, ConditionalOrder memory o) private {
        orderEscrow -= o.collateralUSDC_6;
        activeOrderCount--;
        pendingOrderCount[o.pairIndex]--;
        _remove(_orders[o.owner],_orderSlot,id);
        delete conditionalOrders[id];
        delete orderTerms[id];
    }

    function getTraderTrades(address trader) external view returns (uint256[] memory) { return _trades[trader]; }
    function getTraderOrders(address trader) external view returns (uint256[] memory) { return _orders[trader]; }
    function getPosition(uint256 id) external view returns (Position memory) { return positions[id]; }

    /// @notice Read-only estimate at a supplied mark; never authorizes execution.
    function quoteClose(uint256 id, uint128 mark, bool keeper) external view returns (Settlement memory s) {
        if (mark == 0) revert InvalidInput();
        s = _quote(_position(id),mark,keeper);
        s.pnl -= int256(positionOpenFee[id]);
    }

    function liquidationCheck(uint256 id, uint128 mark) external view returns (bool) {
        if (mark == 0) revert InvalidInput();
        Position memory p = _position(id);
        Settlement memory s = _quote(p,mark,true);
        return uint256(s.payout) + s.bounty <= uint256(p.originalNotional_6) * marketRisk[p.pairIndex].maintenanceBps / BPS;
    }

    function _position(uint256 id) private view returns (Position memory p) {
        p = positions[id];
        if (p.owner == address(0)) revert NotFound();
    }

    function _holding(Position memory p) private view {
        if (block.timestamp < p.openedAt + MIN_HOLD_SECONDS) revert TooEarly();
    }

    function _deadline(uint64 deadline) private view { if (deadline < block.timestamp) revert Expired(); }

    function _limit(uint256 price, uint256 limit, bool buy) private pure {
        if (limit == 0 || (buy ? price > limit : price < limit)) revert PriceLimit();
    }

    function _triggers(bool isLong, uint128 entry, uint128 tp, uint128 sl) private pure {
        if ((tp != 0 && (isLong ? tp <= entry : tp >= entry)) ||
            (sl != 0 && (isLong ? sl >= entry : sl <= entry))) revert InvalidInput();
    }

    function _price(uint16 pair, bytes[] calldata updateData) private returns (uint256 mark) {
        bytes32 feed = pairFeedId[pair];
        if (feed == bytes32(0)) revert MarketUnavailable();
        uint256 fee = PYTH.getUpdateFee(updateData);
        if (msg.value != fee) revert OracleFeeMismatch();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = feed;
        uint256 minTime = block.timestamp > PYTH_MAX_AGE_SECONDS ? block.timestamp - PYTH_MAX_AGE_SECONDS : 0;
        minTime = Math.max(minTime,lastPublishTime[pair]);
        IPythV2.PriceFeed[] memory feeds = PYTH.parsePriceFeedUpdates{value:fee}(updateData,ids,uint64(minTime),uint64(block.timestamp));
        if (feeds.length != 1 || feeds[0].id != feed) revert OracleInvalid();
        IPythV2.Price memory price = feeds[0].price;
        if (price.price <= 0 || price.expo > 0 || price.expo < -18 || price.publishTime < minTime ||
            price.publishTime > block.timestamp || uint256(price.conf) * BPS > uint256(uint64(price.price)) * marketRisk[pair].maxConfidenceBps) revert OracleInvalid();
        lastPublishTime[pair] = price.publishTime;
        mark = uint256(uint64(price.price)) * 10 ** uint32(int32(18) + price.expo);
        if (mark == 0 || mark > type(uint128).max / 2) revert OracleInvalid();
        // Confidence is stored per fresh observation, never accepted from the caller.
        _confidence[pair] = uint256(price.conf) * 10 ** uint32(int32(18) + price.expo);
    }

    mapping(uint16 => uint256) private _confidence;

    function _executionPrice(uint16 pair, uint256 mark, bool buy, uint256 notional) private view returns (uint256) {
        // Two bps minimum spread plus a bounded, size-dependent impact.
        uint256 spread = Math.max(_confidence[pair],mark * 2 / BPS);
        uint256 impact = Math.mulDiv(mark,notional * 20,uint256(marketRisk[pair].maxOpenInterestUSDC_6) * BPS);
        uint256 adjustment = spread + impact;
        if (adjustment >= mark) revert OracleInvalid();
        return buy ? mark + adjustment : mark - adjustment;
    }

    function _pull(address from, uint256 amount) private {
        uint256 beforeBalance = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(from,address(this),amount);
        if (USDC.balanceOf(address(this)) != beforeBalance + amount) revert AccountingMismatch();
    }

    function _assertAccounting() private view {
        if (reservedProfit > poolAssets || USDC.balanceOf(address(this)) < accountedBalance()) revert AccountingMismatch();
    }

    function _remove(uint256[] storage list, mapping(uint256 => uint256) storage slots, uint256 id) private {
        uint256 slot = slots[id];
        uint256 last = list[list.length - 1];
        list[slot] = last;
        slots[last] = slot;
        list.pop();
        delete slots[id];
    }
}
