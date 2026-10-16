import test from 'node:test';
import assert from 'node:assert/strict';
import { firstChartPage } from '../src/services/firstChartPage.mjs';
import {build} from 'esbuild';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('a fast oracle page avoids requesting exchange history',async()=>{
 let fallback=0;const rows=await firstChartPage(async()=>[{source:'pyth'}],async()=>{fallback++;return [];},10,100);
 assert.equal(rows[0].source,'pyth');assert.equal(fallback,0);
});
test('slow oracle cannot hold up a usable labelled exchange page',async()=>{
 const rows=await firstChartPage(()=>new Promise(()=>{}),async()=>[{source:'exchange'}],5,100);
 assert.equal(rows[0].source,'exchange');
});
test('provider failure starts fallback immediately and total failure terminates',async()=>{
 assert.deepEqual(await firstChartPage(async()=>{throw Error('offline');},async()=>[],100,200),[]);
 assert.deepEqual(await firstChartPage(()=>new Promise(()=>{}),()=>new Promise(()=>{}),1,10),[]);
});

await mkdir('audit',{recursive:true});
const folder=await mkdtemp(path.resolve('audit/history-tests-'));const outfile=path.join(folder,'prices.mjs');
await build({entryPoints:['src/services/pythPriceService.ts'],outfile,bundle:true,format:'esm',platform:'node',plugins:[{name:'providers',setup(b){
 b.onResolve({filter:/pythConnection$|\/priceService$/},a=>({path:a.path.endsWith('pythConnection')?'pyth':'exchange',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='pyth'?`export const fetchPyth=(...args)=>globalThis.__chartPyth(...args);export class PythEventStream{}`:`export const fetchKlines=(...args)=>globalThis.__chartExchange(...args);export const fetchKlinesBefore=fetchKlines;export const fetchRealPrices=async()=>({prices:{}});export const binancePriceStream={disconnect(){},subscribe:()=>()=>{}};`,loader:'js'}));
}}]});
const {fetchPythKlines}=await import(pathToFileURL(outfile));
test('initial chart requests one bounded page; concurrent consumers share it',async()=>{
 let requests=0;globalThis.__chartPyth=async url=>{requests++;const u=new URL(url,'https://fixture.invalid');assert.ok((+u.searchParams.get('to')-+u.searchParams.get('from'))/900<=300);await new Promise(r=>setTimeout(r,5));return Response.json({s:'ok',t:[1000,1900],o:[100,101],h:[102,103],l:[99,100],c:[101,102]});};
 globalThis.__chartExchange=async()=>{throw Error('should not be called');};
 const [one,two]=await Promise.all([fetchPythKlines('SOL/USD','15m'),fetchPythKlines('SOL/USD','15m')]);
 assert.equal(requests,1);assert.equal(one,two);assert.equal(one[0].source,'pyth');await fetchPythKlines('SOL/USD','15m');assert.equal(requests,1);
});
test('signed-out chart does not wait for wallet authentication',async()=>{
 globalThis.__chartPyth=async()=>{throw Error('must not be called');};globalThis.__chartExchange=async()=>[{time:1000,open:1,high:2,low:1,close:2,volume:10}];
 const rows=await fetchPythKlines('ETH/USD','15m',{authenticated:false});assert.equal(rows[0].source,'exchange');
});
test.after(()=>rm(folder,{recursive:true,force:true}));
