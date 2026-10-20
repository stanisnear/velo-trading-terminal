// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "forge-std/Test.sol";
import {VeloPerpsV4} from "../src/VeloPerpsV4.sol";
import {IPythV2} from "../src/interfaces/IPythV2.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract V4USDC is ERC20 {
    constructor() ERC20("Test USD","mUSDC") {}
    function decimals() public pure override returns(uint8) {return 6;}
    function mint(address to,uint256 amount) external {_mint(to,amount);}
}
contract V4Pyth is IPythV2 {
    int64 public value=50000e8;
    uint64 public confidence;
    int32 public exponent=-8;
    uint256 public timestamp;
    uint256 public fee;
    function set(int64 v,uint64 c,int32 e,uint256 t) external {value=v;confidence=c;exponent=e;timestamp=t;}
    function setFee(uint256 f) external {fee=f;}
    function updatePriceFeeds(bytes[] calldata) external payable {}
    function getUpdateFee(bytes[] calldata) external view returns(uint256) {return fee;}
    function getPriceNoOlderThan(bytes32,uint256) external view returns(Price memory) {
        return Price(value,confidence,exponent,timestamp==0?block.timestamp:timestamp);
    }
    function parsePriceFeedUpdates(bytes[] calldata,bytes32[] calldata ids,uint64,uint64) external payable returns(PriceFeed[] memory feeds) {
        require(msg.value==fee);
        feeds=new PriceFeed[](1);
        Price memory p=Price(value,confidence,exponent,timestamp==0?block.timestamp:timestamp);
        feeds[0]=PriceFeed(ids[0],p,p);
    }
}
contract VeloPerpsV4Test is Test {
    VeloPerpsV4 engine; V4USDC token; V4Pyth oracle;
    address alice=address(0xA11CE);address bob=address(0xB0B);bytes[] empty;
    function setUp() public virtual {
        vm.warp(1000); token=new V4USDC();oracle=new V4Pyth();
        engine=new VeloPerpsV4(IERC20(address(token)),IPythV2(address(oracle)),address(this),bob);
        engine.registerPair(0,bytes32(uint256(1)),"BTC/USD",risk());
        token.mint(address(this),1_000_000e6);token.approve(address(engine),type(uint256).max);engine.fundPool(1_000_000e6);
        engine.setEntriesPaused(false);token.mint(alice,100_000e6);vm.prank(alice);token.approve(address(engine),type(uint256).max);
    }
    function risk() internal pure returns(VeloPerpsV4.MarketRisk memory) {return VeloPerpsV4.MarketRisk(50_000e6,500_000e6,100_000e6,25,50,100,1);}
    function params(bool long,uint64 c,uint16 lev) internal view returns(VeloPerpsV4.OpenParams memory) {
        return VeloPerpsV4.OpenParams(0,long,c,lev,0,0,long?uint128(60000e18):uint128(40000e18),uint64(block.timestamp+60));
    }
    function open(bool long,uint64 c,uint16 lev) internal returns(uint256) {
        VeloPerpsV4.OpenParams memory p=params(long,c,lev);vm.prank(alice);return engine.openPosition(p,empty);
    }
    function solvent() internal view {
        assertGe(token.balanceOf(address(engine)),engine.accountedBalance());assertGe(engine.poolAssets(),engine.reservedProfit());
    }
    function close(uint256 id,bool long) internal {
        vm.prank(alice);engine.closePosition(id,long?uint128(1):type(uint128).max,uint64(block.timestamp+60),empty);
    }
    function order(uint128 trigger) internal returns(uint256) {
        VeloPerpsV4.OrderParams memory p=VeloPerpsV4.OrderParams(params(true,1000e6,10),0,trigger);
        vm.prank(alice);return engine.placeConditionalOrder(p);
    }
    function test_StartsPausedAndOwnershipCannotBeRenounced() public {
        VeloPerpsV4 fresh=new VeloPerpsV4(IERC20(address(token)),IPythV2(address(oracle)),address(this),bob);
        assertTrue(fresh.entriesPaused());vm.expectRevert();fresh.renounceOwnership();
    }
    function test_FlatCloseDoesNotCreateCollateralAndFeesAreNotional() public {
        uint256 before=token.balanceOf(alice);uint256 id=open(true,1000e6,10);
        VeloPerpsV4.Position memory p=engine.getPosition(id);
        assertEq(p.originalNotional_6,uint256(p.collateralUSDC_6)*10);assertEq(engine.feeBalance(),10e6);
        assertEq(engine.collateralEscrow(),p.collateralUSDC_6);assertEq(engine.reservedProfit(),p.originalNotional_6);
        vm.warp(block.timestamp+2);close(id,true);
        assertLt(token.balanceOf(alice),before);assertEq(engine.collateralEscrow(),0);assertEq(engine.reservedProfit(),0);
        assertEq(engine.getTraderTrades(alice).length,0);solvent();
    }
    function test_ProfitsCannotSpendOtherCollateral() public {
        uint256 a=open(true,1000e6,10);uint256 b=open(false,2000e6,10);
        uint256 remaining=engine.getPosition(b).collateralUSDC_6;
        oracle.set(200000e8,0,-8,0);vm.warp(block.timestamp+2);close(a,true);
        assertEq(engine.collateralEscrow(),remaining);solvent();
    }
    function test_OwnerWithdrawalCannotTouchReservedProfit() public {
        open(true,1000e6,10);uint256 free=engine.availableLiquidity();
        vm.expectRevert(VeloPerpsV4.InsufficientLiquidity.selector);engine.withdrawLiquidity(address(this),free+1);
        engine.withdrawLiquidity(address(this),free);assertEq(engine.poolAssets(),engine.reservedProfit());solvent();
    }
    function test_ReserveRequiredBeforeOpen() public {
        engine.withdrawLiquidity(address(this),engine.availableLiquidity());
        vm.expectRevert(VeloPerpsV4.InsufficientLiquidity.selector);open(true,1000e6,10);assertEq(engine.collateralEscrow(),0);
    }
    function test_AtomicTriggersAndCloseWorksWhilePaused() public {
        VeloPerpsV4.OpenParams memory p=params(true,1000e6,10);p.takeProfit_E18=55000e18;p.stopLoss_E18=45000e18;
        vm.prank(alice);uint256 id=engine.openPosition(p,empty);assertEq(engine.getPosition(id).takeProfit_E18,p.takeProfit_E18);
        vm.prank(bob);engine.setEntriesPaused(true);
        vm.prank(bob);vm.expectRevert(VeloPerpsV4.NotAuthorized.selector);engine.setEntriesPaused(false);
        vm.warp(block.timestamp+2);close(id,true);solvent();
    }
    function test_CloseRequiresMinimumHoldingTime() public {
        uint256 id=open(true,1000e6,10);
        vm.expectRevert(VeloPerpsV4.TooEarly.selector);close(id,true);
    }
    function test_SlippageAndDeadline() public {
        VeloPerpsV4.OpenParams memory p=params(true,1000e6,10);p.priceLimit_E18=50000e18;
        vm.prank(alice);vm.expectRevert(VeloPerpsV4.PriceLimit.selector);engine.openPosition(p,empty);
        p=params(true,1000e6,10);p.deadline=uint64(block.timestamp-1);
        vm.prank(alice);vm.expectRevert(VeloPerpsV4.Expired.selector);engine.openPosition(p,empty);solvent();
    }
    function test_OracleRejectsStaleFutureConfidenceAndExponent() public {
        oracle.set(50000e8,0,-8,block.timestamp-6);vm.expectRevert(VeloPerpsV4.OracleInvalid.selector);open(true,1000e6,10);
        oracle.set(50000e8,0,-8,block.timestamp+1);vm.expectRevert(VeloPerpsV4.OracleInvalid.selector);open(true,1000e6,10);
        oracle.set(50000e8,1000e8,-8,0);vm.expectRevert(VeloPerpsV4.OracleInvalid.selector);open(true,1000e6,10);
        oracle.set(50000e8,0,-19,0);vm.expectRevert(VeloPerpsV4.OracleInvalid.selector);open(true,1000e6,10);solvent();
    }
    function test_OracleFeesAreExactAndNotTrapped() public {
        oracle.setFee(1);vm.expectRevert(VeloPerpsV4.OracleFeeMismatch.selector);open(true,1000e6,10);
        vm.deal(alice,1 ether);VeloPerpsV4.OpenParams memory p=params(true,1000e6,10);
        vm.prank(alice);engine.openPosition{value:1}(p,empty);assertEq(address(engine).balance,0);assertEq(address(oracle).balance,1);
    }
    function test_FeedImmutableAndRiskFrozenUnderExposure() public {
        open(true,1000e6,10);vm.expectRevert(VeloPerpsV4.RiskLimit.selector);engine.setMarketRisk(0,risk());
        vm.expectRevert(VeloPerpsV4.InvalidInput.selector);engine.registerPair(0,bytes32(uint256(2)),"OTHER",risk());
        vm.expectRevert(VeloPerpsV4.InvalidInput.selector);engine.registerPair(1,bytes32(uint256(1)),"DUP",risk());
    }
    function test_DisabledMarketStillAllowsClose() public {
        uint256 id=open(true,1000e6,10);engine.setPairTradable(0,false);vm.warp(block.timestamp+2);close(id,true);solvent();
    }
    function test_LiquidationLeavesNoDebtOrPhantomBalance() public {
        uint256 id=open(true,1000e6,25);oracle.set(10000e8,0,-8,0);
        vm.prank(bob);engine.liquidate(id,empty);assertEq(engine.collateralEscrow(),0);assertEq(engine.reservedProfit(),0);
        assertEq(engine.getPosition(id).owner,address(0));solvent();
    }
    function test_HealthyPositionCannotBeLiquidated() public {
        uint256 id=open(true,1000e6,10);vm.expectRevert(VeloPerpsV4.NotLiquidatable.selector);engine.liquidate(id,empty);
    }
    function test_TriggeredClosePaysOwnerAndBoundedKeeper() public {
        VeloPerpsV4.OpenParams memory p=params(true,1000e6,10);p.takeProfit_E18=55000e18;
        vm.prank(alice);uint256 id=engine.openPosition(p,empty);uint256 before=token.balanceOf(alice);
        oracle.set(56000e8,0,-8,0);vm.warp(block.timestamp+2);vm.prank(bob);engine.closeIfTriggered(id,empty);
        assertGt(token.balanceOf(alice),before);assertGt(token.balanceOf(bob),0);solvent();
    }
    function test_OrderEscrowRefundsWhilePausedAndCannotBeStolen() public {
        uint256 before=token.balanceOf(alice);uint256 id=order(49000e18);assertEq(engine.orderEscrow(),1000e6);
        engine.setEntriesPaused(true);vm.prank(bob);vm.expectRevert(VeloPerpsV4.NotAuthorized.selector);engine.cancelConditionalOrder(id);
        vm.prank(alice);engine.cancelConditionalOrder(id);assertEq(token.balanceOf(alice),before);assertEq(engine.orderEscrow(),0);solvent();
    }
    function test_AnyoneCanExpireOrderButOnlyOwnerReceivesRefund() public {
        uint256 id=order(49000e18);vm.warp(block.timestamp+61);vm.prank(bob);engine.cancelConditionalOrder(id);
        assertEq(token.balanceOf(bob),0);assertEq(engine.orderEscrow(),0);solvent();
    }
    function test_LimitFillsAtActualExecutionPrice() public {
        uint256 id=order(49000e18);oracle.set(48000e8,0,-8,0);engine.executeConditionalOrder(id,empty);
        VeloPerpsV4.Position memory p=engine.getPosition(1);assertLt(p.entryPrice_E18,49000e18);assertGt(p.entryPrice_E18,48000e18);
        assertEq(p.owner,alice);assertEq(engine.orderEscrow(),0);solvent();
    }
    function test_UntriggeredOrderRetainsEscrow() public {
        uint256 id=order(49000e18);vm.expectRevert(VeloPerpsV4.TriggerNotHit.selector);engine.executeConditionalOrder(id,empty);
        assertEq(engine.orderEscrow(),1000e6);assertEq(engine.getTraderOrders(alice).length,1);solvent();
    }
    function test_DirectDonationsRequireExplicitAccounting() public {
        token.mint(address(engine),100e6);assertEq(engine.poolAssets(),1_000_000e6);
        engine.accountSurplus();assertEq(engine.poolAssets(),1_000_100e6);solvent();
    }
    function test_RemovedSelectorsAbsent() public {
        (bool ok,)=address(engine).call(abi.encodeWithSignature("increaseCollateral(uint256,uint64)",1,1e6));assertFalse(ok);
        (ok,)=address(engine).call(abi.encodeWithSignature("partialClose(uint256,uint16,bytes[])",1,5000,empty));assertFalse(ok);
        (ok,)=address(engine).call(abi.encodeWithSignature("depositCross(uint64)",1e6));assertFalse(ok);
    }
    function testFuzz_SettlementSolvency(uint64 c,uint8 lev,uint64 price,uint32 elapsed,bool long) public {
        c=uint64(bound(c,2e6,1000e6));lev=uint8(bound(lev,1,25));price=uint64(bound(price,1e8,200000e8));
        uint256 id=open(long,c,lev);oracle.set(int64(price),0,-8,0);vm.warp(block.timestamp+bound(elapsed,2,7 days));close(id,long);
        assertEq(engine.collateralEscrow(),0);assertEq(engine.reservedProfit(),0);solvent();
    }
}
