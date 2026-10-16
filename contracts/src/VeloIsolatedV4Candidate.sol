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

/// @notice UNDEPLOYED RESEARCH CANDIDATE. Not audited, not mainnet ready.
/// @dev Isolated, operator-funded testnet pool; no LP share token or cross margin.
/// Positive PnL is CAPPED at the position's notional and fully reserved at open.
/// This economic change requires explicit UI disclosure before any deployment.
contract VeloIsolatedV4Candidate is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 10;
    uint256 public constant MAINTENANCE_BPS = 100;
    uint256 public constant LIQUIDATOR_BPS = 10;
    uint256 public constant MIN_MARGIN = 1e6;
    uint256 public constant MAX_LEVERAGE = 25;
    uint256 public constant MAX_NOTIONAL = 100_000e6;
    uint256 public constant MAX_MARKET_OI = 500_000e6;
    uint256 public constant MAX_BLOCK_NOTIONAL = 100_000e6;
    uint256 public constant MAX_PRICE_AGE = 30;
    uint256 public constant MAX_CONFIDENCE_BPS = 100;
    uint16 public constant VERSION = 40;

    IERC20 public immutable USDC;
    IPythV2 public immutable PYTH;
    bool public openingsPaused = true;
    uint256 public poolAssets;
    uint256 public positionCollateral;
    uint256 public orderEscrow;
    uint256 public feeBalance;
    uint256 public reservedProfit;
    uint256 public nextPositionId = 1;
    uint256 public nextOrderId = 1;
    enum ExitReason { Manual, TakeProfit, StopLoss, Liquidation }
    enum OrderKind { Limit, Stop }
    struct Market { bytes32 feed; bool enabled; uint256 openInterest; uint256 lastBlock; uint256 blockNotional; }
    struct Position {
        address trader; uint16 market; bool isLong;
        uint256 collateral; uint256 notional; uint256 entryPrice;
        uint256 takeProfit; uint256 stopLoss;
    }
    struct OpenParams {
        uint16 market; bool isLong; uint64 collateral; uint16 leverage;
        uint128 limitPrice; uint64 deadline; uint128 takeProfit; uint128 stopLoss;
    }
    struct Order { address trader; OpenParams params; OrderKind kind; uint128 trigger; uint256 escrow; }
    struct Settlement { uint256 notional; uint256 collateral; uint256 price; int256 pnl; uint256 fee; uint256 payout; uint256 bounty; bool fullyClosed; }
    mapping(uint16 => Market) public markets;
    mapping(uint256 => Position) public positions;
    mapping(uint256 => Order) public orders;
    event PoolFunded(uint256 amount);
    event PoolWithdrawn(address indexed recipient, uint256 amount);
    event FeesWithdrawn(address indexed recipient, uint256 amount);
    event MarketRegistered(uint16 indexed market, bytes32 feed);
    event MarketEnabled(uint16 indexed market, bool enabled);
    event OpeningsPaused(bool paused);
    event PositionOpened(uint256 indexed id, address indexed trader, uint16 indexed market, bool isLong, uint256 collateral, uint256 notional, uint256 entryPrice, uint256 fee);
    event PositionSettled(uint256 indexed id, address indexed trader, ExitReason reason, Settlement settlement);
    event MarginChanged(uint256 indexed id, uint256 collateral, uint256 unchangedNotional);
    event TriggersChanged(uint256 indexed id, uint256 takeProfit, uint256 stopLoss);
    event OrderPlaced(uint256 indexed id, address indexed trader, uint16 indexed market, OrderKind kind, uint256 trigger, uint256 escrow, uint64 deadline);
    event OrderCancelled(uint256 indexed id, address indexed trader, uint256 refund);
    event OrderExecuted(uint256 indexed orderId, uint256 indexed positionId);

    constructor(IERC20 token, IPythV2 oracle, address operator) Ownable(operator) {
        require(address(token).code.length > 0 && address(oracle).code.length > 0, "Invalid dependency");
        require(IERC20Metadata(address(token)).decimals() == 6, "USDC decimals");
        USDC = token; PYTH = oracle;
    }
    function registerMarket(uint16 id, bytes32 feed) external onlyOwner {
        require(feed != bytes32(0) && markets[id].feed == bytes32(0), "Immutable feed");
        markets[id].feed = feed; markets[id].enabled = true;
        emit MarketRegistered(id, feed);
    }
    function setMarketEnabled(uint16 id, bool enabled) external onlyOwner {
        require(markets[id].feed != bytes32(0), "Unknown market");
        markets[id].enabled = enabled; emit MarketEnabled(id, enabled);
    }
    function setOpeningsPaused(bool paused) external onlyOwner {
        openingsPaused = paused; emit OpeningsPaused(paused);
    }
    function freeLiquidity() public view returns (uint256) { return poolAssets - reservedProfit; }
    function accountedBalance() public view returns (uint256) { return poolAssets + positionCollateral + orderEscrow + feeBalance; }
    function fundPool(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount"); _receive(msg.sender, amount);
        poolAssets += amount; emit PoolFunded(amount);
    }
    function withdrawPool(uint256 amount, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0) && amount <= freeLiquidity(), "Reserved liquidity");
        poolAssets -= amount; USDC.safeTransfer(recipient, amount); emit PoolWithdrawn(recipient, amount);
    }
    function withdrawFees(uint256 amount, address recipient) external onlyOwner nonReentrant {
        require(recipient != address(0) && amount <= feeBalance, "Fee balance");
        feeBalance -= amount; USDC.safeTransfer(recipient, amount); emit FeesWithdrawn(recipient, amount);
    }

    function openPosition(OpenParams calldata p, bytes[] calldata updates) external payable nonReentrant returns (uint256 id) {
        _deadline(p.deadline, 5 minutes);
        uint256 price = _price(p.market, updates);
        uint256 fee = _notional(p) * FEE_BPS / BPS;
        _receive(msg.sender, uint256(p.collateral) + fee);
        id = _open(msg.sender, p, price, fee);
    }
    function _notional(OpenParams memory p) internal pure returns (uint256 n) {
        require(p.collateral >= MIN_MARGIN && p.leverage > 0 && p.leverage <= MAX_LEVERAGE, "Margin/leverage");
        n = uint256(p.collateral) * p.leverage;
        require(n <= MAX_NOTIONAL, "Position size limit");
    }
    function _open(address trader, OpenParams memory p, uint256 price, uint256 fee) internal returns (uint256 id) {
        require(!openingsPaused && markets[p.market].enabled, "Openings paused");
        _executionPrice(price, p.limitPrice, p.isLong);
        _triggers(p.isLong, price, p.takeProfit, p.stopLoss);
        uint256 n = _notional(p);
        Market storage m = markets[p.market];
        require(n <= freeLiquidity() && m.openInterest + n <= MAX_MARKET_OI, "Insufficient risk capacity");
        if (m.lastBlock != block.number) { m.lastBlock = block.number; m.blockNotional = 0; }
        require(m.blockNotional + n <= MAX_BLOCK_NOTIONAL, "Block volume limit");
        m.blockNotional += n; m.openInterest += n;
        reservedProfit += n; positionCollateral += p.collateral; feeBalance += fee;
        id = nextPositionId++;
        positions[id] = Position(trader, p.market, p.isLong, p.collateral, n, price, p.takeProfit, p.stopLoss);
        emit PositionOpened(id, trader, p.market, p.isLong, p.collateral, n, price, fee);
    }
    function closePosition(uint256 id, uint16 fractionBps, uint128 limitPrice, uint64 deadline, bytes[] calldata updates) external payable nonReentrant {
        Position storage p = positions[id]; require(p.trader == msg.sender, "Position owner");
        _deadline(deadline, 5 minutes);
        uint256 price = _price(p.market, updates);
        _executionPrice(price, limitPrice, !p.isLong);
        _settle(id, fractionBps, price, ExitReason.Manual);
    }
    function addMargin(uint256 id, uint64 amount) external nonReentrant {
        Position storage p = positions[id]; require(p.trader == msg.sender && amount > 0, "Position owner/amount");
        require(p.collateral + amount <= type(uint128).max, "Margin size limit");
        _receive(msg.sender, amount); p.collateral += amount; positionCollateral += amount;
        emit MarginChanged(id, p.collateral, p.notional);
    }
    function removeMargin(uint256 id, uint64 amount, uint64 deadline, bytes[] calldata updates) external payable nonReentrant {
        Position storage p = positions[id]; require(p.trader == msg.sender && amount > 0 && amount < p.collateral, "Position owner/amount");
        _deadline(deadline, 5 minutes);
        uint256 price = _price(p.market, updates);
        uint256 remaining = p.collateral - amount;
        require(remaining >= MIN_MARGIN && remaining * MAX_LEVERAGE >= p.notional, "Insufficient margin");
        require(int256(remaining) + _pnl(p.notional, p.entryPrice, price, p.isLong) > int256(p.notional * MAINTENANCE_BPS / BPS), "Unsafe withdrawal");
        p.collateral = remaining; positionCollateral -= amount;
        USDC.safeTransfer(msg.sender, amount); emit MarginChanged(id, remaining, p.notional);
    }
    function setTriggers(uint256 id, uint128 takeProfit, uint128 stopLoss) external {
        Position storage p = positions[id]; require(p.trader == msg.sender, "Position owner");
        _triggers(p.isLong, p.entryPrice, takeProfit, stopLoss);
        p.takeProfit = takeProfit; p.stopLoss = stopLoss; emit TriggersChanged(id, takeProfit, stopLoss);
    }
    function executeTriggers(uint256 id, bytes[] calldata updates) external payable nonReentrant {
        Position storage p = positions[id]; require(p.trader != address(0), "Unknown position");
        uint256 price = _price(p.market, updates);
        bool tp = p.takeProfit > 0 && (p.isLong ? price >= p.takeProfit : price <= p.takeProfit);
        bool sl = p.stopLoss > 0 && (p.isLong ? price <= p.stopLoss : price >= p.stopLoss);
        require(tp || sl, "Trigger not reached");
        _settle(id, uint16(BPS), price, tp ? ExitReason.TakeProfit : ExitReason.StopLoss);
    }
    function liquidate(uint256 id, bytes[] calldata updates) external payable nonReentrant {
        Position storage p = positions[id]; require(p.trader != address(0), "Unknown position");
        uint256 price = _price(p.market, updates);
        require(int256(p.collateral) + _pnl(p.notional, p.entryPrice, price, p.isLong) <= int256(p.notional * MAINTENANCE_BPS / BPS), "Healthy position");
        _settle(id, uint16(BPS), price, ExitReason.Liquidation);
    }
    function _settle(uint256 id, uint16 fraction, uint256 price, ExitReason reason) internal {
        require(fraction > 0 && fraction <= BPS, "Close fraction");
        Position storage p = positions[id];
        Settlement memory s;
        s.collateral = p.collateral * fraction / BPS;
        s.notional = p.notional * fraction / BPS; s.price = price; s.fullyClosed = fraction == BPS;
        require(s.collateral > 0 && s.notional > 0 && (s.fullyClosed || p.collateral - s.collateral >= MIN_MARGIN), "Close dust");
        s.pnl = _pnl(s.notional, p.entryPrice, price, p.isLong);
        if (s.pnl < -int256(s.collateral)) s.pnl = -int256(s.collateral);
        if (s.pnl > int256(s.notional)) s.pnl = int256(s.notional);
        uint256 gross = uint256(int256(s.collateral) + s.pnl);
        s.fee = Math.min(gross, s.notional * FEE_BPS / BPS);
        s.bounty = reason == ExitReason.Liquidation ? Math.min(gross - s.fee, s.notional * LIQUIDATOR_BPS / BPS) : 0;
        s.payout = gross - s.fee - s.bounty;
        address trader = p.trader;
        if (s.pnl >= 0) poolAssets -= uint256(s.pnl); else poolAssets += uint256(-s.pnl);
        reservedProfit -= s.notional; positionCollateral -= s.collateral; feeBalance += s.fee;
        markets[p.market].openInterest -= s.notional;
        if (s.fullyClosed) delete positions[id]; else { p.collateral -= s.collateral; p.notional -= s.notional; }
        if (s.payout > 0) USDC.safeTransfer(trader, s.payout);
        if (s.bounty > 0) USDC.safeTransfer(msg.sender, s.bounty);
        emit PositionSettled(id, trader, reason, s);
    }

    function placeOrder(OpenParams calldata p, OrderKind kind, uint128 trigger) external nonReentrant returns (uint256 id) {
        require(!openingsPaused && markets[p.market].enabled && trigger > 0, "Order unavailable");
        _deadline(p.deadline, 7 days);
        uint256 n = _notional(p);
        require(p.limitPrice > 0, "Execution limit");
        if (kind == OrderKind.Limit) require(p.isLong ? p.limitPrice <= trigger : p.limitPrice >= trigger, "Limit bound");
        else require(p.isLong ? p.limitPrice >= trigger : p.limitPrice <= trigger, "Stop bound");
        uint256 escrow = uint256(p.collateral) + n * FEE_BPS / BPS;
        _receive(msg.sender, escrow); orderEscrow += escrow;
        id = nextOrderId++; orders[id] = Order(msg.sender, p, kind, trigger, escrow);
        emit OrderPlaced(id, msg.sender, p.market, kind, trigger, escrow, p.deadline);
    }
    function cancelOrder(uint256 id) external nonReentrant {
        Order memory o = orders[id];
        require(o.trader != address(0) && (msg.sender == o.trader || block.timestamp > o.params.deadline), "Order owner/expiry");
        delete orders[id]; orderEscrow -= o.escrow;
        USDC.safeTransfer(o.trader, o.escrow); emit OrderCancelled(id, o.trader, o.escrow);
    }
    function executeOrder(uint256 id, bytes[] calldata updates) external payable nonReentrant returns (uint256 positionId) {
        Order memory o = orders[id];
        require(o.trader != address(0) && block.timestamp <= o.params.deadline, "Unknown/expired order");
        uint256 price = _price(o.params.market, updates);
        bool reached = o.kind == OrderKind.Limit ? (o.params.isLong ? price <= o.trigger : price >= o.trigger) : (o.params.isLong ? price >= o.trigger : price <= o.trigger);
        require(reached, "Trigger not reached");
        delete orders[id]; orderEscrow -= o.escrow;
        positionId = _open(o.trader, o.params, price, o.escrow - o.params.collateral);
        emit OrderExecuted(id, positionId);
    }
    function _price(uint16 market, bytes[] calldata updates) internal returns (uint256 result) {
        bytes32 feed = markets[market].feed; require(feed != bytes32(0), "Unknown market");
        uint256 fee = PYTH.getUpdateFee(updates); require(msg.value == fee, "Exact oracle fee");
        bytes32[] memory ids = new bytes32[](1); ids[0] = feed;
        uint64 oldest = uint64(block.timestamp > MAX_PRICE_AGE ? block.timestamp - MAX_PRICE_AGE : 0);
        IPythV2.PriceFeed[] memory parsed = PYTH.parsePriceFeedUpdates{value: fee}(updates, ids, oldest, uint64(block.timestamp));
        require(parsed.length == 1 && parsed[0].id == feed, "Oracle feed mismatch");
        IPythV2.Price memory p = parsed[0].price;
        require(p.price > 0 && p.expo >= -18 && p.expo <= 0, "Invalid oracle price");
        require(p.publishTime >= oldest && p.publishTime <= block.timestamp, "Oracle timestamp");
        require(uint256(p.conf) * BPS <= uint256(uint64(p.price)) * MAX_CONFIDENCE_BPS, "Oracle confidence");
        result = uint256(uint64(p.price)) * 10 ** uint256(int256(18) + p.expo);
        require(result <= type(uint128).max, "Oracle scale");
    }
    function _pnl(uint256 n, uint256 entry, uint256 price, bool isLong) internal pure returns (int256) {
        uint256 delta = price >= entry ? price - entry : entry - price;
        uint256 absolute = Math.mulDiv(n, delta, entry);
        return (price >= entry) == isLong ? int256(absolute) : -int256(absolute);
    }
    function _executionPrice(uint256 price, uint256 limit, bool buying) internal pure {
        require(limit > 0 && (buying ? price <= limit : price >= limit), "Execution price limit");
    }
    function _triggers(bool isLong, uint256 entry, uint256 tp, uint256 sl) internal pure {
        require(tp == 0 || (isLong ? tp > entry : tp < entry), "Take profit side");
        require(sl == 0 || (isLong ? sl < entry : sl > entry), "Stop loss side");
    }
    function _deadline(uint64 deadline, uint256 maxWindow) internal view {
        require(deadline >= block.timestamp && deadline <= block.timestamp + maxWindow, "Expired/long deadline");
    }
    function _receive(address sender, uint256 amount) internal {
        uint256 beforeBalance = USDC.balanceOf(address(this)); USDC.safeTransferFrom(sender, address(this), amount);
        require(USDC.balanceOf(address(this)) == beforeBalance + amount, "Unsupported transfer token");
    }
}
