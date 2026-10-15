// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;
import "forge-std/Test.sol";
import {VeloPerpsV3_1} from "../src/VeloPerpsV3_1.sol";
import {IPythV2} from "../src/interfaces/IPythV2.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AuditUSDC is ERC20 {
    constructor() ERC20("Test", "TEST") {}
    function mint(address to, uint256 value) external { _mint(to, value); }
}
contract AuditPyth is IPythV2 {
    int64 public value = 50000e8;
    function setPrice(int64 p) external { value = p; }
    function updatePriceFeeds(bytes[] calldata) external payable {}
    function getUpdateFee(bytes[] calldata) external pure returns(uint) { return 0; }
    function getPriceNoOlderThan(bytes32, uint) external view returns(Price memory) { return Price(value,0,-8,block.timestamp); }
    function parsePriceFeedUpdates(bytes[] calldata, bytes32[] calldata ids, uint64, uint64) external payable returns(PriceFeed[] memory feeds) {
        feeds = new PriceFeed[](1);
        Price memory p = Price(value,0,-8,block.timestamp);
        feeds[0] = PriceFeed(ids[0],p,p);
    }
}

/// Passing reproduction tests CONFIRM defects in immutable V3.1. They are not
/// acceptance tests for a corrected release. No live chain or wallets are used.
contract VeloPerpsV31AuditTest is Test {
    VeloPerpsV3_1 velo; AuditUSDC usdc; AuditPyth pyth;
    address alice = address(0xA11CE);
    bytes[] empty;
    function setUp() public {
        vm.warp(1000);
        usdc = new AuditUSDC(); pyth = new AuditPyth();
        velo = new VeloPerpsV3_1(IERC20(address(usdc)),IPythV2(address(pyth)),address(this));
        velo.registerPair(0,bytes32(uint256(1)),"BTC/USD");
        usdc.mint(alice,100000e6); usdc.mint(address(velo),100000e6);
        vm.prank(alice); usdc.approve(address(velo),type(uint256).max);
    }
    function test_Reproduction_FlatCrossCloseCreatesBalance() public {
        vm.startPrank(alice);
        velo.depositCross(10000e6);
        uint256 id = velo.openPosition(0,true,1000e6,10,1,empty);
        velo.closePosition(id,empty);
        // Correct balance: deposit minus opening fee minus closing fee.
        uint256 expected = 10000e6 - 1e6 - 999000;
        assertEq(velo.crossBalanceUSDC_6(alice) - expected,999e6,"V3.1 double credits collateral");
        vm.stopPrank();
    }
    function test_Reproduction_MarginAdditionChangesExposure() public {
        vm.startPrank(alice);
        uint256 a = velo.openPosition(0,true,1000e6,10,0,empty);
        uint256 b = velo.openPosition(0,true,1000e6,10,0,empty);
        velo.increaseCollateral(b,1000e6);
        pyth.setPrice(51000e8);
        uint256 beforeA=usdc.balanceOf(alice); velo.closePosition(a,empty);
        uint256 payoutA=usdc.balanceOf(alice)-beforeA;
        uint256 beforeB=usdc.balanceOf(alice); velo.closePosition(b,empty);
        uint256 payoutB=usdc.balanceOf(alice)-beforeB;
        // Equal position notionals should yield equal PnL after adding margin.
        assertGt(payoutB-payoutA,1000e6,"V3.1 also pays extra historical profit");
        vm.stopPrank();
    }
    function test_Reproduction_CrossLiquidationDoesNotRealizeLoss() public {
        vm.startPrank(alice);
        velo.depositCross(10000e6);
        uint256 id=velo.openPosition(0,true,1000e6,10,1,empty);
        vm.stopPrank();
        pyth.setPrice(45000e8);
        velo.liquidate(id,empty);
        assertGt(velo.crossBalanceUSDC_6(alice),9900e6,"V3.1 retains almost all losing collateral");
        assertEq(velo.crossLockedUSDC_6(alice),0);
    }
}
