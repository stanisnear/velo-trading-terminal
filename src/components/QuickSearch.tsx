import { playInterfaceSound } from '../services/interfaceSound';
import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import { motion,useReducedMotion } from 'motion/react';
import { Search,ArrowUpRight,CornerDownLeft,LayoutDashboard,TrendingUp,BarChart2,Users,Trophy,UserRound } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { SegmentedControl } from './ui/SegmentedControl';
import { supportsProductMotion } from './ui/ProductMotion';
import { useMarketDiscovery,tradingPairForAsset,type DiscoveryAsset } from '../services/marketDiscovery';
import { TabView } from '../utils/types';
import { VeloAssetIcon,formatPrice } from './ui/shared';
import { profileDisplayName } from '../utils/profileIdentity.mjs';
import './QuickSearch.css';

type Result={id:string;label:string;detail:string;group:string;logo?:string;symbol?:string;Icon?:typeof Search;run:()=>void};
export function QuickSearch({open,setOpen,people=[],signedIn,onNavigate,onAsset,onTrade,onProfile}:{
 open:boolean;setOpen:(open:boolean)=>void;people?:any[];signedIn?:boolean;onNavigate:(tab:TabView)=>void;
 onAsset:(asset:DiscoveryAsset)=>void;onTrade:(pair:any)=>void;onProfile:(profile:any)=>void;
}){
 const {socialAssets,isPending}=useMarketDiscovery();
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(0);
 const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);const id=useId();const reduced=useReducedMotion();
 useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='k'||event.repeat)return;if(!open&&document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'))return;event.preventDefault();setOpen(!open);};document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut);},[open,setOpen]);
 useEffect(()=>{if(open){setQuery('');setFilter('all');setSelected(0);input.current?.focus();}},[open]);
 const results=useMemo(()=>{
  const navigate=(tab:TabView)=>()=>onNavigate(tab);
  const pages:Result[]=[...(signedIn?[{id:'dashboard',label:'Dashboard',detail:'Your account and activity',group:'Pages',Icon:LayoutDashboard,run:navigate(TabView.DASHBOARD)}]:[]),{id:'trade',label:'Trade',detail:'Trading terminal',group:'Pages',Icon:TrendingUp,run:navigate(TabView.TRADE)},{id:'markets',label:'Markets',detail:'Explore crypto assets',group:'Pages',Icon:BarChart2,run:navigate(TabView.MARKETS)},{id:'social',label:'Social',detail:'Posts and shared positions',group:'Pages',Icon:Users,run:navigate(TabView.SOCIAL)},{id:'leaders',label:'Leaderboard',detail:'Explore traders',group:'Pages',Icon:Trophy,run:navigate(TabView.LEADERBOARD)}];
  const assets:Result[]=socialAssets.map(asset=>({id:`asset:${asset.assetId}`,label:asset.name,detail:`$${asset.symbol}${asset.price!=null?` · $${formatPrice(asset.price)}`:''}`,group:'Markets',logo:asset.logo,symbol:asset.symbol,run:()=>onAsset(asset)}));
  const trades:Result[]=socialAssets.flatMap(asset=>{const pair=tradingPairForAsset(asset);return pair?[{id:`trade:${pair.id}`,label:`Trade ${pair.symbol}/USD`,detail:'Perpetual · Base Sepolia',group:'Trade',logo:asset.logo,symbol:asset.symbol,run:()=>onTrade(pair)}]:[];});
  const profiles:Result[]=people.map(person=>({id:`person:${person.id}`,label:profileDisplayName(person),detail:person.handle||'',group:'People',logo:person.avatar,Icon:UserRound,run:()=>onProfile(person)}));
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return [...pages,...assets,...trades,...profiles].filter(item=>(filter==='all'||item.group.toLowerCase()===filter)&&terms.every(term=>`${item.label} ${item.detail} ${item.group}`.toLowerCase().includes(term))).slice(0,12);
 },[socialAssets,people,query,filter,signedIn,onNavigate,onAsset,onTrade,onProfile]);
 const index=Math.min(selected,Math.max(0,results.length-1));
 const choose=(item:Result)=>{playInterfaceSound('CLICK');setOpen(false);item.run();};
 useEffect(()=>{list.current?.querySelector(`[data-result-index="${index}"]`)?.scrollIntoView({block:'nearest'});},[index]);
 const keyboard=(event:React.KeyboardEvent)=>{if(!['ArrowDown','ArrowUp','Enter'].includes(event.key))return;event.preventDefault();if(event.key==='Enter'){if(results[index])choose(results[index]);}else setSelected((index+(event.key==='ArrowDown'?1:-1)+results.length)%Math.max(1,results.length));};
 return <Dialog open={open} onClose={()=>setOpen(false)} title="Quick search" className="quick-search-dialog"><div className="quick-search-content">
  <label className="quick-search-input"><Search size={19}/><input ref={input} type="search" autoComplete="off" placeholder="Search markets, traders or pages…" aria-label="Search Velo" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={results[index]?`${id}-${index}`:undefined} value={query} onChange={e=>{setQuery(e.target.value);setSelected(0);}} onKeyDown={keyboard}/><kbd>⌘ K</kbd></label>
  <SegmentedControl compact label="Search category" options={[{value:'all',label:'All'},{value:'markets',label:'Markets'},{value:'trade',label:'Trade'},{value:'people',label:'People'}]} value={filter} onChange={value=>{setFilter(value);setSelected(0);input.current?.focus();}}/>
  <div className="quick-search-results" ref={list} id={`${id}-results`} role="listbox" aria-label="Search results">{results.map((item,i)=>{const Icon=item.Icon||Search;return <div id={`${id}-${i}`} key={item.id} data-result-index={i} role="option" aria-selected={i===index} className="quick-search-result" onPointerMove={()=>setSelected(i)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}>
    {i===index&&!reduced&&supportsProductMotion()&&<motion.span className="quick-search-lens" layoutId={`${id}-lens`} transition={{type:'spring',stiffness:500,damping:38}}/>}
    {item.logo?item.symbol?<VeloAssetIcon src={item.logo} symbol={item.symbol} size={32}/>:<img src={item.logo} alt=""/>:<span className="quick-search-icon"><Icon size={17}/></span>}
    <span className="quick-search-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><span className="quick-search-group">{item.group}</span><CornerDownLeft size={13} className="quick-search-enter"/>
  </div>;})}{!results.length&&<p className="quick-search-empty">{isPending?'Loading markets…':'No results. Try an asset name or a trader’s handle.'}</p>}</div>
  <footer><span>↑ ↓ to explore · Enter to open · Esc to close</span><ArrowUpRight size={13}/></footer>
 </div></Dialog>;
}
