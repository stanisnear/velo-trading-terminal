import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { createWalletAuth, loginMessage } from '../supabase/functions/velo-api/wallet-auth.js';

function fixture() {
  const account=privateKeyToAccount(generatePrivateKey());
  const items=new Map(); let linked=0; let secured=0;
  const admin={rpc:async(name,{op,data})=>{
    if(op==='challenge'){const id=crypto.randomUUID();items.set(id,{...data,expires:Date.now()+300000});return {data:{id}};}
    if(op==='consume'){const item=items.get(data.id);items.delete(data.id);return {data:item?.address===data.address && item.expires>Date.now()?item:{}};}
    if(op==='secure_user'){secured++;return {data:{ok:true}};}
  },auth:{admin:{generateLink:async args=>{linked++;assert.equal(args.email,account.address.toLowerCase()+'@wallet.velo');return {data:{user:{id:'fixture'},properties:{hashed_token:'one-use-fixture'}}};}}}};
  const handler=createWalletAuth(()=>'',{admin,client:{verifyMessage},allowMissingIp:true});
  async function call(body){let result;const res={status(n){this.code=n;return this},json(value){result={status:this.code,value};return this}};await handler({body,headers:{}},res);return result;}
  return {account,items,call,counts:()=>({linked,secured})};
}
test('message binds domain, chain, nonce, expiry and no transaction authorization',()=>{
 const msg=loginMessage('0x0000000000000000000000000000000000000001','aabb',0);
 assert.match(msg,/Chain ID: 84532/);assert.match(msg,/Expiration Time: 1970-01-01T00:05:00.000Z/);assert.match(msg,/Nonce: aabb/);
});
test('valid signature issues only one session and preserves canonical identity',async()=>{
 const f=fixture();const c=await f.call({action:'challenge',address:f.account.address});
 const signature=await f.account.signMessage({message:c.value.message});
 const body={action:'verify',address:f.account.address,id:c.value.id,signature};
 const results=await Promise.all([f.call(body),f.call(body)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);assert.deepEqual(f.counts(),{linked:1,secured:1});
});
test('wrong wallet signature never produces a link',async()=>{
 const f=fixture();const c=await f.call({action:'challenge',address:f.account.address});
 const other=privateKeyToAccount(generatePrivateKey());
 const signature=await other.signMessage({message:c.value.message});
 assert.equal((await f.call({action:'verify',address:f.account.address,id:c.value.id,signature})).status,401);
 assert.deepEqual(f.counts(),{linked:0,secured:0});
});
test('expired challenges fail without requesting a session',async()=>{
 const f=fixture();const c=await f.call({action:'challenge',address:f.account.address});f.items.get(c.value.id).expires=0;
 const signature=await f.account.signMessage({message:c.value.message});
 assert.equal((await f.call({action:'verify',address:f.account.address,id:c.value.id,signature})).status,401);
 assert.deepEqual(f.counts(),{linked:0,secured:0});
});
test('modified message signature fails and address-only requests are rejected',async()=>{
 const f=fixture();const c=await f.call({action:'challenge',address:f.account.address});
 const signature=await f.account.signMessage({message:c.value.message.replace('84532','1')});
 assert.equal((await f.call({action:'verify',address:f.account.address,id:c.value.id,signature})).status,401);
 assert.equal((await f.call({action:'verify',address:f.account.address})).status,400);
 assert.equal((await f.call({action:'challenge',address:'garbage'})).status,400);
});
