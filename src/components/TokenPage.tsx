import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, Globe, MessageSquare, Newspaper, Star } from 'lucide-react';
import { AnimatedText } from './ui/AnimatedValue';
import { SegmentedControl } from './ui/SegmentedControl';
import { ContentDisclosure, ReactionFeedback } from './ui/ProductMotion';
import { VeloAssetIcon } from './ui/shared';
import { TokenInteractiveChart } from './TokenInteractiveChart';
import { CoinComposer } from './social/CoinComposer';
import { PostCard } from './social/PostCard';
import { fetchMarketData, marketWatchKey, tradingPairForAsset, useMarketDiscovery } from '../services/marketDiscovery';
import { mentionsTicker } from '../../shared/marketDiscovery.mjs';
import { coinOverview } from '../../shared/coinOverview.mjs';
import { TOKEN_META } from '../utils/tokenMetadata';
import { assetProfile } from '../../shared/assetProfiles.mjs';
import { TOP_SOCIAL_PAIRS } from '../utils/types';
import './TokenPage.css';

function amount(value: number | null | undefined, currency = true, compact = false) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(undefined, { ...(currency ? {style:'currency',currency:'USD'} : {}),
    ...(compact ? {notation:'compact',maximumFractionDigits:2} : {maximumFractionDigits:currency ? value >= 1 ? 2 : value >= .01 ? 4 : 8 : 0}) }).format(value);
}
function Change({value, label}: {value?:number|null;label:string}) {
  return <span className={`asset-change ${value == null ? '' : value >= 0 ? 'is-up' : 'is-down'}`}>
    <AnimatedText text={value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`}/><span>{label}</span>
  </span>;
}
function safeLink(value?:string) { try { const url=new URL(value || ''); return ['https:','http:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } }

/** One asset workspace; posts and replies use the same handlers as the global feed. */
export function TokenPage({ticker:identifier,posts=[],traders=[],user,changes={},onClose,onLike,onRepost,onComment,onViewProfile,
  showUsersModal,onDeletePost,onDeleteComment,handleCopyTrade,onNavigateToTrade,watchlist=[],onToggleWatchlist,onSinglePost,
  onNavigateToTicker,onPostCreate,onRequireAuth}:any) {
  const [tab,setTab]=useState('posts'),[expanded,setExpanded]=useState(false);
  const discovery=useMarketDiscovery(), asset=discovery.resolve(identifier);
  const ticker=asset?.symbol || identifier;
  const details=useQuery({queryKey:['public-markets','coin',asset?.assetId],
    queryFn:({signal})=>fetchMarketData('coin',asset!.assetId,undefined,signal),enabled:!!asset?.assetId,staleTime:600000,retry:1});
  const news=useQuery({queryKey:['asset-news',ticker],enabled:!!asset && tab==='news',staleTime:300000,retry:1,
    queryFn:async({signal})=>{
      const response=await fetch(`https://min-api.cryptocompare.com/data/v2/news/?categories=${encodeURIComponent(ticker)}&extraParams=Velo&sortOrder=latest`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw new Error('News unavailable');
      const data=await response.json();if(!Array.isArray(data.Data))throw new Error('News unavailable');return data.Data.slice(0,8);
    }});
  const conversation=useMemo(()=>posts.filter((post:any)=>mentionsTicker(post.content,ticker))
    .sort((a:any,b:any)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()),[posts,ticker]);
  if(!asset)return <main className="asset-page"><button className="asset-back" onClick={()=>onClose()}><ArrowLeft size={16}/> All markets</button>
    <div className="asset-empty" role="status"><h1>{discovery.isPending?'Finding your market…':'Market unavailable'}</h1>
      <p>{discovery.isPending?'Loading asset information.':'Return to markets to explore another asset.'}</p>
      {discovery.isError && <button className="asset-secondary" onClick={()=>void discovery.refetch()}>Try again</button>}</div></main>;
  const quote={...details.data?.asset,...Object.fromEntries(Object.entries(asset).filter(([,value])=>value!=null))};
  const fallback=TOKEN_META[ticker]?.geckoId===asset.geckoId?TOKEN_META[ticker]:undefined;
  const profile=assetProfile(asset.cmcId);
  const description=profile?.description||fallback?.description||coinOverview(details.data?.description)||'';
  const links=[{label:'Website',icon:Globe,url:details.data?.links?.website?.[0]||fallback?.website||profile?.source},
    {label:'X / Twitter',icon:ArrowUpRight,url:details.data?.links?.twitter?.[0]||fallback?.twitter},
    {label:'Whitepaper',icon:BookOpen,url:details.data?.links?.whitepaper?.[0]||fallback?.whitepaper},
    {label:'CoinMarketCap',icon:ArrowUpRight,url:asset.cmcSlug?`https://coinmarketcap.com/currencies/${asset.cmcSlug}/`:'https://coinmarketcap.com/'}]
    .map(link=>({...link,url:safeLink(link.url)})).filter(link=>link.url);
  const tradable=tradingPairForAsset(asset), watched=watchlist.includes(marketWatchKey(asset));
  const stats=[['Market cap',amount(quote.marketCap,true,true)],['24h volume',amount(quote.volume,true,true)],
    ['Circulating supply',amount(quote.supply,false,true)],['Fully diluted value',amount(quote.fdv,true,true)]];
  const viewProfile=(partial:{id:string})=>{const person=traders.find((trader:any)=>trader.id===partial.id)|| (user?.id===partial.id?user:null);if(person)onViewProfile(person);};
  return <main className="asset-page">
    <div className="asset-breadcrumb"><button className="asset-back" onClick={()=>onClose()}><ArrowLeft size={16}/> All markets</button><span aria-hidden="true">/</span><span>{asset.name}</span></div>
    <header className="asset-hero">
      <div className="asset-identity"><VeloAssetIcon src={asset.logo} symbol={ticker} size={52}/><div>
        <div className="asset-eyebrow">{quote.rank ? `Rank #${quote.rank}`:'Crypto asset'}{(profile?.category||fallback?.category) && <span> · {profile?.category||fallback?.category}</span>}</div>
        <h1>{asset.name} <span>{ticker}</span></h1>
      </div></div>
      <div className="asset-hero__quote"><strong><AnimatedText text={amount(quote.price)}/></strong><div><Change value={quote.change} label="24h"/><Change value={quote.change7d} label="7d"/></div></div>
      <div className="asset-hero__actions"><button className={`asset-icon-button ${watched?'is-active':''}`} aria-pressed={watched}
        aria-label={`${watched?'Remove':'Add'} ${ticker} ${watched?'from':'to'} watchlist`} onClick={()=>onToggleWatchlist(marketWatchKey(asset))}>
        <ReactionFeedback active={watched}><Star size={18} fill={watched?'currentColor':'none'}/></ReactionFeedback></button>
        {tradable && onNavigateToTrade && <button className="asset-primary" onClick={()=>onNavigateToTrade(ticker)}>Trade {ticker}<ArrowUpRight size={16}/></button>}
      </div>
    </header>
    <div className="asset-workspace">
      <div className="asset-main">
      <section className="asset-card asset-chart" aria-label={`${ticker} price chart`}>
        <div className="asset-chart__heading"><span className="asset-eyebrow">Market overview</span><span className="asset-reference">USD reference price</span></div>
        <TokenInteractiveChart assetId={asset.assetId} ticker={ticker} currentPrice={quote.price || 0} up={(quote.change || 0)>=0}/>
        <div className="asset-periods"><Change value={quote.change} label="24h"/><Change value={quote.change7d} label="7 days"/><Change value={quote.change30d} label="30 days"/></div>
      </section>
      <section className="asset-card asset-stats" aria-label="Market data"><dl>{stats.map(([label,value])=><div key={label}><dt>{label}</dt><dd><AnimatedText text={value}/></dd></div>)}</dl></section>
      <section className="asset-conversation" aria-labelledby="asset-conversation-title">
        <div className="asset-section-heading"><div><span className="asset-eyebrow">The conversation</span><h2 id="asset-conversation-title">Inside ${ticker}</h2></div>
          <SegmentedControl compact label="Asset content" value={tab} onChange={setTab} options={[{value:'posts',label:`Posts · ${conversation.length}`},{value:'news',label:'News'}]}/></div>
        {tab==='posts'? <div className="asset-conversation__content" key="posts">
          <CoinComposer key={ticker} ticker={ticker} user={user} onPostCreate={onPostCreate} onRequireAuth={onRequireAuth}/>
          {conversation.length?conversation.map((post:any)=><PostCard key={post.id} post={post} user={user} onLike={onLike} onRepost={onRepost} onComment={onComment}
            handleCopyTrade={handleCopyTrade} onViewProfile={viewProfile} showUsersModal={showUsersModal} onDelete={onDeletePost} onDeleteComment={onDeleteComment}
            traders={traders} onTickerClick={onNavigateToTicker} onSinglePost={onSinglePost}/>):<div className="asset-empty"><MessageSquare size={24}/><h3>Start the conversation.</h3><p>Your post appears here and in the main feed. ${ticker} is added for you.</p></div>}
        </div>:<div className="asset-news asset-conversation__content" key="news">
          {news.isPending?<div className="asset-empty" role="status"><Newspaper size={24}/><p>Loading headlines…</p></div>:news.isError?<div className="asset-empty" role="status"><h3>Headlines couldn’t load.</h3><button className="asset-secondary" onClick={()=>void news.refetch()}>Try again</button></div>:
            !news.data?.length?<div className="asset-empty"><Newspaper size={24}/><h3>No recent headlines.</h3><p>Switch to posts to see what the community is sharing.</p></div>:
            news.data.map((article:any)=><a className="asset-news__item" key={article.id} href={safeLink(article.url)} target="_blank" rel="noopener noreferrer">
              <div><span className="asset-eyebrow">{article.source_info?.name||article.source} · {new Date(article.published_on*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><h3>{article.title}</h3></div><ArrowUpRight size={18}/></a>)}
        </div>}
      </section>
      </div>
      <aside className="asset-sidebar">
      <section className="asset-card asset-about" aria-labelledby="asset-about-title">
        <span className="asset-eyebrow">Behind the asset</span><h2 id="asset-about-title">About {asset.name}</h2>
        {details.isPending && !description ? <p role="status">Loading asset information…</p> : description ? <>
          <p>{description.length<=390?description:`${description.slice(0,390).trimEnd()}${expanded?'':'…'}`}</p>
          {description.length>390 && <><ContentDisclosure id="asset-description" open={expanded}><p className="asset-about__more">{description.slice(390)}</p></ContentDisclosure>
            <button className="asset-text-action" aria-expanded={expanded} aria-controls="asset-description" onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':'Read more'}<ChevronDown size={14} style={{transform:expanded?'rotate(180deg)':undefined}}/></button></>}
        </> : <p>Project information is currently unavailable. Explore the official links below.</p>}
        {details.isError && <button className="asset-text-action" onClick={()=>void details.refetch()}>Refresh asset information</button>}
        <nav className="asset-resources" aria-label={`${ticker} resources`}>{links.map(({label,icon:Icon,url})=><a key={label} href={url} target="_blank" rel="noopener noreferrer"><Icon size={16}/><span>{label}</span><ArrowUpRight size={14}/></a>)}</nav>
        <div className="asset-availability"><span className={`asset-status-dot ${tradable?'':'is-muted'}`}/>{tradable?'Perpetual available on Velo':'Market information only'}</div>
      </section>
      <section className="asset-card asset-related" aria-labelledby="asset-related-title"><span className="asset-eyebrow">Keep exploring</span><h2 id="asset-related-title">More markets</h2>
        {TOP_SOCIAL_PAIRS.filter(pair=>pair.symbol!==ticker).map(pair=><button className="asset-related__item" key={pair.symbol} onClick={()=>onNavigateToTicker(pair.symbol)}>
          <VeloAssetIcon src={pair.logo} symbol={pair.symbol} size={30}/><span className="asset-related__copy">{pair.symbol}<small>{pair.name}</small></span>
          <Change value={changes[pair.pairId] ?? discovery.resolve(pair.symbol)?.change} label="24h"/><ArrowUpRight size={14}/></button>)}
        <button className="asset-text-action" onClick={()=>onClose()}>Explore all markets<ArrowUpRight size={14}/></button>
      </section>
      </aside>
    </div>
  </main>;
}
