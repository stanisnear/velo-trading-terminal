import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=await build({entryPoints:['src/services/walletAuth.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'fixture-auth',setup(b){b.onResolve({filter:/supabaseStore$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getSession:(...a)=>globalThis.__authFixture.getSession(...a),verifyOtp:(...a)=>globalThis.__authFixture.verifyOtp(...a),signOut:(...a)=>globalThis.__authFixture.signOut(...a)}};'}));}}]});
const {signInWithWallet,cancelWalletSignIn}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const address='0x0000000000000000000000000000000000000001';
function fixture(){
 cancelWalletSignIn();let signed=0, verified=0, api=0;
 const session={user:{id:'fixture',app_metadata:{velo_wallet_verified:address}},expires_at:Math.floor(Date.now()/1000)+3600};
 globalThis.__authFixture={getSession:async()=>({data:{session}}),verifyOtp:async()=>{verified++;return{data:{user:session.user,session},error:null}},signOut:async()=>({error:null})};
 const realFetch=globalThis.fetch;
 globalThis.fetch=async(_url,{body})=>{api++;return new Response(JSON.stringify(JSON.parse(body).action==='challenge'?{id:'fixture',message:'app.velotrading.live wants you to sign in with your Ethereum account:\n'+address}:{token_hash:'fixture'}),{status:200});};
 return{sign:async()=>{signed++;return'0x11'},counts:()=>({signed,verified,api}),restore:()=>{globalThis.fetch=realFetch;cancelWalletSignIn()}};
}
test('explicit login requires a new signature even if a stored session remains',async()=>{
 const f=fixture();try{await signInWithWallet(address,f.sign,{force:true});assert.deepEqual(f.counts(),{signed:1,verified:1,api:2});}finally{f.restore();}
});
test('non-forced onboarding can reuse the matching verified session',async()=>{
 const f=fixture();try{await signInWithWallet(address,f.sign);assert.deepEqual(f.counts(),{signed:0,verified:0,api:0});}finally{f.restore();}
});
test('concurrent login clicks share one wallet signature',async()=>{
 const f=fixture();try{await Promise.all([signInWithWallet(address,f.sign,{force:true}),signInWithWallet(address,f.sign,{force:true})]);assert.deepEqual(f.counts(),{signed:1,verified:1,api:2});}finally{f.restore();}
});
test('cancelling while the wallet prompt is open never exchanges its late signature for a session',async()=>{
 const f=fixture();let release, prompted;
 const ready=new Promise(r=>{prompted=r});
 const operation=signInWithWallet(address,()=>new Promise(r=>{release=r;prompted()}),{force:true});
 try{await ready;cancelWalletSignIn();release('0x11');await assert.rejects(operation,/Sign-in cancelled/);assert.equal(f.counts().verified,0);assert.equal(f.counts().api,1);}finally{f.restore();}
});
test('a transient challenge network failure retries without another wallet prompt',async()=>{
 const f=fixture();const fetchFixture=globalThis.fetch;let requests=0;
 globalThis.fetch=(...args)=>{if(++requests===1)throw new TypeError('Failed to fetch');return fetchFixture(...args);};
 try{await signInWithWallet(address,f.sign,{force:true});assert.equal(requests,3);assert.equal(f.counts().signed,1);}finally{f.restore();}
});
test('a failed signed-proof request is not replayed and a new login can recover',async()=>{
 const f=fixture();const fetchFixture=globalThis.fetch;let verifies=0;
 globalThis.fetch=(url,options)=>{if(JSON.parse(options.body).action==='verify'){verifies++;throw new TypeError('Failed to fetch');}return fetchFixture(url,options);};
 try{await assert.rejects(signInWithWallet(address,f.sign,{force:true}),/connection interrupted/);assert.equal(verifies,1);globalThis.fetch=fetchFixture;await signInWithWallet(address,f.sign,{force:true});assert.equal(f.counts().verified,1);}finally{f.restore();}
});
