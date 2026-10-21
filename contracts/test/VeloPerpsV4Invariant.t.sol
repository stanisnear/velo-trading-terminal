// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "forge-std/StdInvariant.sol";
import {VeloPerpsV4Test,V4USDC,V4Pyth} from "./VeloPerpsV4.t.sol";
import {VeloPerpsV4} from "../src/VeloPerpsV4.sol";
import "forge-std/Test.sol";

contract V4Handler is Test {
    VeloPerpsV4 public engine;
    V4USDC public token;
    V4Pyth public oracle;
    uint256 public successes;
    bytes[] empty;
    constructor(VeloPerpsV4 e,V4USDC t,V4Pyth p) {
        engine=e;token=t;oracle=p;
        token.mint(address(this),10_000_000e6);
        token.approve(address(e),type(uint256).max);
    }
    function open(uint64 collateral,uint8 leverage,bool long) external {
        collateral=uint64(bound(collateral,2e6,1000e6));leverage=uint8(bound(leverage,1,25));
        VeloPerpsV4.OpenParams memory p=VeloPerpsV4.OpenParams(0,long,collateral,leverage,0,0,
            long?uint128(60000e18):uint128(40000e18),uint64(block.timestamp+60));
        oracle.set(50000e8,0,-8,0);
        try engine.openPosition(p,empty) {successes++;} catch {}
    }
    function close(uint256 seed,uint64 mark,uint32 elapsed,bool liquidation) external {
        uint256[] memory ids=engine.getTraderTrades(address(this));
        if(ids.length==0)return;
        uint256 id=ids[seed%ids.length];
        vm.warp(block.timestamp+bound(elapsed,2,1 days));
        mark=uint64(bound(mark,10000e8,100000e8));oracle.set(int64(mark),0,-8,0);
        VeloPerpsV4.Position memory p=engine.getPosition(id);
        if(liquidation) {try engine.liquidate(id,empty) {successes++;} catch {}}
        else {try engine.closePosition(id,p.isLong?uint128(1):type(uint128).max,uint64(block.timestamp+60),empty) {successes++;} catch {}}
    }
    function order(uint64 amount,bool cancel) external {
        uint256[] memory ids=engine.getTraderOrders(address(this));
        if(cancel&&ids.length!=0) {try engine.cancelConditionalOrder(ids[0]) {successes++;} catch {} return;}
        amount=uint64(bound(amount,2e6,500e6));
        VeloPerpsV4.OpenParams memory p=VeloPerpsV4.OpenParams(0,true,amount,10,0,0,50000e18,uint64(block.timestamp+1 hours));
        try engine.placeConditionalOrder(VeloPerpsV4.OrderParams(p,0,49000e18)) {successes++;} catch {}
    }
    function execute(uint256 seed) external {
        uint256[] memory ids=engine.getTraderOrders(address(this));
        if(ids.length==0)return;oracle.set(48000e8,0,-8,0);
        try engine.executeConditionalOrder(ids[seed%ids.length],empty) {successes++;} catch {}
    }
}

contract VeloPerpsV4InvariantTest is StdInvariant,VeloPerpsV4Test {
    V4Handler handler;
    function setUp() public override {
        super.setUp();handler=new V4Handler(engine,token,oracle);
        bytes4[] memory selectors=new bytes4[](4);
        selectors[0]=V4Handler.open.selector;selectors[1]=V4Handler.close.selector;
        selectors[2]=V4Handler.order.selector;selectors[3]=V4Handler.execute.selector;
        targetSelector(FuzzSelector({addr:address(handler),selectors:selectors}));
        targetContract(address(handler));
    }
    function invariant_SegregatedBalancesAndReserves() public view {
        assertEq(token.balanceOf(address(engine)),engine.accountedBalance());
        assertGe(engine.poolAssets(),engine.reservedProfit());
    }
    function invariant_EscrowMatchesEveryOpenPositionAndOrder() public view {
        uint256[] memory ids=engine.getTraderTrades(address(handler));
        uint256 collateral;uint256 notional;
        for(uint256 i;i<ids.length;i++){
            VeloPerpsV4.Position memory p=engine.getPosition(ids[i]);
            collateral+=p.collateralUSDC_6;notional+=p.originalNotional_6;
            assertEq(p.originalNotional_6,uint256(p.collateralUSDC_6)*p.leverage);
        }
        ids=engine.getTraderOrders(address(handler));
        uint256 orders;
        for(uint256 i;i<ids.length;i++){
            (,,,,,,,,uint64 c,,,)=engine.conditionalOrders(ids[i]);
            orders+=c;
        }
        assertEq(engine.collateralEscrow(),collateral);
        assertEq(engine.reservedProfit(),notional);
        assertEq(engine.openInterest(0),notional);
        assertEq(engine.orderEscrow(),orders);
    }
    function afterInvariant() public view {
        assertGt(handler.successes(),0);
    }
}
