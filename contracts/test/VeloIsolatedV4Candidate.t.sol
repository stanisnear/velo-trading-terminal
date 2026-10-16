// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPythV2} from "../src/interfaces/IPythV2.sol";
import {VeloIsolatedV4Candidate as Engine} from "../src/VeloIsolatedV4Candidate.sol";

contract CandidateUSDC is ERC20 {
    constructor() ERC20("Fixture USDC", "FUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
contract CandidateOracle is IPythV2 {
    int64 public value = 50_000e8;
    uint64 public confidence;
    int32 public exponent = -8;
    uint256 public timestamp;
    bool public wrongFeed;
    uint256 public fee;
    function setPrice(int64 price) external { value = price; }
    function setInvalid(uint64 conf, int32 expo, uint256 time, bool wrong) external { confidence = conf; exponent = expo; timestamp = time; wrongFeed = wrong; }
    function setFee(uint256 f) external { fee = f; }
    function getUpdateFee(bytes[] calldata) external view returns (uint256) { return fee; }
    function updatePriceFeeds(bytes[] calldata) external payable {}
    function getPriceNoOlderThan(bytes32, uint256) external view returns (Price memory) { return _price(); }
    function _price() internal view returns (Price memory) { return Price(value, confidence, exponent, timestamp == 0 ? block.timestamp : timestamp); }
    // Deliberately ignores the requested range, exercising the engine's own guards.
    function parsePriceFeedUpdates(bytes[] calldata, bytes32[] calldata ids, uint64, uint64) external payable returns (PriceFeed[] memory result) {
        result = new PriceFeed[](1); result[0] = PriceFeed(wrongFeed ? bytes32(uint256(99)) : ids[0], _price(), _price());
    }
}

contract VeloIsolatedV4CandidateTest is Test {
    CandidateUSDC usdc; CandidateOracle oracle; Engine engine;
    address alice = address(0xA11CE); address bob = address(0xB0B);
    uint256 constant START = 1_000_000e6;
    uint256 constant POOL = 500_000e6;
    bytes[] empty;
    function setUp() public {
        vm.warp(100_000); vm.roll(10);
        usdc = new CandidateUSDC(); oracle = new CandidateOracle();
        engine = new Engine(IERC20(address(usdc)), IPythV2(address(oracle)), address(this));
        engine.registerMarket(0, bytes32(uint256(1))); engine.setOpeningsPaused(false);
        usdc.mint(address(this), START); usdc.approve(address(engine), type(uint256).max); engine.fundPool(POOL);
        usdc.mint(alice, START); usdc.mint(bob, START);
        vm.prank(alice); usdc.approve(address(engine), type(uint256).max);
        vm.prank(bob); usdc.approve(address(engine), type(uint256).max);
    }
    function params(bool isLong) internal view returns (Engine.OpenParams memory p) {
        return Engine.OpenParams(0, isLong, 1000e6, 10, isLong ? uint128(60_000e18) : uint128(40_000e18), uint64(block.timestamp + 60), 0, 0);
    }
    function open(bool isLong) internal returns (uint256) { vm.prank(alice); return engine.openPosition(params(isLong), empty); }
    function close(uint256 id, uint16 fraction, bool isLong) internal { vm.prank(alice); engine.closePosition(id, fraction, isLong ? uint128(1) : type(uint128).max, uint64(block.timestamp + 60), empty); }
    function checkAccounting() internal view {
        assertEq(engine.accountedBalance(), usdc.balanceOf(address(engine)), "escrow + pool + fees == token balance");
        assertGe(engine.poolAssets(), engine.reservedProfit(), "profits fully reserved");
        uint256 margins; uint256 notionals; uint256 escrow;
        for (uint256 i=1; i<engine.nextPositionId(); ++i) { (, , , uint256 c, uint256 n, , , ) = engine.positions(i); margins += c; notionals += n; }
        for (uint256 i=1; i<engine.nextOrderId(); ++i) { (, , , , uint256 e) = engine.orders(i); escrow += e; }
        assertEq(margins, engine.positionCollateral()); assertEq(notionals, engine.reservedProfit()); assertEq(escrow, engine.orderEscrow());
        (, , uint256 oi, , ) = engine.markets(0); assertEq(oi, notionals);
    }
    function test_FlatCloseChargesOnlyBothFees() public {
        uint256 id = open(true); close(id, 10_000, true);
        assertEq(usdc.balanceOf(alice), START - 20e6); assertEq(engine.poolAssets(), POOL); assertEq(engine.feeBalance(), 20e6); checkAccounting();
    }
    function test_AddMarginPreservesExposureAndProfit() public {
        uint256 id = open(true); vm.prank(alice); engine.addMargin(id, 500e6);
        (, , , uint256 c, uint256 n, uint256 entry, , ) = engine.positions(id);
        assertEq(c, 1500e6); assertEq(n, 10_000e6); assertEq(entry, 50_000e18);
        oracle.setPrice(55_000e8); close(id, 10_000, true);
        assertEq(usdc.balanceOf(alice), START + 980e6); checkAccounting();
    }
    function test_RemoveMarginPreservesExposure() public {
        uint256 id = open(true); vm.prank(alice); engine.addMargin(id, 500e6);
        vm.prank(alice); engine.removeMargin(id, 250e6, uint64(block.timestamp + 60), empty);
        (, , , uint256 c, uint256 n, , , ) = engine.positions(id); assertEq(c,1250e6); assertEq(n,10_000e6); checkAccounting();
    }
    function test_UnsafeMarginRemovalRejected() public {
        uint256 id = open(true); oracle.setPrice(46_000e8);
        vm.prank(alice); vm.expectRevert("Unsafe withdrawal"); engine.removeMargin(id, 200e6, uint64(block.timestamp + 60), empty); checkAccounting();
    }
    function test_PartialCloseReducesCollateralNotionalAndReserveProportionally() public {
        uint256 id = open(true); oracle.setPrice(52_500e8); close(id,5000,true);
        (, , , uint256 c, uint256 n, , , ) = engine.positions(id); assertEq(c,500e6); assertEq(n,5000e6); checkAccounting();
        oracle.setPrice(55_000e8); close(id,10_000,true); assertEq(usdc.balanceOf(alice),START+730e6); checkAccounting();
    }
    function test_MaxProfitIsReservedEvenAfterAllFreePoolWithdrawn() public {
        uint256 id = open(true); engine.withdrawPool(engine.freeLiquidity(),address(this));
        vm.expectRevert("Reserved liquidity"); engine.withdrawPool(1,address(this));
        oracle.setPrice(200_000e8); close(id,10_000,true);
        assertEq(usdc.balanceOf(alice),START+9980e6); assertEq(engine.poolAssets(),0); checkAccounting();
    }
    function test_LiquidationRealizesLossAndPaysOnlyFromRemainingEquity() public {
        uint256 id = open(true); oracle.setPrice(45_500e8);
        vm.prank(bob); engine.liquidate(id,empty);
        assertEq(engine.poolAssets(),POOL+900e6); assertEq(usdc.balanceOf(bob),START+10e6); assertEq(usdc.balanceOf(alice),START-930e6); checkAccounting();
    }
    function test_HealthyPositionCannotBeLiquidated() public {
        uint256 id = open(true); vm.prank(bob); vm.expectRevert("Healthy position"); engine.liquidate(id,empty); checkAccounting();
    }
    function test_ManualCloseEventNeverClaimsLiquidation() public {
        uint256 id = open(true); oracle.setPrice(55_000e8); vm.recordLogs(); close(id,10_000,true);
        Vm.Log[] memory logs = vm.getRecordedLogs(); bool found;
        for(uint256 i=0; i<logs.length; ++i) if(logs[i].emitter == address(engine)) {
            (Engine.ExitReason reason,Engine.Settlement memory s)=abi.decode(logs[i].data,(Engine.ExitReason,Engine.Settlement));
            assertEq(uint8(reason),uint8(Engine.ExitReason.Manual)); assertEq(s.pnl,1000e6); assertTrue(s.fullyClosed); found=true;
        }
        assertTrue(found); checkAccounting();
    }
    function test_OrderEscrowCannotBeWithdrawnAsLiquidityOrFees() public {
        Engine.OpenParams memory p=params(true); p.limitPrice=49_000e18;
        vm.prank(alice); uint256 orderId=engine.placeOrder(p,Engine.OrderKind.Limit,49_000e18);
        assertEq(engine.orderEscrow(),1010e6); engine.withdrawPool(POOL,address(this));
        vm.expectRevert("Fee balance"); engine.withdrawFees(1,address(this));
        vm.expectRevert("Reserved liquidity"); engine.withdrawPool(1,address(this));
        vm.prank(alice); engine.cancelOrder(orderId); assertEq(usdc.balanceOf(alice),START); checkAccounting();
    }
    function test_LimitOrderExecutesOnceAndKeepsRealCollateral() public {
        Engine.OpenParams memory p=params(true); p.limitPrice=49_000e18;
        vm.prank(alice); uint256 oid=engine.placeOrder(p,Engine.OrderKind.Limit,49_000e18);
        vm.expectRevert("Trigger not reached"); engine.executeOrder(oid,empty);
        oracle.setPrice(49_000e8); uint256 id=engine.executeOrder(oid,empty);
        assertEq(id,1); assertEq(engine.orderEscrow(),0); assertEq(engine.positionCollateral(),1000e6);
        vm.expectRevert("Unknown/expired order"); engine.executeOrder(oid,empty); checkAccounting();
    }
    function test_StopOrderHonorsExecutionLimitAndRetainsEscrowOnFailure() public {
        Engine.OpenParams memory p=params(true); p.limitPrice=52_000e18;
        vm.prank(alice); uint256 oid=engine.placeOrder(p,Engine.OrderKind.Stop,51_000e18);
        oracle.setPrice(53_000e8); vm.expectRevert("Execution price limit"); engine.executeOrder(oid,empty);
        assertEq(engine.orderEscrow(),1010e6); checkAccounting();
        oracle.setPrice(51_500e8); engine.executeOrder(oid,empty); checkAccounting();
    }
    function test_ExpiredOrderRefundAlwaysGoesToItsOwner() public {
        Engine.OpenParams memory p=params(true); p.limitPrice=49_000e18;
        vm.prank(alice); uint256 oid=engine.placeOrder(p,Engine.OrderKind.Limit,49_000e18);
        vm.warp(block.timestamp+61); vm.prank(bob); engine.cancelOrder(oid);
        assertEq(usdc.balanceOf(alice),START); assertEq(usdc.balanceOf(bob),START); checkAccounting();
    }
    function test_PausedAndDisabledMarketStillAllowExitsAndCancellation() public {
        uint256 id=open(true); Engine.OpenParams memory p=params(true); p.limitPrice=49_000e18;
        vm.prank(alice); uint256 oid=engine.placeOrder(p,Engine.OrderKind.Limit,49_000e18);
        engine.setOpeningsPaused(true); engine.setMarketEnabled(0,false);
        vm.prank(alice); vm.expectRevert("Openings paused"); engine.openPosition(params(true),empty);
        close(id,10_000,true); vm.prank(alice); engine.cancelOrder(oid); checkAccounting();
    }
    function test_TakeProfitAndStopLossSettleFromVerifiedTriggers() public {
        uint256 id=open(true); vm.prank(alice); engine.setTriggers(id,55_000e18,45_000e18);
        vm.expectRevert("Trigger not reached"); engine.executeTriggers(id,empty);
        oracle.setPrice(55_000e8); engine.executeTriggers(id,empty); checkAccounting();
        oracle.setPrice(50_000e8); id=open(false); vm.prank(alice); engine.setTriggers(id,45_000e18,55_000e18);
        oracle.setPrice(55_000e8); engine.executeTriggers(id,empty); checkAccounting();
    }
    function test_OracleRejectsStaleFutureUncertainWrongFeedAndInvalidPrices() public {
        oracle.setInvalid(0,-8,block.timestamp-31,false); vm.expectRevert("Oracle timestamp"); open(true);
        oracle.setInvalid(0,-8,block.timestamp+1,false); vm.expectRevert("Oracle timestamp"); open(true);
        oracle.setInvalid(1000e8,-8,0,false); vm.expectRevert("Oracle confidence"); open(true);
        oracle.setInvalid(0,-8,0,true); vm.expectRevert("Oracle feed mismatch"); open(true);
        oracle.setInvalid(0,-19,0,false); vm.expectRevert("Invalid oracle price"); open(true);
        oracle.setInvalid(0,-8,0,false); oracle.setPrice(0); vm.expectRevert("Invalid oracle price"); open(true); checkAccounting();
    }
    function test_DeadlineAndOracleFeeAreExact() public {
        Engine.OpenParams memory p=params(true); p.deadline=uint64(block.timestamp-1);
        vm.prank(alice); vm.expectRevert("Expired/long deadline"); engine.openPosition(p,empty);
        oracle.setFee(1); vm.prank(alice); vm.expectRevert("Exact oracle fee"); engine.openPosition(params(true),empty); checkAccounting();
    }
    function test_UnauthorizedTradeAndPoolActionsFail() public {
        uint256 id=open(true); vm.prank(bob); vm.expectRevert("Position owner"); engine.closePosition(id,10_000,1,uint64(block.timestamp+60),empty);
        vm.prank(bob); vm.expectRevert(); engine.withdrawPool(1,bob); checkAccounting();
    }
    function test_BlockVolumeAndPositionLimitsPreventExcessExposure() public {
        for(uint256 i=0;i<10;++i) open(true);
        vm.expectRevert("Block volume limit"); open(true); checkAccounting();
        vm.roll(block.number+1); Engine.OpenParams memory p=params(true); p.collateral=20_000e6;
        vm.prank(alice); vm.expectRevert("Position size limit"); engine.openPosition(p,empty);
    }
    function testFuzz_LongPartialThenFullCloseConservesFunds(uint64 rawPrice,uint16 rawFraction) public {
        uint256 id=open(true); uint16 fraction=uint16(bound(rawFraction,10,9990));
        oracle.setPrice(int64(int256(bound(rawPrice,1000,200_000)*1e8))); close(id,fraction,true); checkAccounting();
        close(id,10_000,true); checkAccounting();
    }
    function testFuzz_ShortCloseConservesFunds(uint64 rawPrice) public {
        uint256 id=open(false); oracle.setPrice(int64(int256(bound(rawPrice,1,200_000)*1e8))); close(id,10_000,false); checkAccounting();
    }
}
