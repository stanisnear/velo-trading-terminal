import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=await build({entryPoints:['src/services/veloBurnerWallet.ts'],bundle:true,platform:'node',format:'esm',write:false});
const wallet=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const owner='0x0000000000000000000000000000000000000001';
const signature='0x'+'11'.repeat(65);
function fixture(){
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const previous=wallet.buildBurnerFromSignature(owner,signature);wallet.storeBurner(previous);return previous;
}
test('cancelled recovery preserves the saved trading private key',async()=>{
 const previous=fixture();await assert.rejects(wallet.rederiveVeloBurner(owner,async()=>{throw new Error('Rejected');}));
 assert.equal(wallet.loadStoredBurner(owner).privateKey,previous.privateKey);
});
test('a different signature cannot replace the expected trading wallet',async()=>{
 const previous=fixture();await assert.rejects(wallet.rederiveVeloBurner(owner,async()=>'0x'+'22'.repeat(65),previous.veloAddress),/different trading wallet/);
 assert.equal(wallet.loadStoredBurner(owner).privateKey,previous.privateKey);
});
test('matching recovery restores the existing address',async()=>{
 const previous=fixture();wallet.clearBurner(owner);
 const recovered=await wallet.rederiveVeloBurner(owner,async()=>signature,previous.veloAddress);
 assert.equal(recovered.veloAddress,previous.veloAddress);assert.equal(wallet.loadStoredBurner(owner).privateKey,previous.privateKey);
});
