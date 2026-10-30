import { useEffect, useMemo, useRef, useState } from 'react';
import { equityHistoryKey, mergeEquityHistory, normalizeEquityHistory, observeEquity } from '../services/equityHistory.mjs';
export type EquityObservation = { timestamp:number; value:number; valuationVersion?:number };
export type EquityHistoryStore = {
  load:(owner:string,wallet:string,engine:string)=>Promise<EquityObservation[]>;
  save:(owner:string,wallet:string,engine:string,points:EquityObservation[])=>Promise<void>;
};
function read(key:string|null):EquityObservation[] {
  try { return key ? normalizeEquityHistory(JSON.parse(localStorage.getItem(key)||'[]')) : []; } catch { return []; }
}
/** Observe across app pages; isolate history by profile, trader, chain and engine. */
export function useEquityHistory(owner:string|undefined,wallet:string|undefined,engine:string,equity:number,ready:boolean,remote?:EquityHistoryStore) {
  const key = equityHistoryKey(owner,wallet,engine);
  const [state,setState] = useState<{key:string|null;points:EquityObservation[]}>(()=>({key,points:read(key)}));
  const [archive,setArchive] = useState<{key:string|null;points:EquityObservation[]}>({key:null,points:[]});
  const remoteAttempt=useRef({key:null as string|null,bucket:0});
  useEffect(()=>{
    if(!remote||!key||!owner||!wallet)return;
    let cancelled=false;
    const load=async()=>{
      try { const points=await remote.load(owner,wallet,engine);if(!cancelled)setArchive({key,points}); }
      catch {/* Retain cached history during a temporary connection failure. */}
    };
    void load();
    // Migrate the existing device observations once, without changing their values.
    const cached=read(key);
    if(cached.length)void remote.save(owner,wallet,engine,cached).then(load).catch(()=>{});
    const timer=window.setInterval(()=>void load(),300000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[key,remote,ready]);
  useEffect(()=>{
    if(!remote||!ready||!key||!owner||!wallet||!Number.isFinite(equity)||equity<0)return;
    const timestamp=Date.now(),bucket=Math.floor(timestamp/300000);
    if(remoteAttempt.current.key===key&&remoteAttempt.current.bucket===bucket)return;
    remoteAttempt.current={key,bucket};
    void remote.save(owner,wallet,engine,[{timestamp,value:equity,valuationVersion:2}]).catch(()=>{
      if(remoteAttempt.current.key===key&&remoteAttempt.current.bucket===bucket)remoteAttempt.current={key,bucket:0};
    });
  },[key,ready,equity,remote]);
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
  // The archive preserves the full account span; the device cache remains bounded.
  return useMemo(()=>mergeEquityHistory(archive.key===key?archive.points:[],state.key===key?state.points:[]),[key,archive,state]);
}
