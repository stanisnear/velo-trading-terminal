import test from'node:test';import assert from'node:assert/strict';
import{positionShareMetadata}from'../src/utils/positionShareMetadata.mjs';import{shareReturn,shareDate}from'../src/utils/shareFormatting.mjs';
test('closed share metadata preserves the opening transaction and distinguishes opening and closing times',()=>{
  const hash='0x'+'ab'.repeat(32);const history=[{action:'OPEN',positionId:'velo_12',timestamp:100,txHash:hash},{action:'OPEN',positionId:'velo_13',timestamp:50,txHash:'0x'+'cd'.repeat(32)}];
  const data=positionShareMetadata({positionId:'velo_12',action:'CLOSE',timestamp:200},history);assert.equal(data.openedAt,100);assert.equal(data.closedAt,200);assert.equal(data.openTxHash,hash);
  assert.equal(positionShareMetadata({id:'velo_99',timestamp:10,orderlyOrderUrl:'https://example.com/tx/'+hash},history).openTxHash,undefined);
});
test('returns never imply an exact zero for a tiny loss, and unknown dates stay unavailable',()=>{
  assert.equal(shareReturn(-.0003),'−<0.01%');assert.equal(shareReturn(12.5),'+12.50%');assert.equal(shareReturn(NaN),'—');assert.equal(shareDate(undefined),'Not available');assert.equal(shareDate(Infinity),'Not available');assert.notEqual(shareDate(1700000000000),'Not available');
});
