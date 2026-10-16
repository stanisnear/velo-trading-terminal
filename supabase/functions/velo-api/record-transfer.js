import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, decodeEventLog, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { runtimeEnv } from './env.js';
const TOKEN='0x5efaf3f69b09bc2abf3439bdc0c93bf611026699';
const ABI=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
export function matchingTransfers(logs, addresses) {
  const targets=new Set(addresses.filter(Boolean).map(a=>a.toLowerCase()));
  return logs.flatMap(log=>{
    if(log.address.toLowerCase()!==TOKEN) return [];
    try {
      const {args}=decodeEventLog({abi:ABI,data:log.data,topics:log.topics});
      return targets.has(args.to.toLowerCase()) && args.value>0n
        ? [{log_index:log.logIndex,from:args.from.toLowerCase(),amount:Number(args.value)/1e6}] : [];
    } catch {return [];}
  });
}
export default async function recordTransfer(req,res) {
  const {txHash,targetUserId}=req.body||{};
  if(!/^0x[0-9a-f]{64}$/i.test(txHash||'') || !/^[0-9a-f-]{36}$/i.test(targetUserId||'')) return res.status(400).json({error:'Invalid transfer reference'});
  const token=(req.headers.authorization||'').replace(/^Bearer /i,'');
  const admin=createClient(runtimeEnv('SUPABASE_URL'),runtimeEnv('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user) return res.status(401).json({error:'Sign in to record a transfer'});
  let claims;try{claims=JSON.parse(atob(token.split('.')[1].replaceAll('-','+').replaceAll('_','/')));}catch{return res.status(401).json({error:'Invalid session'});}
  if(user.email?.endsWith('@wallet.velo') && claims.app_metadata?.velo_wallet_verified!==user.email.split('@')[0]) return res.status(401).json({error:'Sign in with your wallet'});
  const {data:profile,error:profileError}=await admin.from('profiles').select('wallet_address,velo_wallet_address').eq('id',targetUserId).single();
  if(profileError||!profile) return res.status(404).json({error:'Recipient profile not found'});
  const client=createPublicClient({chain:baseSepolia,transport:http(runtimeEnv('BASE_SEPOLIA_RPC_URL')||'https://sepolia.base.org',{timeout:10000,retryCount:0})});
  const receipt=await client.getTransactionReceipt({hash:txHash});
  if(receipt.status!=='success') return res.status(400).json({error:'Transfer did not succeed'});
  const matches=matchingTransfers(receipt.logs,[profile.wallet_address,profile.velo_wallet_address]);
  if(!matches.length) return res.status(400).json({error:'No matching mUSDC transfer to this recipient'});
  for(const item of matches){
    const {error}=await admin.rpc('velo_record_verified_transfer',{target:targetUserId,tx_hash:txHash.toLowerCase(),event_index:item.log_index,amount:item.amount,sender:item.from});
    if(error) throw new Error('Unable to record transfer');
  }
  return res.status(200).json({ok:true});
}
