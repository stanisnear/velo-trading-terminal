import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

test('canvas palette follows resolved theme tokens rather than an obsolete light palette',async()=>{
 const folder=await mkdtemp(path.resolve('audit/chart-palette-'));
 const dom=new JSDOM('<html><body></body></html>');
 const previous=globalThis.getComputedStyle;
 globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
 try{
  const file=path.join(folder,'palette.mjs');
  await build({entryPoints:['src/components/chartPalette.ts'],bundle:true,platform:'node',format:'esm',outfile:file});
  const {readChartPalette}=await import(pathToFileURL(file));
  const root=dom.window.document.documentElement;
  for(const [surface,text,grid,up,down] of [
    ['#f8faf2','#586d5c','rgba(56,87,52,.065)','#60866b','#b96863'],
    ['#191c1b','#abb5ad','rgba(224,234,226,.055)','#91b99f','#c78580'],
  ]){
   for(const [name,value]of Object.entries({'--chart-surface':surface,'--chart-text':text,'--chart-grid':grid,'--chart-up':up,'--chart-down':down}))root.style.setProperty(name,value);
   assert.deepEqual(readChartPalette(root),{background:surface,foreground:text,grid,up,down});
  }
 }finally{globalThis.getComputedStyle=previous;dom.window.close();await rm(folder,{recursive:true,force:true});}
});
