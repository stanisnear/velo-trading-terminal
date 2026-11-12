import { createClient } from '@supabase/supabase-js';
import { decodeConfirmedClose } from '../../../src/services/tradeReceipts.ts';
import { V4_TRADING_MARKETS } from '../../../shared/markets.mjs';

// Keeper execution must leave a durable account receipt even when the trader
// has no browser open. All amounts and outcome come from the mined event.
export async function persistKeeperSettlement({ publicClient, perps, tradeId, position, hash, getEnv, admin }) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const settled = decodeConfirmedClose(receipt, perps, BigInt(tradeId), position.owner);
  if (!settled) throw new Error('Missing matching settlement event');
  const market = V4_TRADING_MARKETS.find(m => m.contractIndex === Number(position.pairIndex));
  if (!market) throw new Error('Unknown settlement market');
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const closedAt = Number(block.timestamp) * 1000;
  const openedAt = Number(position.openedAt) * 1000;
  const db = admin || createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const checked = async query => {
    const result = await query;
    if (result.error) throw new Error('Settlement persistence failed');
    return result.data;
  };
  const profile = await checked(db.from('profiles').select('id').ilike('velo_wallet_address', position.owner).maybeSingle());
  if (!profile) return; // Positions from wallets without a Velo profile remain on-chain.
  const opening = await checked(db.from('trade_history').select('id,open_tx_hash,tx_hash').eq('user_id', profile.id)
    .eq('action', 'OPEN').eq('pair', market.id).eq('side', position.isLong ? 'LONG' : 'SHORT')
    .gte('opened_at', new Date(openedAt - 5000).toISOString()).lte('opened_at', new Date(openedAt + 5000).toISOString())
    .order('created_at', { ascending: true }).limit(1).maybeSingle());
  const openHash = opening?.open_tx_hash || opening?.tx_hash || null;
  if (opening) await checked(db.from('trade_history').update({ velo_trade_id:String(tradeId), open_tx_hash:openHash })
    .eq('id', opening.id).eq('user_id', profile.id));
  await checked(db.from('trade_history').upsert({
    id:settled.id,user_id:profile.id,pair:market.id,side:position.isLong ? 'LONG' : 'SHORT',
    entry_price:Number(position.entryPrice_E18)/1e18,exit_price:settled.exitPrice,
    size:Number(position.originalNotional_6)/1e6,pnl:settled.pnlUSDC,action:settled.action,
    leverage:Number(position.leverage),margin_mode:'ISOLATED',on_chain:true,venue:'velo',
    created_at:new Date(closedAt).toISOString(),opened_at:new Date(openedAt).toISOString(),
    velo_trade_id:String(tradeId),open_tx_hash:openHash,close_tx_hash:hash,tx_hash:hash,
    orderly_order_url:`https://sepolia.basescan.org/tx/${hash}`,
  }, { onConflict:'id',ignoreDuplicates:true }));
  const posts = await checked(db.from('posts').select('id,trade_snapshot').eq('author_id', profile.id)
    .eq('trade_snapshot->>tradeId', String(tradeId)));
  for (const post of posts || []) {
    const s = post.trade_snapshot;
    if (s?.contract?.toLowerCase() !== perps.toLowerCase() || s?.trader?.toLowerCase() !== position.owner.toLowerCase() || s.updateMode === 'snapshot') continue;
    const status = settled.action === 'LIQUIDATION' ? 'LIQUIDATED' : 'CLOSED';
    const margin = settled.payoutUSDC - settled.pnlUSDC;
    const snapshot = s.onClose === 'freeze' ? { ...s,status,closedSnapshot:true,updateMode:'snapshot' } : {
      ...s,status,pnl:settled.pnlUSDC,pnlPct:margin > 0 ? settled.pnlUSDC/margin*100 : 0,
      collateral:margin,closePrice:settled.exitPrice,markPrice:settled.exitPrice,
    };
    await checked(db.from('posts').update({ trade_snapshot:{ ...snapshot,txHash:hash,closeTxHash:hash,closedAt,updatedAt:closedAt } })
      .eq('id', post.id).eq('author_id', profile.id));
  }
}
