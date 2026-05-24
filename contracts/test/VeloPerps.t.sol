// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {VeloPerps} from "../src/VeloPerps.sol";
import {PerpsMath} from "../src/libraries/PerpsMath.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─── Mocks ────────────────────────────────────────────────────────────────────

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract MockPyth is IPyth {
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

// ─── Tests ────────────────────────────────────────────────────────────────────

contract VeloPerpsTest is Test {
    VeloPerps internal velo;
    MockUSDC  internal usdc;
    MockPyth  internal pyth;

    bytes32 constant BTC_FEED = bytes32(uint256(0xBC));
    bytes32 constant ETH_FEED = bytes32(uint256(0xEE));

    address constant ALICE = address(0xA11CE);
    address constant BOB   = address(0xB0B);
    address constant CHAD  = address(0xCAD);

    function setUp() public {
        usdc = new MockUSDC();
        pyth = new MockPyth();
        velo = new VeloPerps(IERC20(address(usdc)), IPyth(address(pyth)), address(this));

        velo.registerPair(0, BTC_FEED, "BTC/USD");
        velo.registerPair(1, ETH_FEED, "ETH/USD");

        usdc.mint(ALICE, 100_000 * 1e6);
        usdc.mint(BOB,   100_000 * 1e6);

        // Seed the perp pool — DeployBaseSepolia.s.sol does this on real deploy
        // (100k mUSDC bootstrap so winning trades have something to settle against).
        // Without it, a $1k @ 10x position that goes +5% wins ~$500, but the pool
        // would only hold the trader's own $1k collateral. Contract correctly
        // reverts with InsufficientPool — that's the safety check, not a bug.
        usdc.mint(address(velo), 100_000 * 1e6);

        pyth.setPrice(BTC_FEED, 65_000 * 1e8, -8);
        pyth.setPrice(ETH_FEED,  3_500 * 1e8, -8);
    }

    function testNormalisePrice_StandardCryptoFeed() public pure {
        uint256 got = PerpsMath.normalisePythPrice(int64(65_000 * 1e8), -8);
        assertEq(got, 65_000 * 1e18, "BTC normalised");
    }

    function testOpenLongCloseProfit() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);

        // 1000 USDC × 10x BTC long @ $65k
        uint256 tradeId = velo.openPosition(0, true, 1000 * 1e6, 10, empty);

        VeloPerps.Position memory pos = velo.getPosition(tradeId);
        assertEq(pos.collateralUSDC_6, 999 * 1e6, "effective collateral after 0.1% fee");
        assertEq(pos.entryPrice_E18, 65_000 * 1e18);

        // BTC moves +5% to $68,250 → 10x long = +50% on collateral
        pyth.setPrice(BTC_FEED, 68_250 * 1e8, -8);

        uint256 balBefore = usdc.balanceOf(ALICE);
        velo.closePosition(tradeId, empty);
        uint256 actual = usdc.balanceOf(ALICE) - balBefore;
        // gross = 999 + 499.5 = 1498.5; fee 1.4985; net ≈ 1497.0015 USDC
        assertApproxEqAbs(actual, 1497_001_500, 5, "alice profit payout");

        vm.stopPrank();

        // open 1 + close ≈ 1.4985 ≈ 2.4985 USDC fees
        assertApproxEqAbs(velo.feeBalance(), 2_498_500, 5, "fees");
        assertEq(velo.getTraderTrades(ALICE).length, 0);
    }

    function testOpenLongCloseSmallLoss() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);

        uint256 tradeId = velo.openPosition(1, true, 1000 * 1e6, 5, empty);

        // ETH drops 4% to $3360 → 5x long = -20%
        pyth.setPrice(ETH_FEED, 3_360 * 1e8, -8);

        uint256 balBefore = usdc.balanceOf(ALICE);
        velo.closePosition(tradeId, empty);
        uint256 actual = usdc.balanceOf(ALICE) - balBefore;
        // gross = 999 - 199.8 = 799.2; fee 0.7992; net ≈ 798.4 USDC
        assertApproxEqAbs(actual, 798_400_800, 5, "loss payout");
        vm.stopPrank();
    }

    function testLiquidate_LossExceedsThreshold() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        uint256 tradeId = velo.openPosition(0, true, 1000 * 1e6, 25, empty);
        vm.stopPrank();

        // BTC drops 4% @ 25x → 100% loss, past 90% threshold
        pyth.setPrice(BTC_FEED, 62_400 * 1e8, -8);

        uint256 chadBefore = usdc.balanceOf(CHAD);
        vm.prank(CHAD);
        velo.liquidate(tradeId, empty);

        // 1% bounty of 999 USDC effective collateral
        assertEq(usdc.balanceOf(CHAD) - chadBefore, 9_990_000, "liquidator bounty");
        VeloPerps.Position memory p = velo.getPosition(tradeId);
        assertEq(p.owner, address(0));
    }

    function testLiquidate_RevertsBeforeThreshold() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        uint256 tradeId = velo.openPosition(0, true, 1000 * 1e6, 5, empty);
        vm.stopPrank();

        // 5% drop × 5x lev = 25% loss → not liquidatable
        pyth.setPrice(BTC_FEED, 61_750 * 1e8, -8);

        vm.expectRevert(VeloPerps.NotLiquidatable.selector);
        vm.prank(CHAD);
        velo.liquidate(tradeId, empty);
    }

    function testOpen_RevertsOnUnregisteredPair() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(VeloPerps.PairNotRegistered.selector);
        velo.openPosition(99, true, 1000 * 1e6, 10, empty);
        vm.stopPrank();
    }

    function testOpen_RevertsOnExcessiveLeverage() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        vm.expectRevert(VeloPerps.LeverageOutOfRange.selector);
        velo.openPosition(0, true, 1000 * 1e6, 26, empty);
        vm.stopPrank();
    }

    function testClose_RevertsForNonOwner() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        uint256 tradeId = velo.openPosition(0, true, 1000 * 1e6, 5, empty);
        vm.stopPrank();

        vm.expectRevert(VeloPerps.NotPositionOwner.selector);
        vm.prank(BOB);
        velo.closePosition(tradeId, empty);
    }

    function testWithdrawFees() public {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), type(uint256).max);
        bytes[] memory empty = new bytes[](0);
        velo.openPosition(0, true, 10_000 * 1e6, 5, empty);
        vm.stopPrank();

        uint256 fees = velo.feeBalance();
        assertEq(fees, 10 * 1e6, "open fee on 10k = 10 USDC");

        velo.withdrawFees(address(this), fees);
        assertEq(usdc.balanceOf(address(this)), fees);
        assertEq(velo.feeBalance(), 0);
    }
}
