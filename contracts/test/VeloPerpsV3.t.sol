// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {VeloPerpsV3} from "../src/VeloPerpsV3.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDCV3 is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract MockPythV3 is IPyth {
    mapping(bytes32 => Price) public stored;
    function setPrice(bytes32 id, int64 price, int32 expo) external {
        stored[id] = Price({price: price, conf: 0, expo: expo, publishTime: block.timestamp});
    }
    function updatePriceFeeds(bytes[] calldata) external payable {}
    function getUpdateFee(bytes[] calldata) external pure returns (uint) { return 0; }
    function getPriceNoOlderThan(bytes32 id, uint) external view returns (Price memory) {
        return stored[id];
    }
}

contract VeloPerpsV3Test is Test {
    VeloPerpsV3 internal velo;
    MockUSDCV3 internal usdc;
    MockPythV3 internal pyth;

    bytes32 constant BTC_FEED = bytes32(uint256(0xBC));

    address constant ALICE = address(0xA11CE);
    address constant KEEPER = address(0xBEEF);

    function setUp() public {
        usdc = new MockUSDCV3();
        pyth = new MockPythV3();
        velo = new VeloPerpsV3(IERC20(address(usdc)), IPyth(address(pyth)), address(this));

        velo.registerPair(0, BTC_FEED, "BTC/USD");

        usdc.mint(ALICE, 250_000 * 1e6);
        usdc.mint(address(velo), 250_000 * 1e6);

        pyth.setPrice(BTC_FEED, 50_000 * 1e8, -8);
    }

    function test_CrossDepositOpenAndClose() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);

        velo.depositCross(10_000 * 1e6);
        assertEq(velo.crossBalanceUSDC_6(ALICE), 10_000 * 1e6);

        bytes[] memory empty;
        uint256 tradeId = velo.openPosition(0, true, 1_000 * 1e6, 10, uint8(VeloPerpsV3.MarginMode.CROSS), empty);

        assertEq(velo.crossLockedUSDC_6(ALICE), 999 * 1e6);
        pyth.setPrice(BTC_FEED, 51_000 * 1e8, -8);

        velo.closePosition(tradeId, empty);
        assertEq(velo.crossLockedUSDC_6(ALICE), 0);
        assertGt(velo.crossBalanceUSDC_6(ALICE), 10_000 * 1e6 - 1_000_000);
        vm.stopPrank();
    }

    function test_ConditionalLimitOpenExecutesOnTrigger() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);

        uint128 trigger = uint128(49_500 * 1e18);
        uint256 orderId = velo.placeConditionalOrder(
            VeloPerpsV3.PlaceConditionalOrderParams({
                pairIndex: 0,
                isLong: true,
                leverage: 10,
                marginMode: uint8(VeloPerpsV3.MarginMode.ISOLATED),
                triggerKind: uint8(VeloPerpsV3.TriggerKind.LIMIT),
                triggerPrice_E18: trigger,
                collateralUSDC_6: 1_000 * 1e6,
                reduceOnly: false,
                reduceBps: 0
            })
        );

        bytes[] memory empty;
        vm.expectRevert(VeloPerpsV3.OrderNotTriggered.selector);
        velo.executeConditionalOrder(orderId, empty);

        pyth.setPrice(BTC_FEED, 49_400 * 1e8, -8);
        velo.executeConditionalOrder(orderId, empty);

        uint256[] memory ids = velo.getTraderTrades(ALICE);
        assertEq(ids.length, 1);
        vm.stopPrank();
    }

    function test_ReduceOnlyStopOrderPartiallyCloses() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);

        bytes[] memory empty;
        uint256 tradeId = velo.openPosition(0, true, 1_000 * 1e6, 10, uint8(VeloPerpsV3.MarginMode.ISOLATED), empty);

        // Stop for long triggers when mark >= trigger in this implementation.
        uint256 orderId = velo.placeConditionalOrder(
            VeloPerpsV3.PlaceConditionalOrderParams({
                pairIndex: 0,
                isLong: true,
                leverage: 10,
                marginMode: uint8(VeloPerpsV3.MarginMode.ISOLATED),
                triggerKind: uint8(VeloPerpsV3.TriggerKind.STOP),
                triggerPrice_E18: uint128(51_000 * 1e18),
                collateralUSDC_6: 0,
                reduceOnly: true,
                reduceBps: 5000
            })
        );

        pyth.setPrice(BTC_FEED, 51_500 * 1e8, -8);
        velo.executeConditionalOrder(orderId, empty);

        VeloPerpsV3.Position memory p = velo.getPosition(tradeId);
        assertGt(p.collateralUSDC_6, 0);
        assertLt(p.collateralUSDC_6, 999 * 1e6);
        vm.stopPrank();
    }

    function test_SetTriggersAndKeeperClose() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);

        bytes[] memory empty;
        uint256 tradeId = velo.openPosition(0, true, 1_000 * 1e6, 10, uint8(VeloPerpsV3.MarginMode.ISOLATED), empty);

        velo.setTriggers(tradeId, uint128(52_000 * 1e18), uint128(48_000 * 1e18));
        vm.stopPrank();

        pyth.setPrice(BTC_FEED, 52_200 * 1e8, -8);
        vm.prank(KEEPER);
        velo.closeIfTriggered(tradeId, empty);

        VeloPerpsV3.Position memory p = velo.getPosition(tradeId);
        assertEq(p.owner, address(0));
    }

    function test_PairLiquidityCapBlocksOversizedOpen() public {
        velo.setPairRisk(0, uint128(5_000 * 1e6), 0);

        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty;

        // Effective collateral ~= 999, notional ~= 9990 -> above 5k cap.
        vm.expectRevert(VeloPerpsV3.PairLiquidityExceeded.selector);
        velo.openPosition(0, true, 1_000 * 1e6, 10, uint8(VeloPerpsV3.MarginMode.ISOLATED), empty);
        vm.stopPrank();
    }

    function test_FundingAffectsPayout() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty;

        uint256 tradeId = velo.openPosition(0, true, 1_000 * 1e6, 10, uint8(VeloPerpsV3.MarginMode.ISOLATED), empty);
        uint256 before = usdc.balanceOf(ALICE);

        // Longs pay funding.
        vm.stopPrank();
        velo.setPairRisk(0, type(uint128).max, 100); // +1%/hour on index side
        vm.startPrank(ALICE);
        vm.warp(block.timestamp + 3600);
        velo.accrueFunding(0);

        velo.closePosition(tradeId, empty);
        uint256 afterBal = usdc.balanceOf(ALICE);

        // Closing at same mark, payout should be less than no-funding baseline due to funding payment.
        assertLt(afterBal - before, 999 * 1e6);
        vm.stopPrank();
    }
}
