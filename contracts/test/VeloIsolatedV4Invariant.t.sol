// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "forge-std/Test.sol";
import {VeloIsolatedV4Candidate as Engine} from "../src/VeloIsolatedV4Candidate.sol";
import {CandidateUSDC, CandidateOracle} from "./VeloIsolatedV4Candidate.t.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPythV2} from "../src/interfaces/IPythV2.sol";

contract V4AccountingHandler is Test {
    Engine public engine; CandidateUSDC public usdc; CandidateOracle public oracle; bytes[] empty;
    constructor(Engine e,CandidateUSDC u,CandidateOracle o) { engine=e;usdc=u;oracle=o;u.approve(address(e),type(uint256).max); }
    function acceptOperator() external { engine.acceptOwnership(); }
    function open(bool isLong,uint64 rawMargin,uint16 rawLeverage) external {
        vm.roll(block.number+1); oracle.setPrice(50_000e8);
        Engine.OpenParams memory p=Engine.OpenParams(0,isLong,uint64(bound(rawMargin,1e6,2000e6)),uint16(bound(rawLeverage,1,25)),isLong?type(uint128).max:uint128(1),uint64(block.timestamp+60),0,0);
        try engine.openPosition(p,empty) {} catch {}
    }
    function close(uint256 rawId,uint16 rawFraction,uint64 rawPrice) external {
        uint256 id=rawId%engine.nextPositionId(); (address trader,,bool isLong,,,,,)=engine.positions(id); if(trader==address(0))return;
        oracle.setPrice(int64(int256(bound(rawPrice,1,200_000)*1e8)));
        try engine.closePosition(id,uint16(bound(rawFraction,1,10_000)),isLong?uint128(1):type(uint128).max,uint64(block.timestamp+60),empty) {} catch {}
    }
    function margin(uint256 rawId,uint64 rawAmount) external {
        uint256 id=rawId%engine.nextPositionId(); (address trader,,,,,,,)=engine.positions(id);if(trader==address(0))return;
        try engine.addMargin(id,uint64(bound(rawAmount,1,1000e6))) {} catch {}
    }
    function withdrawPool(uint64 rawAmount) external {
        uint256 free=engine.freeLiquidity(); if(free==0)return;
        engine.withdrawPool(bound(rawAmount,1,free),address(this));
    }
    function fundPool(uint64 rawAmount) external {
        uint256 bal=usdc.balanceOf(address(this)); if(bal==0)return;
        engine.fundPool(bound(rawAmount,1,bal));
    }
    function order(bool isLong,uint64 rawMargin) external {
        Engine.OpenParams memory p=Engine.OpenParams(0,isLong,uint64(bound(rawMargin,1e6,1000e6)),10,isLong?uint128(49_000e18):uint128(51_000e18),uint64(block.timestamp+60),0,0);
        try engine.placeOrder(p,Engine.OrderKind.Limit,p.limitPrice) {} catch {}
    }
    function cancel(uint256 rawId) external {
        uint256 id=rawId%engine.nextOrderId();try engine.cancelOrder(id) {} catch {}
    }
    function execute(uint256 rawId) external {
        uint256 id=rawId%engine.nextOrderId();(address trader,Engine.OpenParams memory p,,,)=engine.orders(id);if(trader==address(0))return;
        vm.roll(block.number+1); oracle.setPrice(p.isLong?int64(49_000e8):int64(51_000e8));
        try engine.executeOrder(id,empty) {} catch {}
    }
}
contract VeloIsolatedV4InvariantTest is Test {
    Engine engine;CandidateUSDC usdc;CandidateOracle oracle;V4AccountingHandler handler;
    function setUp() public {
        vm.warp(100_000);usdc=new CandidateUSDC();oracle=new CandidateOracle();
        engine=new Engine(IERC20(address(usdc)),IPythV2(address(oracle)),address(this));engine.registerMarket(0,bytes32(uint256(1)));engine.setOpeningsPaused(false);
        usdc.mint(address(this),500_000e6);usdc.approve(address(engine),type(uint256).max);engine.fundPool(500_000e6);
        handler=new V4AccountingHandler(engine,usdc,oracle);usdc.mint(address(handler),500_000e6);
        engine.transferOwnership(address(handler));handler.acceptOperator();
        bytes4[] memory selectors=new bytes4[](8);
        selectors[0]=handler.open.selector;selectors[1]=handler.close.selector;selectors[2]=handler.margin.selector;selectors[3]=handler.withdrawPool.selector;
        selectors[4]=handler.fundPool.selector;selectors[5]=handler.order.selector;selectors[6]=handler.cancel.selector;selectors[7]=handler.execute.selector;
        targetContract(address(handler));targetSelector(FuzzSelector(address(handler),selectors));
    }
    function invariant_AccountingAndReservationsConserved() public view {
        assertEq(engine.accountedBalance(),usdc.balanceOf(address(engine)));
        assertGe(engine.poolAssets(),engine.reservedProfit());
        uint256 margins;uint256 notionals;uint256 escrow;
        for(uint256 i=1;i<engine.nextPositionId();++i){(,,,uint256 c,uint256 n,,,)=engine.positions(i);margins+=c;notionals+=n;}
        for(uint256 i=1;i<engine.nextOrderId();++i){(,,,,uint256 e)=engine.orders(i);escrow+=e;}
        assertEq(margins,engine.positionCollateral());assertEq(notionals,engine.reservedProfit());assertEq(escrow,engine.orderEscrow());
        (,,uint256 oi,,)=engine.markets(0);assertEq(oi,notionals);
    }
}
