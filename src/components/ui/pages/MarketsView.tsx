import { AnimatedText } from '../AnimatedValue';
import React, { useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, ChevronRight, Search, Star } from 'lucide-react';
import { PAIRS, isTradablePair } from '@/utils/types';
import { VeloAssetIcon } from '@/components/ui/shared';
import { useMarketDiscovery, tradingPairForAsset, marketWatchKey } from '@/services/marketDiscovery';

type SortKey = 'rank' | 'volume' | 'change' | 'price' | 'name';

const categories: Record<string, string> = {
  'BNB/USD': 'Layer 1', 'XRP/USD': 'Layer 1', 'HYPE/USD': 'DeFi', 'WBTC/USD': 'Wrapped assets',
  'JITOSOL/USD': 'Staking', 'STETH/USD': 'Staking', 'USDC/USD': 'Stablecoins', 'USDT/USD': 'Stablecoins',
  'BTC/USD': 'Layer 1', 'ETH/USD': 'Layer 1', 'SOL/USD': 'Layer 1',
  'PYTH/USD': 'Oracle', 'DOGE/USD': 'Meme',
};
const categoryOptions = ['All markets', 'Layer 1', 'DeFi', 'Meme', 'Oracle', 'Wrapped assets', 'Staking', 'Stablecoins'];

const formatPrice = (price?: number | null) => {
  if (price == null || !Number.isFinite(price)) return '—';
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(5);
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return price.toFixed(2);
};

const formatMoney = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const Sparkline = ({ values }: { values: number[] }) => {
  if (values.length < 2) return <span className="markets-spark-empty">—</span>;
  const width = 82, height = 26;
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1) * width).toFixed(1)},${(height - 2 - ((value - min) / range) * (height - 4)).toFixed(1)}`).join(' ');
  return <svg className="markets-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><polyline points={points} /></svg>;
};

interface MarketsViewProps {
  marketPrices: Record<string, number>;
  marketChanges: Record<string, number>;
  watchlist: string[];
  onToggleWatchlist: (pairId: string) => void;
  onNavigateToTrade: (pair: any) => void;
  onNavigateToSocial: (ticker: string) => void;
}

export const MarketsView: React.FC<MarketsViewProps> = ({
  marketPrices, marketChanges, watchlist, onToggleWatchlist, onNavigateToTrade, onNavigateToSocial,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All markets');
  const [sortBy, setSortBy] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const discovery = useMarketDiscovery();
  const { assets } = discovery;

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(value => value === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const listedVolume = assets.reduce((sum, asset) => sum + (asset.volume || 0), 0);
  const listedCap = assets.reduce((sum, asset) => sum + (asset.marketCap || 0), 0);
  const advancing = assets.filter(asset => (asset.change ?? 0) > 0).length;
  const tradableCount = PAIRS.filter(pair => isTradablePair(pair.id)).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return assets.filter(pair => {
      const matchesQuery = !query || pair.id.toLowerCase().includes(query) || pair.name.toLowerCase().includes(query);
      const categoryTags = { 'Layer 1': ['layer-1'], DeFi: ['defi', 'decentralized-exchange-dex-token'], Meme: ['memes'], Oracle: ['oracles'], 'Wrapped assets': ['wrapped-tokens'], Staking: ['liquid-staking-derivatives', 'staking'], Stablecoins: ['stablecoin'] };
      const matchesCategory = category === 'All markets' || (pair.geckoId && categories[pair.id] === category) || categoryTags[category]?.some(tag => pair.tags?.includes(tag));
      return matchesQuery && matchesCategory && (!favoritesOnly || watchlist.includes(marketWatchKey(pair)));
    }).sort((a, b) => {
      let result = 0;
      if (sortBy === 'name') result = a.name.localeCompare(b.name);
      else if (sortBy === 'price') result = (a.price || 0) - (b.price || 0);
      else if (sortBy === 'change') result = (a.change || 0) - (b.change || 0);
      else if (sortBy === 'rank') result = (a.rank ?? Infinity) - (b.rank ?? Infinity);
      else result = (a.volume || 0) - (b.volume || 0);
      return sortDir === 'desc' ? -result : result;
    });
  }, [assets, search, category, favoritesOnly, watchlist, sortBy, sortDir]);

  const sortLabel = (key: SortKey, label: string) => <button className="markets-sort" onClick={() => handleSort(key)} aria-label={`Sort by ${label}`}>{label}<span>{sortBy === key ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span></button>;

  return (
    <main className="markets-page animate-fade-in">
      <style>{`
        .markets-page { width:min(1320px,100%); margin:0 auto; padding:clamp(22px,4vw,44px) clamp(16px,3.2vw,42px) 112px; color:var(--fg); }
        .markets-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin-bottom:24px; }
        .markets-eyebrow,.markets-label { color:var(--fg-subtle); font:600 10px/1.3 var(--font-mono); letter-spacing:.13em; text-transform:uppercase; }
        .markets-title { margin:7px 0 0; font:500 clamp(32px,5vw,48px)/1.02 var(--font-display); color:var(--fg); }
        .markets-title em { font-weight:400; }
        .markets-subtitle { margin:9px 0 0; color:var(--fg-muted); font:14px/1.45 var(--font-sans); }
        .markets-live { display:inline-flex; align-items:center; gap:8px; padding:9px 12px; border:1px solid var(--hairline); border-radius:999px; color:var(--fg-muted); font:600 10px/1 var(--font-mono); letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }
        .markets-live i { width:7px; height:7px; border-radius:50%; background:var(--accent); box-shadow:0 0 0 4px color-mix(in oklab,var(--accent) 14%,transparent); }
        .markets-overview { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:0 0 23px; padding:14px 0; border-top:1px solid var(--hairline); border-bottom:1px solid var(--hairline); }
        .markets-overview > div { padding:0 18px; border-left:1px solid var(--hairline); }
        .markets-overview > div:first-child { padding-left:0; border-left:0; }
        .markets-overview strong { display:block; margin-top:6px; color:var(--fg); font:600 17px/1.1 var(--font-mono); font-variant-numeric:tabular-nums; }
        .markets-overview small { display:block; margin-top:4px; color:var(--fg-subtle); font:11px/1.3 var(--font-sans); }
        .markets-tools { display:grid; grid-template-columns:minmax(200px,1fr) auto; gap:12px; align-items:center; margin-bottom:12px; }
        .markets-search { display:flex; align-items:center; gap:10px; min-width:0; height:42px; padding:0 13px; border:1px solid var(--hairline); border-radius:11px; background:var(--chip-bg); color:var(--fg-subtle); }
        .markets-search:focus-within { border-color:color-mix(in oklab,var(--accent) 65%,var(--hairline)); box-shadow:0 0 0 3px color-mix(in oklab,var(--accent) 12%,transparent); }
        .markets-search input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:var(--fg); font:13px var(--font-sans); }
        .markets-search input::placeholder { color:var(--fg-subtle); }
        .markets-watch { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:42px; padding:0 14px; border:1px solid var(--hairline); border-radius:11px; background:transparent; color:var(--fg-muted); font:600 10px var(--font-mono); letter-spacing:.08em; text-transform:uppercase; cursor:pointer; }
        .markets-watch[aria-pressed="true"] { color:var(--accent-text); border-color:color-mix(in oklab,var(--accent) 50%,var(--hairline)); background:color-mix(in oklab,var(--accent) 9%,transparent); }
        .markets-categories { display:flex; gap:4px; overflow:auto; padding:0 0 12px; scrollbar-width:none; }
        .markets-categories::-webkit-scrollbar { display:none; }
        .markets-category { flex:none; padding:8px 11px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--fg-subtle); font:600 10px var(--font-mono); letter-spacing:.04em; white-space:nowrap; cursor:pointer; }
        .markets-category:hover { color:var(--fg); background:var(--chip-bg); }
        .markets-category[aria-pressed="true"] { color:var(--fg); border-color:var(--hairline); background:var(--chip-bg); box-shadow:0 1px 0 var(--glass-ring) inset; }
        .markets-table { overflow:hidden; border:1px solid var(--hairline); border-radius:16px; background:color-mix(in oklab,var(--glass-bg) 90%,transparent); box-shadow:var(--glass-shadow); }
        .markets-row,.markets-table-head { display:grid; grid-template-columns:34px minmax(190px,1fr) minmax(100px,.68fr) minmax(88px,.55fr) minmax(96px,.65fr) 96px 78px; gap:12px; align-items:center; }
        .markets-table-head { min-height:40px; padding:0 18px; border-bottom:1px solid var(--hairline); background:color-mix(in oklab,var(--chip-bg) 65%,transparent); }
        .markets-sort { display:flex; align-items:center; gap:6px; padding:0; border:0; background:none; color:var(--fg-subtle); font:600 9px var(--font-mono); letter-spacing:.12em; text-transform:uppercase; cursor:pointer; }
        .markets-sort span { opacity:.58; }
        .markets-sort.right { justify-content:flex-end; }
        .markets-row { min-height:68px; padding:9px 18px; border-bottom:1px solid var(--hairline); transition:background .16s ease; }
        .markets-row:last-child { border-bottom:0; }
        .markets-row:hover { background:var(--chip-bg); }
        .markets-star { display:grid; place-items:center; width:30px; height:34px; border:0; background:transparent; color:var(--fg-subtle); cursor:pointer; }
        .markets-star[aria-pressed="true"] { color:var(--accent-text); }
        .markets-asset { display:flex; align-items:center; gap:11px; min-width:0; padding:0; border:0; background:none; color:inherit; text-align:left; cursor:pointer; }
        .markets-asset .velo-asset-icon { width:34px; height:34px; flex:none; }
        .markets-asset-copy { display:grid; gap:3px; min-width:0; }
        .markets-asset-copy strong { overflow:hidden; color:var(--fg); font:600 13px/1.1 var(--font-sans); text-overflow:ellipsis; white-space:nowrap; }
        .markets-asset-copy span { overflow:hidden; color:var(--fg-subtle); font:11px/1.1 var(--font-sans); text-overflow:ellipsis; white-space:nowrap; }
        .markets-quote { display:grid; justify-items:end; gap:3px; min-width:0; }
        .markets-price { text-align:right; color:var(--fg); font:600 12px var(--font-mono); font-variant-numeric:tabular-nums; white-space:nowrap; }
        .markets-change { display:flex; align-items:center; justify-content:flex-end; gap:3px; color:var(--fg-muted); font:600 11px var(--font-mono); font-variant-numeric:tabular-nums; white-space:nowrap; }
        .markets-mobile-change { display:none; }
        .markets-change.positive { color:var(--pnl-up); }
        .markets-change.negative { color:var(--pnl-down); }
        .markets-volume { text-align:right; color:var(--fg-muted); font:500 11px var(--font-mono); font-variant-numeric:tabular-nums; white-space:nowrap; }
        .markets-spark { display:block; width:82px; height:26px; overflow:visible; }
        .markets-spark polyline { fill:none; stroke:var(--accent); stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; opacity:.86; }
        .markets-spark-empty { color:var(--fg-subtle); text-align:center; font:11px var(--font-mono); }
        .markets-trade { justify-self:end; display:inline-flex; align-items:center; gap:4px; min-height:32px; padding:0 9px; border:1px solid var(--hairline); border-radius:8px; background:var(--chip-bg); color:var(--fg-muted); font:600 10px var(--font-mono); cursor:pointer; white-space:nowrap; }
        .markets-trade:hover { border-color:color-mix(in oklab,var(--accent) 55%,var(--hairline)); color:var(--fg); }
        .markets-soon { justify-self:end; color:var(--fg-subtle); font:600 9px var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
        .markets-empty { padding:48px 18px; color:var(--fg-muted); text-align:center; font:14px var(--font-sans); }
        @media(max-width:900px) { .markets-row,.markets-table-head { grid-template-columns:32px minmax(150px,1fr) minmax(90px,.65fr) minmax(84px,.58fr) 76px; } .markets-col-volume,.markets-col-spark { display:none!important; } }
        @media(max-width:600px) {
          .markets-page { padding:22px 14px 108px; }
          .markets-heading { align-items:flex-start; flex-direction:column; gap:13px; margin-bottom:19px; }
          .markets-live { padding:8px 10px; }
          .markets-overview { margin-bottom:17px; padding:12px 0; }
          .markets-overview > div { padding:0 10px; }
          .markets-overview strong { font-size:14px; }
          .markets-overview small { font-size:10px; }
          .markets-tools { grid-template-columns:minmax(0,1fr) auto; gap:8px; }
          .markets-search { height:40px; padding:0 10px; }
          .markets-watch { min-height:40px; padding:0 10px; font-size:9px; }
          .markets-row,.markets-table-head { grid-template-columns:28px minmax(0,1fr) minmax(82px,.62fr) 70px; gap:7px; padding-left:9px; padding-right:9px; }
          .markets-table-head { min-height:36px; }
          .markets-row { min-height:62px; }
          .markets-col-change { display:none!important; }
          .markets-mobile-change { display:flex; font-size:9px; }
          .markets-asset { gap:8px; }
          .markets-asset .velo-asset-icon { width:30px; height:30px; }
          .markets-asset-copy strong { font-size:12px; }
          .markets-asset-copy span { font-size:10px; }
          .markets-price { font-size:11px; }
          .markets-trade { min-height:30px; padding:0 7px; font-size:9px; }
        }
        @media(max-width:360px) {
          .markets-row,.markets-table-head { grid-template-columns:25px minmax(0,1fr) minmax(75px,.62fr) 56px; gap:5px; padding-left:7px; padding-right:7px; }
          .markets-trade { padding:0 5px; }
          .markets-trade svg { display:none; }
        }
      `}</style>

      <header className="markets-heading">
        <div>
          <div className="markets-eyebrow">VELO · MARKET DESK</div>
          <h1 className="markets-title">All <em>markets</em></h1>
          <p className="markets-subtitle">Top 50 crypto assets by market cap · {tradableCount} testnet perpetuals</p>
        </div>
        <div className="markets-live"><i aria-hidden="true" />{tradableCount} perpetuals <span aria-hidden="true">·</span> Base Sepolia</div>
      </header>

      <section className="markets-overview" aria-label="Market overview">
        <div><span className="markets-label">Listed market cap</span><strong>{<AnimatedText text={formatMoney(listedCap)}/>}</strong><small>Combined tracked assets</small></div>
        <div><span className="markets-label">24h spot volume</span><strong>{<AnimatedText text={formatMoney(listedVolume)}/>}</strong><small>Across tracked assets</small></div>
        <div><span className="markets-label">Market breadth</span><strong><AnimatedText text={advancing}/><span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}> / <AnimatedText text={assets.length}/></span></strong><small>Assets advancing today</small></div>
      </section>

      <div className="markets-tools">
        <label className="markets-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search assets" aria-label="Search markets" /></label>
        <button className="markets-watch" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(value => !value)}><Star size={13} fill={favoritesOnly ? 'currentColor' : 'none'} />Watchlist{watchlist.length ? ` · ${watchlist.length}` : ''}</button>
      </div>
      <nav className="markets-categories" aria-label="Filter markets by category">
        {categoryOptions.map(option => <button key={option} className="markets-category" aria-pressed={category === option} onClick={() => setCategory(option)}>{option}</button>)}
      </nav>

      <section className="markets-table" aria-label="Markets">
        {discovery.isError && <div className="markets-empty" role="status">{assets.length ? 'Showing the last available market snapshot.' : 'Market data is temporarily unavailable.'} <button className="markets-trade" disabled={discovery.isFetching} onClick={() => void discovery.refetch()}>Retry</button></div>}
        <div className="markets-table-head">
          <span />{sortLabel('name', 'Asset')}
          <span>{sortLabel('price', 'Price')}</span>
          <span className="markets-col-change">{sortLabel('change', '24h')}</span>
          <span className="markets-col-volume">{sortLabel('volume', 'Volume')}</span>
          <span className="markets-sort markets-col-spark" style={{ justifyContent: 'center' }}>7D</span>
          <span />
        </div>
        {discovery.isPending ? <div className="markets-empty" role="status">Loading markets...</div> : filtered.length === 0 && !discovery.isError ? <div className="markets-empty">No matching markets. Try another asset, category, or watchlist filter.</div> : filtered.map(pair => {
          const ticker = pair.id.split('/')[0];
          const price = pair.price;
          const change = pair.change ?? 0;
          const hasChange = Number.isFinite(pair.change);
          const favorite = watchlist.includes(marketWatchKey(pair));
          const tradable = tradingPairForAsset(pair);
          return <div className="markets-row" key={pair.assetId} role="link" tabIndex={0} aria-label={`Open ${pair.name} market details`} onClick={() => onNavigateToSocial(pair.assetId)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onNavigateToSocial(pair.assetId); } }}>
            <button className="markets-star" aria-label={favorite ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`} aria-pressed={favorite} onClick={event => { event.stopPropagation(); onToggleWatchlist(marketWatchKey(pair)); }}><Star size={15} fill={favorite ? 'currentColor' : 'none'} /></button>
            <button className="markets-asset" onClick={event => { event.stopPropagation(); onNavigateToSocial(pair.assetId); }}>
              <VeloAssetIcon src={pair.logo} symbol={ticker} size={34} />
              <span className="markets-asset-copy"><strong>{ticker} <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>/ USD</span></strong><span>{pair.rank ? `#${pair.rank} · ` : ''}{pair.name}</span></span>
            </button>
            <div className="markets-quote">
              <span className="markets-price">{<AnimatedText text={price == null ? '—' : `$${formatPrice(price)}`}/>}</span>
              <span className={`markets-change markets-mobile-change ${hasChange ? (change >= 0 ? 'positive' : 'negative') : ''}`}>{<AnimatedText text={hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}/>}</span>
            </div>
            <span className={`markets-change markets-col-change ${hasChange ? (change >= 0 ? 'positive' : 'negative') : ''}`}>{<AnimatedText text={hasChange ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}/>}</span>
            <span className="markets-volume markets-col-volume">{<AnimatedText text={formatMoney(pair.volume)}/>}</span>
            <span className={`markets-change markets-col-spark ${pair.change7d != null ? (pair.change7d >= 0 ? 'positive' : 'negative') : ''}`}>{<AnimatedText text={pair.change7d != null ? `${pair.change7d >= 0 ? '+' : ''}${pair.change7d.toFixed(2)}%` : '—'}/>}</span>
            {tradable ? <button className="markets-trade" onClick={event => { event.stopPropagation(); onNavigateToTrade(tradable); }}>Trade<ChevronRight size={13} /></button> : <span className="markets-soon" title="Market information only. Perpetual trading is not available for this asset.">Info only</span>}
          </div>;
        })}
      </section>
      <p className="markets-label" style={{ margin: '11px 2px 0', fontSize: 11, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}><a href="https://coinmarketcap.com/" target="_blank" rel="noopener noreferrer" title={discovery.data?.fetchedAt ? `Market data updated ${new Date(discovery.data.fetchedAt).toLocaleString()}` : 'Market data provider'} style={{ color: 'var(--fg-muted)' }}>CoinMarketCap</a></p>
    </main>
  );
};
