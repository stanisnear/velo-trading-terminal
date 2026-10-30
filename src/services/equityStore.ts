import { supabase } from './supabaseStore';
import type { EquityHistoryStore } from '../hooks/useEquityHistory';

/** Owner-scoped history. Trading balances and public performance never read this table. */
export const equityStore: EquityHistoryStore = {
  async load(_owner,wallet,engine) {
    const points:Awaited<ReturnType<EquityHistoryStore['load']>>=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await supabase.rpc('get_account_equity_history',{
        p_trader_address:wallet.toLowerCase(),p_engine_address:engine.toLowerCase(),
      }).range(offset,offset+499);
      if(error)throw error;
      points.push(...(data || []).map((row:{observed_at:string;equity:number|string})=>({timestamp:Date.parse(row.observed_at),value:Number(row.equity)})));
      if(!data||data.length<500)return points;
    }
  },
  async save(owner,wallet,engine,points) {
    // One immutable observation per five minutes; repeated quotes/tabs cannot
    // overwrite a verified checkpoint or keep growing the same time bucket.
    const buckets=new Map<number,typeof points[number]>();
    for(const point of points)if(Number.isFinite(point.timestamp)&&Number.isFinite(point.value)&&point.value>=0)
      buckets.set(Math.floor(point.timestamp/300000)*300000,point);
    const rows=[...buckets].map(([bucket,point])=>({
      user_id:owner,chain_id:84532,trader_address:wallet.toLowerCase(),engine_address:engine.toLowerCase(),
      bucket_at:new Date(bucket).toISOString(),observed_at:new Date(point.timestamp).toISOString(),equity:point.value,
      source:'observed',valuation_version:point.valuationVersion??1,
    }));
    for(let offset=0;offset<rows.length;offset+=250){
      const {error}=await supabase.from('account_equity_snapshots').upsert(rows.slice(offset,offset+250),{
        onConflict:'user_id,chain_id,engine_address,trader_address,bucket_at',ignoreDuplicates:true,
      });
      if(error)throw error;
    }
  },
};
