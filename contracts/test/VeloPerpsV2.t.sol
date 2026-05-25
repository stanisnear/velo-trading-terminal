// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import {VeloPerpsV2} from "../src/VeloPerpsV2.sol";
import {PerpsMath} from "../src/libraries/PerpsMath.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─── Mocks (shared shape with V1 tests) ───────────────────────────────────────

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

contract VeloPerpsV2Test is Test {
    VeloPerpsV2 internal velo;
    MockUSDC  internal usdc;
    MockPyth  internal pyth;

    bytes32 constant BTC_FEED = bytes32(uint256(0xBC));

    address constant ALICE  = address(0xA11CE);
    address constant BOB    = address(0xB0B);
    address constant KEEPER = address(0xCAD);

    function setUp() public {
        usdc = new MockUSDC();
        pyth = new MockPyth();
        velo = new VeloPerpsV2(IERC20(address(usdc)), IPyth(address(pyth)), address(this));

        velo.registerPair(0, BTC_FEED, "BTC/USD");

        usdc.mint(ALICE, 100_000 * 1e6);
        usdc.mint(BOB,   100_000 * 1e6);
        usdc.mint(address(velo), 100_000 * 1e6); // pool seed

        // Price = $50,000 (expo -8 from Pyth)
        pyth.setPrice(BTC_FEED, 50_000 * 1e8, -8);
    }

    function _openAliceLong10x() internal returns (uint256 tradeId) {
        vm.startPrank(ALICE);
        usdc.approve(address(velo), 1_000 * 1e6);
        bytes[] memory empty;
        tradeId = velo.openPosition(0, true, 1_000 * 1e6, 10, empty);
        vm.stopPrank();
    }

    // ── version() smoke test ─────────────────────────────────────────────
    function test_VersionIs2() public view {
        assertEq(velo.VERSION(), 2);
    }

    // ── increaseCollateral ───────────────────────────────────────────────
    function test_IncreaseCollateral_LowersEffectiveLeverage() public {
        uint256 id = _openAliceLong10x();

        uint256 effBefore = velo.effectiveLeverage(id);
        assertEq(effBefore, 10, "starts at 10x");

        vm.startPrank(ALICE);
        usdc.approve(address(velo), 1_000 * 1e6);
        velo.increaseCollateral(id, 1_000 * 1e6);
        vm.stopPrank();

        // Doubled collateral → roughly halved effective leverage.
        // Original notional = 999 (after open fee) × 10 = 9990.
        // After adding 1000: new collateral = 1999. Effective = 9990 / 1999 = 4.997.
        // Solidity integer division floors → 4.
        uint256 effAfter = velo.effectiveLeverage(id);
        assertEq(effAfter, 4, "~5x after doubling collateral (integer floor)");
    }

    function test_IncreaseCollateral_RevertsForNonOwner() public {
        uint256 id = _openAliceLong10x();
        vm.startPrank(BOB);
        usdc.approve(address(velo), 100 * 1e6);
        vm.expectRevert(VeloPerpsV2.NotPositionOwner.selector);
        velo.increaseCollateral(id, 100 * 1e6);
        vm.stopPrank();
    }

    // ── decreaseCollateral ───────────────────────────────────────────────
    function test_DecreaseCollateral_HappyPath() public {
        uint256 id = _openAliceLong10x();
        // Position is healthy (entry == mark), at 10x with 1000 collateral.
        // notional ≈ 10000; new collateral floor = 10000 / 25 = 400 → can withdraw up to ~600.

        vm.startPrank(ALICE);
        bytes[] memory empty;
        uint256 balBefore = usdc.balanceOf(ALICE);
        velo.decreaseCollateral(id, 200 * 1e6, empty);
        uint256 balAfter = usdc.balanceOf(ALICE);
        assertEq(balAfter - balBefore, 200 * 1e6, "got 200 back");
        vm.stopPrank();
    }

    function test_DecreaseCollateral_RevertsWhenLeverageWouldExceedMax() public {
        uint256 id = _openAliceLong10x();
        vm.startPrank(ALICE);
        bytes[] memory empty;
        // Try to drain so much collateral that effective leverage > 25
        // notional ~9990 (1000 - 0.1% fee = 999, ×10 = 9990).
        // For effective leverage > 25, new collateral < 9990 / 25 ≈ 399.6.
        // So withdrawing > ~599.4 should revert.
        vm.expectRevert(VeloPerpsV2.LeverageWouldExceedMax.selector);
        velo.decreaseCollateral(id, 700 * 1e6, empty);
        vm.stopPrank();
    }

    // ── partialClose ─────────────────────────────────────────────────────
    function test_PartialClose_AtBreakeven_ReturnsHalfCollateral() public {
        uint256 id = _openAliceLong10x();

        uint256 balBefore = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        bytes[] memory empty;
        velo.partialClose(id, 5000, empty); // 50%

        // At entry price == mark, PnL = 0. Half of effective collateral returned
        // (minus close fee of 0.1% on the returned amount).
        uint256 balAfter = usdc.balanceOf(ALICE);
        uint256 received = balAfter - balBefore;
        // collateral_after_open_fee ~= 999, half = ~499.5, minus 0.1% close fee ~= 499.0
        assertApproxEqAbs(received, 499 * 1e6, 1 * 1e6);

        // Remaining position should still exist with ~half the collateral
        VeloPerpsV2.Position memory p = velo.getPosition(id);
        assertEq(p.owner, ALICE);
        assertApproxEqAbs(p.collateralUSDC_6, 499.5 * 1e6, 1 * 1e6);
    }

    function test_PartialClose_RevertsOnInvalidFraction() public {
        uint256 id = _openAliceLong10x();
        vm.startPrank(ALICE);
        bytes[] memory empty;
        vm.expectRevert(VeloPerpsV2.FractionInvalid.selector);
        velo.partialClose(id, 0, empty);
        vm.expectRevert(VeloPerpsV2.FractionInvalid.selector);
        velo.partialClose(id, 10_001, empty);
        vm.stopPrank();
    }

    // ── setTriggers ──────────────────────────────────────────────────────
    function test_SetTriggers_HappyPath() public {
        uint256 id = _openAliceLong10x();
        // Entry $50k, long → TP must be > 50k, SL must be < 50k (E18 scaled)
        uint128 tp = uint128(55_000 * 1e18);
        uint128 sl = uint128(45_000 * 1e18);
        vm.prank(ALICE);
        velo.setTriggers(id, tp, sl);
        VeloPerpsV2.Position memory p = velo.getPosition(id);
        assertEq(p.takeProfit_E18, tp);
        assertEq(p.stopLoss_E18,   sl);
    }

    function test_SetTriggers_RevertsOnWrongSide() public {
        uint256 id = _openAliceLong10x();
        vm.prank(ALICE);
        vm.expectRevert(VeloPerpsV2.InvalidTrigger.selector);
        velo.setTriggers(id, uint128(45_000 * 1e18), 0); // TP < entry on a long
    }

    // ── closeIfTriggered ─────────────────────────────────────────────────
    function test_CloseIfTriggered_TPHit_KeeperBountyPaid() public {
        uint256 id = _openAliceLong10x();
        uint128 tp = uint128(55_000 * 1e18);
        vm.prank(ALICE);
        velo.setTriggers(id, tp, 0);

        // Mark crosses TP
        pyth.setPrice(BTC_FEED, 56_000 * 1e8, -8);

        uint256 aliceBefore  = usdc.balanceOf(ALICE);
        uint256 keeperBefore = usdc.balanceOf(KEEPER);

        bytes[] memory empty;
        vm.prank(KEEPER);
        velo.closeIfTriggered(id, empty);

        // Trader got the bulk, keeper got the bounty
        assertGt(usdc.balanceOf(ALICE),  aliceBefore,  "trader paid");
        assertGt(usdc.balanceOf(KEEPER), keeperBefore, "keeper bounty");

        // Position deleted
        VeloPerpsV2.Position memory p = velo.getPosition(id);
        assertEq(p.owner, address(0));
    }

    function test_CloseIfTriggered_RevertsIfNotHit() public {
        uint256 id = _openAliceLong10x();
        uint128 tp = uint128(55_000 * 1e18);
        vm.prank(ALICE);
        velo.setTriggers(id, tp, 0);
        // Mark unchanged at 50k — TP not hit
        bytes[] memory empty;
        vm.prank(KEEPER);
        vm.expectRevert(VeloPerpsV2.TriggerNotHit.selector);
        velo.closeIfTriggered(id, empty);
    }

    function test_CloseIfTriggered_SLHit_OnShort() public {
        // Open a short instead
        vm.startPrank(BOB);
        usdc.approve(address(velo), 1_000 * 1e6);
        bytes[] memory empty;
        uint256 id = velo.openPosition(0, false, 1_000 * 1e6, 10, empty);
        // Short: TP must be < entry, SL must be > entry
        velo.setTriggers(id, 0, uint128(52_000 * 1e18));
        vm.stopPrank();

        // Mark rises past SL
        pyth.setPrice(BTC_FEED, 53_000 * 1e8, -8);
        vm.prank(KEEPER);
        velo.closeIfTriggered(id, empty);

        VeloPerpsV2.Position memory p = velo.getPosition(id);
        assertEq(p.owner, address(0), "position closed");
    }
}
