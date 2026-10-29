import { useEffect, useRef, useState } from 'react';
import { equityHistoryKey, normalizeEquityHistory, observeEquity } from '../services/equityHistory.mjs';
export type EquityObservation = { timestamp:number; value:number };
function read(key:string|null):EquityObservation[] {
  try { return key ? normalizeEquityHistory(JSON.parse(localStorage.getItem(key)||'[]')) : []; } catch { return []; }
}
/** Observe across app pages; isolate history by profile, trader, chain and engine. */
export function useEquityHistory(owner:string|undefined,wallet:string|undefined,engine:string,equity:number,ready:boolean) {
  const key = equityHistoryKey(owner,wallet,engine);
  const [state,setState] = useState<{key:string|null;points:EquityObservation[]}>(()=>({key,points:read(key)}));
  useEffect(()=>{
    setState(previous=>{
      const points = previous.key===key ? previous.points : read(key);
      return {key,points:ready ? observeEquity(points,equity) : points};
    });
  },[key,equity,ready]);
  useEffect(()=>{
    if(!ready)return;
    const timer=window.setInterval(()=>setState(previous=>previous.key===key
      ? {key,points:observeEquity(previous.points,equity)} : previous),60000);
    return()=>window.clearInterval(timer);
  },[key,equity,ready]);
  const latest=useRef(state);
  const save=(snapshot:typeof state)=>{try{if(snapshot.key&&snapshot.points.length)localStorage.setItem(snapshot.key,JSON.stringify(snapshot.points));}catch{/* In-memory observations still work without storage. */}};
  useEffect(()=>{
    if(latest.current.key!==state.key)save(latest.current);
    latest.current=state;
  },[state]);
  useEffect(()=>{
    const flush=()=>save(latest.current);
    // Throttle writes even when quotes arrive more often than once per second.
    const timer=window.setInterval(flush,5000);
    window.addEventListener('pagehide',flush);
    return()=>{window.clearInterval(timer);window.removeEventListener('pagehide',flush);flush();};
  },[]);
  return state.key===key ? state.points : [];
}
