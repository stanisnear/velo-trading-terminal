import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
import {matchingTransfers} from '../supabase/functions/velo-api/record-transfer.js';
const token='0x5efaf3f69b09bc2abf3439bdc0c93bf611026699';
const from='0x0000000000000000000000000000000000000001';
const to='0x0000000000000000000000000000000000000002';
function log(address=token,amount=2500000n){return {address,logIndex:3,data:encodeAbiParameters([{type:'uint256'}],[amount]),topics:encodeEventTopics({abi:parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']),eventName:'Transfer',args:{from,to}})};}
test('recipient activity amount comes from the exact token receipt',()=>{
 assert.deepEqual(matchingTransfers([log()],[to]),[{log_index:3,from,amount:2.5}]);
});
test('wrong token, wrong recipient, zero and malformed events are excluded',()=>{
 assert.deepEqual(matchingTransfers([log(from),log(token,0n),{address:token,data:'0x',topics:[]}],[to]),[]);
 assert.deepEqual(matchingTransfers([log()],[from]),[]);
});
