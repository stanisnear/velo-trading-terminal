import { AnimatedText } from './ui/AnimatedValue';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address, type Hash } from 'viem';
import { ArrowDownToLine, ArrowUpFromLine, Check, ExternalLink, Loader2, Pause, Play, RefreshCw, Settings2 } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { VELO_PERPS_V4_ABI } from '../services/veloPerpsV4Abi';
import { VELO_PERPS_V4_ADDRESS, VELO_USDC_BASE, baseScanTxUrl } from '../services/veloPerpsService';
import { builderAttribution } from '../services/baseBuilderAttribution.mjs';
import { V4_TRADING_MARKETS, v4DefaultRisk } from '../../shared/markets.mjs';
import './VeloV4Admin.css';

type Risk = ReturnType<typeof v4DefaultRisk>;
type Market = { index:number; symbol:string; feed:Hash; registered:boolean; enabled:boolean; risk:Risk; oi:bigint; pending:bigint };
type Snapshot = { owner:Address; guardian:Address; paused:boolean; pool:bigint; reserved:bigint; available:bigint; collateral:bigint; orders:bigint; fees:bigint; balance:bigint; accounted:bigint; markets:Market[] };
const money = (value:bigint) => Number(formatUnits(value,6)).toLocaleString(undefined,{maximumFractionDigits:2});
const zero = '0x0000000000000000000000000000000000000000';

export default function VeloV4Admin() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({chainId:84532});
  const {data:wallet} = useWalletClient();
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [pending,setPending] = useState<Hash|null>(null);
  const [confirmed,setConfirmed] = useState<Hash|null>(null);
  const [amount,setAmount] = useState('');
  const [recipient,setRecipient] = useState('');
  const [guardian,setGuardian] = useState('');
  const [editing,setEditing] = useState<Market|null>(null);
  const [risk,setRisk] = useState<Risk|null>(null);
  const lock = useRef(false);
  const configured = isAddress(VELO_PERPS_V4_ADDRESS) && VELO_PERPS_V4_ADDRESS !== zero;
  const key = `velo_v4_admin_${VELO_PERPS_V4_ADDRESS}_${address}`;
  const owner = !!address && snapshot?.owner.toLowerCase()===address.toLowerCase();
  const disabled = !!busy || !!pending || !owner || chainId!==84532;
  const refresh = useCallback(async()=>{
    if(!client || !configured)return;
    const blockNumber=await client.getBlockNumber();
    const read=async(functionName:string,args:readonly unknown[]=[])=>client.readContract({address:VELO_PERPS_V4_ADDRESS,abi:VELO_PERPS_V4_ABI,functionName,args,blockNumber} as any) as Promise<any>;
    const [version,owner,guardian,paused,pool,reserved,available,collateral,orders,fees,accounted,balance,markets]=await Promise.all([
      read('VERSION'),read('owner'),read('guardian'),read('entriesPaused'),read('poolAssets'),read('reservedProfit'),read('availableLiquidity'),read('collateralEscrow'),read('orderEscrow'),read('feeBalance'),read('accountedBalance'),
      client.readContract({address:VELO_USDC_BASE,abi:erc20Abi,functionName:'balanceOf',args:[VELO_PERPS_V4_ADDRESS],blockNumber}),
      Promise.all(V4_TRADING_MARKETS.map(async m=>{
        const [feed,enabled,r,oi,pending]=await Promise.all([read('pairFeedId',[m.contractIndex]),read('pairTradable',[m.contractIndex]),read('marketRisk',[m.contractIndex]),read('openInterest',[m.contractIndex]),read('pendingOrderCount',[m.contractIndex])]);
        const registered=feed!==`0x${'0'.repeat(64)}`;
        if(registered && feed.toLowerCase()!==`0x${m.feed}`)throw Error(`Unexpected oracle feed for ${m.symbol}`);
        return {index:m.contractIndex,symbol:m.symbol,feed:`0x${m.feed}` as Hash,registered,enabled,oi,pending,risk:registered?{maxPositionUSDC_6:r[0],maxOpenInterestUSDC_6:r[1],maxBlockVolumeUSDC_6:r[2],maxLeverage:r[3],maintenanceBps:r[4],maxConfidenceBps:r[5],borrowBpsPerHour:r[6]}:v4DefaultRisk(m.symbol)};
      })),
    ]);
    if(Number(version)!==4)throw Error('The configured engine is not V4.');
    setSnapshot({owner,guardian,paused,pool,reserved,available,collateral,orders,fees,accounted,balance,markets});
  },[client,configured]);
  useEffect(()=>{void refresh().catch(()=>setError('Engine data could not be loaded. Retry to refresh.'));},[refresh]);
  useEffect(()=>{try{const p=localStorage.getItem(key);setPending(p && /^0x[0-9a-f]{64}$/i.test(p)?p as Hash:null);}catch{}},[key]);
  const remember=(hash:Hash|null)=>{setPending(hash);try{if(hash)localStorage.setItem(key,hash);else localStorage.removeItem(key);}catch{}};
  const confirm=async(hash:Hash)=>{
    if(!client)throw Error('Connect to Base Sepolia.');
    const receipt=await client.waitForTransactionReceipt({hash,timeout:20000,pollingInterval:1000});
    remember(null);
    if(receipt.status!=='success')throw Error('Transaction reverted. No change was applied.');
    setConfirmed(hash);
  };
  const act=async(label:string,functionName:string,args:readonly unknown[]=[])=>{
    if(lock.current||disabled||!wallet||!client||!address)return;
    lock.current=true;setBusy(label);setError('');setConfirmed(null);
    try{
      if(functionName==='fundPool'){
        const allowance=await client.readContract({address:VELO_USDC_BASE,abi:erc20Abi,functionName:'allowance',args:[address,VELO_PERPS_V4_ADDRESS]});
        if(allowance<(args[0] as bigint)){
          const hash=await wallet.writeContract({address:VELO_USDC_BASE,abi:erc20Abi,functionName:'approve',args:[VELO_PERPS_V4_ADDRESS,args[0] as bigint],...builderAttribution(84532)});
          remember(hash);await confirm(hash);
        }
      }
      await client.simulateContract({account:address,address:VELO_PERPS_V4_ADDRESS,abi:VELO_PERPS_V4_ABI,functionName,args} as any);
      const hash=await wallet.writeContract({address:VELO_PERPS_V4_ADDRESS,abi:VELO_PERPS_V4_ABI,functionName,args,...builderAttribution(84532)} as any);
      remember(hash);await confirm(hash);await refresh();setEditing(null);
    }catch(e:any){setError(e?.shortMessage||e?.message||'Could not complete the action.');}
    finally{lock.current=false;setBusy('');}
  };
  const poolAction=(kind:'fundPool'|'withdrawLiquidity'|'withdrawFees')=>{
    try{
      if(!/^\d+(\.\d{1,6})?$/.test(amount))throw Error('Enter a positive amount with at most six decimals.');
      const value=parseUnits(amount,6);if(value<=0n)throw Error('Amount must be greater than zero.');
      if(kind!=='fundPool'&&(!isAddress(recipient)||recipient===zero||recipient.toLowerCase()===VELO_PERPS_V4_ADDRESS.toLowerCase()))throw Error('Enter a valid recipient wallet.');
      void act(kind,kind,kind==='fundPool'?[value]:[recipient,value]);
    }catch(e:any){setError(e.message);}
  };
  if(!configured)return null;
  return <section className="v4-admin" aria-label="V4 trading engine">
    <header><div><h2>Trading engine V4</h2><a href={`https://sepolia.basescan.org/address/${VELO_PERPS_V4_ADDRESS}`} target="_blank" rel="noreferrer">Base Sepolia <ExternalLink size={13}/></a></div><div className="v4-admin-actions">
      <button type="button" title="Refresh engine balances" aria-label="Refresh engine balances" disabled={!!busy} onClick={()=>void refresh().catch(()=>setError('Refresh failed.'))}><RefreshCw size={16}/></button>
      {snapshot&&<button type="button" disabled={disabled} onClick={()=>void act('entries','setEntriesPaused',[!snapshot.paused])}>{snapshot.paused?<Play size={16}/>:<Pause size={16}/>} {snapshot.paused?'Resume entries':'Pause entries'}</button>}
    </div></header>
    {snapshot?<>
      <p className="v4-admin-status">{snapshot.paused?'New entries paused':'Entries enabled'} · Isolated margin · Full position closes</p>
      <dl className="v4-admin-balances">{[['Pool liquidity',snapshot.pool],['Reserved profit',snapshot.reserved],['Available liquidity',snapshot.available],['Position collateral',snapshot.collateral],['Order escrow',snapshot.orders],['Accrued fees',snapshot.fees]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>${money(value as bigint)}</dd></div>)}</dl>
      {snapshot.balance<snapshot.accounted&&<p role="alert">Accounting mismatch. Pause entries and investigate the token balance.</p>}
      <div className="v4-admin-pool"><label>Amount (mUSDC)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Withdrawal recipient<input value={recipient} placeholder="0x..." onChange={e=>setRecipient(e.target.value)}/></label>
        <div className="v4-admin-actions"><button disabled={disabled} onClick={()=>poolAction('fundPool')}><ArrowUpFromLine size={16}/> Fund pool</button><button disabled={disabled} onClick={()=>poolAction('withdrawLiquidity')}><ArrowDownToLine size={16}/> Withdraw available</button><button disabled={disabled} onClick={()=>poolAction('withdrawFees')}><ArrowDownToLine size={16}/> Withdraw fees</button>
        {snapshot.balance>snapshot.accounted&&<button disabled={disabled} onClick={()=>void act('surplus','accountSurplus')}>Allocate ${money(snapshot.balance-snapshot.accounted)} surplus</button>}</div>
      </div>
      <div className="v4-admin-table"><table><thead><tr><th>Market</th><th>Max leverage</th><th>Open interest / cap</th><th>Borrow / hour</th><th>Status</th><th>Actions</th></tr></thead><tbody>{snapshot.markets.map(m=><tr key={m.index}><th>{m.symbol}/USD</th><td>{m.risk.maxLeverage}x</td><td>${money(m.oi)} / ${money(m.risk.maxOpenInterestUSDC_6)}</td><td>{<AnimatedText text={(m.risk.borrowBpsPerHour/100).toFixed(2)}/>}%</td><td>{m.registered?(m.enabled?'Enabled':'Paused'):'Not registered'}</td><td><div className="v4-admin-actions">
        <button disabled={disabled} onClick={()=>void act(m.symbol,m.registered?'setPairTradable':'registerPair',m.registered?[m.index,!m.enabled]:[m.index,m.feed,`${m.symbol}/USD`,m.risk])}>{m.registered?(m.enabled?<Pause size={15}/>:<Play size={15}/>):<Check size={15}/>} {m.registered?(m.enabled?'Pause':'Resume'):'Register'}</button>
        <button disabled={disabled||!m.registered||m.oi>0n||m.pending>0n} title="Edit risk limits when no positions or orders are open" aria-label={`Edit ${m.symbol} risk limits`} onClick={()=>{setEditing(m);setRisk({...m.risk});}}><Settings2 size={15}/></button>
      </div></td></tr>)}</tbody></table></div>
      <div className="v4-admin-guardian"><label>Emergency guardian<input value={guardian} placeholder={snapshot.guardian} onChange={e=>setGuardian(e.target.value)}/></label><button disabled={disabled||!isAddress(guardian)} onClick={()=>void act('guardian','setGuardian',[guardian])}>Update guardian</button></div>
      {!owner&&<p>Connect the engine owner wallet to manage these settings.</p>}{chainId!==84532&&<p>Switch your wallet to Base Sepolia.</p>}
    </>:<p role="status">Loading engine...</p>}
    {busy&&<p role="status"><Loader2 size={16} className="animate-spin"/> Waiting for {busy} confirmation...</p>}
    {error&&<p className="v4-admin-error" role="alert">{error}</p>}
    {pending&&<p><a href={baseScanTxUrl(pending)} target="_blank" rel="noreferrer">Pending transaction <ExternalLink size={13}/></a> <button disabled={!!busy} onClick={async()=>{setBusy('confirmation');try{await confirm(pending);await refresh();setError('');}catch{setError('Confirmation is still pending. Check the transaction before retrying.');}finally{setBusy('');}}}>Check confirmation</button></p>}
    {confirmed&&!pending&&<p role="status"><a href={baseScanTxUrl(confirmed)} target="_blank" rel="noreferrer"><Check size={14}/> Confirmed transaction</a></p>}
    <Dialog open={!!editing} onClose={()=>{if(!busy)setEditing(null);}} title={`${editing?.symbol||''} risk limits`} busy={!!busy}>
      {risk&&<form className="v4-admin-risk" onSubmit={e=>{e.preventDefault();if(editing)void act('risk limits','setMarketRisk',[editing.index,risk]);}}>
        {(['maxPositionUSDC_6','maxOpenInterestUSDC_6','maxBlockVolumeUSDC_6','maxLeverage','maintenanceBps','maxConfidenceBps','borrowBpsPerHour'] as const).map(field=><label key={field}>{({maxPositionUSDC_6:'Max position (mUSDC)',maxOpenInterestUSDC_6:'Max open interest (mUSDC)',maxBlockVolumeUSDC_6:'Max volume per block (mUSDC)',maxLeverage:'Max leverage',maintenanceBps:'Maintenance (basis points)',maxConfidenceBps:'Max oracle confidence (basis points)',borrowBpsPerHour:'Borrow per hour (basis points)'})[field]}<input type="number" min="0" step="1" required value={field.endsWith('_6')?String(BigInt(risk[field])/1_000_000n):Number(risk[field])} onChange={e=>{if(!/^\d*$/.test(e.target.value))return;setRisk({...risk,[field]:field.endsWith('_6')?BigInt(e.target.value||0)*1_000_000n:Number(e.target.value)});}}/></label>)}
        <button type="submit" disabled={disabled}>Save risk limits</button>{error&&<p role="alert">{error}</p>}
      </form>}
    </Dialog>
  </section>;
}
