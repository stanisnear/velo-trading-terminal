import React, { useState } from 'react';
import { ArrowUpRight, ChevronDown, ShieldCheck, Wallet } from 'lucide-react';
import { AnimatedValue } from './AnimatedValue';
import { ContentDisclosure } from './ProductMotion';
import { SegmentedControl } from './SegmentedControl';
import './TradeOrderPreview.css';

/** An editable sizing preview, never an order or an assumed account balance. */
export function TradeOrderPreview({pair,price,maxLeverage,onSignIn}:{pair:string;price:number;maxLeverage:number;onSignIn:()=>void}) {
  const [side,setSide]=useState('LONG'),[margin,setMargin]=useState('100'),[leverage,setLeverage]=useState(5),[move,setMove]=useState(1),[details,setDetails]=useState(false);
  const maximum=Math.max(1,Math.min(25,Math.floor(maxLeverage)||1)),lev=Math.min(leverage,maximum);
  const amount=Number(margin),valid=Number.isFinite(amount)&&amount>0&&amount<=1e6;
  const requested=valid?amount*lev:0,fee=requested*.001,notional=Math.max(0,(amount-fee)*lev)||0;
  const pnl=valid?notional*move/100*(side==='LONG'?1:-1):0;
  const target=price*(1+move/100);
  return <div className="trade-preview">
    <div className="trade-preview__scroll">
      <header><span>Order preview</span><small>Isolated · Testnet</small></header>
      <div className="trade-preview__side" data-side={side}><SegmentedControl label="Preview direction" value={side} onChange={setSide} options={[{value:'LONG',label:'Buy / Long'},{value:'SHORT',label:'Sell / Short'}]}/></div>
      <div className="trade-preview__inputs">
        <label>Margin <span className="trade-preview__input"><span>$</span><input aria-label="Preview margin" inputMode="decimal" type="number" min="0.01" max="1000000" step="10" value={margin} onChange={e=>setMargin(e.target.value)}/></span></label>
        <label>Leverage <span className="trade-preview__input"><select aria-label="Preview leverage" value={lev} onChange={e=>setLeverage(Number(e.target.value))}>{[...new Set([1,2,3,5,10,15,20,25,maximum])].sort((a,b)=>a-b).filter(n=>n<=maximum).map(n=><option key={n} value={n}>{n}×</option>)}</select><ChevronDown size={13}/></span></label>
      </div>
      {!valid&&<p className="trade-preview__error" role="status">Enter a margin between $0.01 and $1,000,000.</p>}
      <div className="trade-preview__notional"><span>Position size</span><strong><AnimatedValue value={valid?notional:0}/></strong><small>{pair} · {lev}× {side.toLowerCase()}</small></div>
      <section className="trade-preview__scenario" aria-label="Price movement preview">
        <div><label htmlFor="preview-price-move">If price moves</label><strong>{move>0?'+':''}<AnimatedValue value={move} currency={false} digits={1}/>%</strong></div>
        <svg className="trade-preview__payoff" viewBox="0 0 260 90" role="img" aria-label={`Gross payoff for a ${side.toLowerCase()} position across minus five to plus five percent price movement`}>
          <path className="trade-preview__axis" d="M18 45H242M130 12V78"/>
          <path className={side==='LONG'?'trade-preview__loss':'trade-preview__gain'} d={side==='LONG'?'M20 75L130 45':'M20 15L130 45'}/>
          <path className={side==='LONG'?'trade-preview__gain':'trade-preview__loss'} d={side==='LONG'?'M130 45L240 15':'M130 45L240 75'}/>
          <circle data-direction={pnl>=0?'up':'down'} cx={130+move/5*110} cy={45-move/5*30*(side==='LONG'?1:-1)} r="5"/>
          <text x="18" y="88">−5%</text><text x="242" y="88" textAnchor="end">+5%</text>
        </svg>
        <input id="preview-price-move" aria-label="Preview price move" type="range" min="-5" max="5" step="0.1" value={move} onChange={e=>setMove(Number(e.target.value))}/>
        <div><span>Gross PnL</span><b data-direction={pnl>0?'up':pnl<0?'down':'flat'}>{pnl>0?'+':''}<AnimatedValue value={pnl}/></b></div>
        <small>Illustration before closing costs</small>
      </section>
      <button type="button" className="trade-preview__disclosure" aria-expanded={details} aria-controls="trade-preview-details" onClick={()=>setDetails(v=>!v)}><span>Pricing & fees</span><ChevronDown size={13} style={{transform:details?'rotate(180deg)':undefined}}/></button>
      <ContentDisclosure id="trade-preview-details" open={details}><dl className="trade-preview__facts">
        <div><dt>Entry fee</dt><dd><AnimatedValue value={valid?fee:0}/></dd></div>
        <div><dt>Scenario price</dt><dd>{price>0?<AnimatedValue value={target} digits={target<1?6:2}/>:'—'}</dd></div>
        <div><dt>Pricing</dt><dd>Pyth at execution</dd></div>
      </dl></ContentDisclosure>
    </div>
    <footer className="trade-preview__footer"><p><ShieldCheck size={13}/>Preview only. Your funds stay untouched.</p><button type="button" onClick={onSignIn}><Wallet size={15}/><span>Sign in to trade</span><ArrowUpRight size={16}/></button></footer>
  </div>;
}
