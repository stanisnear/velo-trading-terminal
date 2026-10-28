import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import path from 'node:path';
const folder=await mkdtemp(path.resolve('audit/wallet-session-')),file=path.join(folder,'auth.mjs');
await build({entryPoints:['src/services/walletAuth.ts'],outfile:file,bundle:true,platform:'node',format:'esm',plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/supabaseStore$/},()=>({path:'store',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:globalThis.__walletSessionFixture}})}};',loader:'js'}));}}]});
const {signInWithWallet}=await import(pathToFileURL(file));
test('a verified persisted session never requests a wallet signature, including just before token refresh',async()=>{
 const previous=globalThis.fetch;let requests=0,signatures=0;globalThis.fetch=async()=>{requests++;throw Error('Network fixture');};
 const address='0x'+'12'.repeat(20);
 try {
  for(const seconds of [3600,20]){
   const session={user:{id:'owner',app_metadata:{velo_wallet_verified:address}},expires_at:Math.floor(Date.now()/1000)+seconds};globalThis.__walletSessionFixture=session;
   const result=await signInWithWallet(address,async()=>{signatures++;return '0x11';});
   assert.equal(result.data.session,session);
  }
  assert.equal(requests,0);assert.equal(signatures,0);
 }finally{globalThis.fetch=previous;delete globalThis.__walletSessionFixture;}
});
test('expired sessions and sessions for a different wallet cannot authenticate from cache',async()=>{
 const previous=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;return new Response('{}',{status:401});};
 const address='0x'+'12'.repeat(20);
 try {
  for(const session of [{user:{id:'owner',app_metadata:{velo_wallet_verified:address}},expires_at:1},{user:{id:'other',app_metadata:{velo_wallet_verified:'0x'+'34'.repeat(20)}},expires_at:Math.floor(Date.now()/1000)+3600}]){
   globalThis.__walletSessionFixture=session;await assert.rejects(signInWithWallet(address,async()=>{throw Error('Must not sign an invalid challenge');}));
  }
  assert.ok(requests>=2);
 }finally{globalThis.fetch=previous;delete globalThis.__walletSessionFixture;}
});
test.after(async()=>{await rm(folder,{recursive:true,force:true});});
