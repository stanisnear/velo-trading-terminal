import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { proxyPyth } from '../cloudflare/pyth-worker.js';
import { allowedFeeds } from '../cloudflare/pyth-feeds.js';
import { chainClients } from '../supabase/functions/_shared/signer.js';
import { privateKeyToAccount } from 'viem/accounts';

const token='fixture-session-'.repeat(6),key='fixture-provider-secret';
const id=[...allowedFeeds][0],user={id:'12345678-1234-1234-1234-123456789012',is_anonymous:false};
const limiter=()=>({limit:async()=>({success:true})});
const env=()=>({PYTH_API_KEY:key,SUPABASE_ANON_KEY:'public-anon',AUTH_LIMIT:limiter(),USER_LIMIT:limiter(),STREAM_LIMIT:limiter()});
const url=`https://app.example/api/pyth/v2/updates/price/latest?ids[]=${id}`;
const request=(u=url,options={})=>new Request(u,{headers:{Authorization:`Bearer ${token}`},...options});
const upstream=async(u)=>String(u).endsWith('/auth/v1/user')?Response.json(user):Response.json({parsed:[{id}]});

test('proxy requires login and rejects invalid routes, feeds and history before upstream work',async()=>{
 let calls=0;const fetch=async()=>{calls++;throw Error('must not fetch');};
 for(const [req,status] of [
  [new Request(url),401], [request(url,{method:'POST'}),405],
  [request('https://app.example/api/pyth/admin'),404],
  [request(url+'&ids[]='+id),400], [request(url+'&redirect=https://evil.invalid'),400],
  [request(url.replace(id,'0'.repeat(64))),400],
  [request('https://app.example/api/pyth/history?symbol=Crypto.BTC/USD&resolution=1&from=1&to=99999999999'),400],
 ]) assert.equal((await proxyPyth(req,env(),fetch)).status,status);
 assert.equal(calls,0);
});
test('credentials are confined to separate fixed origins, redirects are forbidden',async()=>{
 const calls=[];
 const res=await proxyPyth(request(),env(),async(u,o)=>{calls.push([String(u),o]);return upstream(u);});
 assert.equal(res.status,200);assert.equal(calls.length,2);
 assert(calls[0][0].startsWith('https://btgfoekgvyvdflzjfehz.supabase.co/auth/v1/user'));
 assert.equal(calls[0][1].headers.Authorization,`Bearer ${token}`);
 assert(calls[1][0].startsWith('https://hermes.pyth.network/v2/updates/price/latest?'));
 assert.equal(calls[1][1].headers.Authorization,`Bearer ${key}`);
 for(const [u,o] of calls){assert(!u.includes(key));assert(!u.includes(token));assert.equal(o.redirect,'error');}
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert(!(await res.text()).includes(key));
});
test('invalid sessions, anonymous accounts and exceeded quotas never reach Pyth',async()=>{
 for(const kind of ['expired','anonymous','ip','user','stream','unavailable']) {
  let calls=0;const e=env();
  if(kind==='ip')e.AUTH_LIMIT.limit=async()=>({success:false});
  if(kind==='user')e.USER_LIMIT.limit=async()=>({success:false});
  if(kind==='stream')e.STREAM_LIMIT.limit=async()=>({success:false});
  if(kind==='unavailable')e.AUTH_LIMIT.limit=async()=>{throw Error(key)};
  const res=await proxyPyth(request(url.replace('latest','stream')),e,async(u)=>{calls++;assert(String(u).endsWith('/auth/v1/user'));return kind==='expired'?new Response('bad',{status:401}):Response.json({...user,is_anonymous:kind==='anonymous'});});
  assert.equal(res.status,kind==='expired'||kind==='anonymous'?401:kind==='unavailable'?503:429);
  assert(calls<=1);assert(!(await res.text()).includes(key));
 }
});
test('history uses the new authenticated OHLC route with bounded candle count',async()=>{
 const now=Math.floor(Date.now()/1000);
 const path=`https://app.example/api/pyth/history?symbol=Crypto.BTC%2FUSD&resolution=60&from=${now-86400}&to=${now}`;
 let target;
 const res=await proxyPyth(request(path),env(),async(u)=>{if(String(u).endsWith('/auth/v1/user'))return Response.json(user);target=new URL(u);return Response.json({s:'ok',t:[now]});});
 assert.equal(res.status,200);assert.equal(target.origin,'https://pyth.dourolabs.app');assert.equal(target.pathname,'/v1/fixed_rate@200ms/history');assert.equal(target.searchParams.get('symbol'),'Crypto.BTC/USD');
 assert.equal((await proxyPyth(request(path.replace('resolution=60','resolution=1')),env(),upstream)).status,400);
});
test('provider errors and oversized bodies return fixed errors without secrets',async()=>{
 for(const [response,status] of [[new Response(key,{status:403}),502],[new Response(key,{status:429}),429],[new Response('x'.repeat(524289)),503]]) {
  const res=await proxyPyth(request(),env(),async(u)=>String(u).endsWith('/auth/v1/user')?Response.json(user):response);
  assert.equal(res.status,status);assert(!(await res.text()).includes(key));
 }
});
test('SSE remains a stream and rejects non-SSE upstream content',async()=>{
 const body='data: {"parsed":[]}\n\n';
 const res=await proxyPyth(request(url.replace('latest','stream')),env(),async(u)=>String(u).endsWith('/auth/v1/user')?Response.json(user):new Response(body,{headers:{'Content-Type':'text/event-stream'}}));
 assert.equal(res.headers.get('content-type'),'text/event-stream');assert.equal(await res.text(),body);
 assert.equal((await proxyPyth(request(url.replace('latest','stream')),env(),upstream)).status,502);
});
test('shared sponsor requires explicit consent and the expected wallet address',()=>{
 const fixture='0x'+'11'.repeat(32),address=privateKeyToAccount(fixture).address;
 const e={BASE_SEPOLIA_RPC_URL:'https://base-sepolia-rpc.publicnode.com',PRIVATE_KEY:fixture};
 assert.throws(()=>chainClients(k=>e[k],true,true),{code:'SIGNER_NOT_CONFIGURED'});
 e.VELO_SPONSOR_USE_KEEPER_KEY='true';
 assert.throws(()=>chainClients(k=>e[k],true,true),{code:'SPONSOR_WALLET_MISMATCH'});
 e.VELO_SPONSOR_EXPECTED_ADDRESS=address;
 assert.equal(chainClients(k=>e[k],true,true).account.address,address);
});

// Compile the actual browser transport with only the session provider replaced.
const result=await build({entryPoints:['src/services/pythConnection.ts'],bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'test-session',setup(b){b.onResolve({filter:/^\.\/supabaseStore$/},()=>({path:'session',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:globalThis.__pythTestSession}})}};`}));}}]});
const {PythEventStream,fetchPyth}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('browser SSE parses split frames and multiline data, using only its session token',async()=>{
 const original=globalThis.fetch;globalThis.__pythTestSession={access_token:token};
 try{
  globalThis.fetch=async(u,o)=>{assert(String(u).startsWith('/api/pyth/'));assert.equal(o.headers.Authorization,`Bearer ${token}`);return new Response(new ReadableStream({start(c){for(const part of ['data: {"a":','1}\r\n\r','\ndata: line1\ndata: line2\n\n'])c.enqueue(new TextEncoder().encode(part));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});};
  const messages=[];const stream=new PythEventStream('/api/pyth/v2/updates/price/stream');
  await new Promise(resolve=>{stream.onmessage=e=>messages.push(e.data);stream.onerror=resolve;});
  assert.deepEqual(messages,['{"a":1}','line1\nline2']);assert.equal(stream.readyState,2);
  globalThis.__pythTestSession=null;
  await assert.rejects(fetchPyth('/api/pyth/history'),/Sign in/);
  await assert.rejects(fetchPyth('https://evil.invalid'),/Invalid/);
 }finally{globalThis.fetch=original;delete globalThis.__pythTestSession;}
});
