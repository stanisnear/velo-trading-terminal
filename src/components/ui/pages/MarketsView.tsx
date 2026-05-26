import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, TrendingUp, TrendingDown, Star, BarChart2, Activity,
  ArrowUpRight, ArrowDownRight, ChevronRight,
} from 'lucide-react';
import { PAIRS } from '@/utils/types';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatPrice = (price: number | undefined | null) => {
  if (price == null) return '—';
  if (price < 0.0001) return price.toFixed(8);
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(5);
  if (price < 10) return price.toFixed(4);
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return price.toFixed(2);
};

const formatLarge = (n?: number) => {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(0);
};

const drawSparkline = (data: number[], up: boolean) => {
  const w = 72, h = 28;
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  const color = up ? 'var(--pnl-up)' : 'var(--pnl-down)';
  const uid = 'sp-' + (up ? 'u' : 'd');
  return React.createElement('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, style: { display: 'block', flexShrink: 0 } },
    React.createElement('defs', null,
      React.createElement('linearGradient', { id: uid, x1: '0', y1: '0', x2: '0', y2: '1' },
        React.createElement('stop', { offset: '0%', stopColor: color, stopOpacity: '0.22' }),
        React.createElement('stop', { offset: '100%', stopColor: color, stopOpacity: '0' })
      )
    ),
    React.createElement('polygon', { points: '0,' + h + ' ' + pts + ' ' + w + ',' + h, fill: 'url(#' + uid + ')' }),
    React.createElement('polyline', { points: pts, fill: 'none', stroke: color, strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' })
  );
};

const PAIR_CATEGORIES: Record<string, string> = {
  'BTC/USD': 'Layer 1', 'ETH/USD': 'Layer 1', 'SOL/USD': 'Layer 1',
  'AVAX/USD': 'Layer 1', 'NEAR/USD': 'Layer 1',
  'LINK/USD': 'Oracle', 'PYTH/USD': 'Oracle',
  'RNDR/USD': 'AI / DePIN', 'TIA/USD': 'Modular', 'INJ/USD': 'DeFi', 'JUP/USD': 'DeFi',
  'DOGE/USD': 'Meme Coin', 'WIF/USD': 'Meme Coin', 'PEPE/USD': 'Meme Coin', 'BONK/USD': 'Meme Coin',
};

const ALL_CATEGORIES = ['All', 'Layer 1', 'DeFi', 'Meme Coin', 'Oracle', 'AI / DePIN', 'Modular'];

const CATEGORY_COLORS: Record<string, string> = {
  'Layer 1': 'oklch(0.68 0.22 295)',
  'DeFi': 'oklch(0.78 0.18 150)',
  'Meme Coin': 'oklch(0.80 0.16 60)',
  'Oracle': 'oklch(0.72 0.16 220)',
  'AI / DePIN': 'oklch(0.68 0.18 180)',
  'Modular': 'oklch(0.75 0.14 30)',
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
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState<'volume' | 'change' | 'price' | 'name'>('volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [sparklines, setSparklines] = useState<Record<string, number[]>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [marketCaps, setMarketCaps] = useState<Record<string, number>>({});

  const S: Record<string, React.CSSProperties> = {
    mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' },
    display: { fontFamily: 'var(--font-display)', fontStyle: 'italic', letterSpacing: '-0.02em' },
    label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--fg-subtle)' },
  };

  useEffect(() => {
    const binanceMap: Record<string, string> = {
      'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT', 'SOL/USD': 'SOLUSDT',
      'WIF/USD': 'WIFUSDT', 'JUP/USD': 'JUPUSDT', 'BONK/USD': 'BONKUSDT',
      'AVAX/USD': 'AVAXUSDT', 'LINK/USD': 'LINKUSDT', 'DOGE/USD': 'DOGEUSDT',
      'PEPE/USD': 'PEPEUSDT', 'RNDR/USD': 'RNDRUSDT', 'NEAR/USD': 'NEARUSDT',
      'TIA/USD': 'TIAUSDT', 'INJ/USD': 'INJUSDT', 'PYTH/USD': 'PYTHUSDT',
    };
    PAIRS.forEach(async (p) => {
      const sym = binanceMap[p.id];
      if (!sym) return;
      try {
        const res = await fetch('https://api.binance.com/api/v3/klines?symbol=' + sym + '&interval=1h&limit=24');
        if (!res.ok) return;
        const raw: any[] = await res.json();
        setSparklines(prev => ({ ...prev, [p.id]: raw.map((c: any) => parseFloat(c[4])) }));
        setVolumes(prev => ({ ...prev, [p.id]: raw.reduce((acc, c) => acc + parseFloat(c[7]), 0) }));
      } catch (_) {}
    });
  }, []);

  useEffect(() => {
    const geckoIds = PAIRS.filter(p => p.geckoId).map(p => p.geckoId).join(',');
    fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + geckoIds + '&order=market_cap_desc&per_page=20&page=1&sparkline=false')
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, number> = {};
        data.forEach(coin => {
          const pair = PAIRS.find(p => p.geckoId === coin.id);
          if (pair && coin.market_cap) map[pair.id] = coin.market_cap;
        });
        setMarketCaps(map);
      }).catch(() => {});
  }, []);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let list = PAIRS.filter(p => {
      const q = search.toLowerCase();
      return (!q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
        && (category === 'All' || PAIR_CATEGORIES[p.id] === category)
        && (!showFavOnly || watchlist.includes(p.id));
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return sortDir === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      const va = sortBy === 'price' ? (marketPrices[a.id] || 0) : sortBy === 'change' ? (marketChanges[a.id] || 0) : (volumes[a.id] || 0);
      const vb = sortBy === 'price' ? (marketPrices[b.id] || 0) : sortBy === 'change' ? (marketChanges[b.id] || 0) : (volumes[b.id] || 0);
      return sortDir === 'desc' ? vb - va : va - vb;
    });
    if (!showFavOnly) {
      const favs = list.filter(p => watchlist.includes(p.id));
      const rest = list.filter(p => !watchlist.includes(p.id));
      list = [...favs, ...rest];
    }
    return list;
  }, [search, category, sortBy, sortDir, watchlist, showFavOnly, marketPrices, marketChanges, volumes]);

  const SortInd = ({ col }: { col: typeof sortBy }) => (
    <span style={{ marginLeft: 3, opacity: sortBy === col ? 1 : 0.3, fontSize: 8 }}>
      {sortBy === col ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
    </span>
  );

  const totalVol = Object.values(volumes).reduce((a, b) => a + b, 0);
  const totalMcap = Object.values(marketCaps).reduce((a, b) => a + b, 0);
  const gainers = PAIRS.filter(p => (marketChanges[p.id] || 0) > 0).length;
  const losers  = PAIRS.filter(p => (marketChanges[p.id] || 0) < 0).length;

  const thBtn = (align: 'left' | 'right', col: typeof sortBy): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
    background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em',
    color: 'var(--fg-subtle)', padding: 0,
  });

  return (
    <div style={{ width: '100%', maxWidth: 1360, margin: '0 auto', paddingBottom: 80 }} className="animate-fade-in">

      {/* Responsive styles */}
      <style>{`
        .mk-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
        .mk-row   { display: grid; grid-template-columns: 26px 1fr 88px 84px 90px 72px 76px; align-items: center; padding: 13px 16px; gap: 8px; border-bottom: 1px solid var(--hairline); cursor: pointer; transition: background 0.1s; }
        .mk-hdr   { display: grid; grid-template-columns: 26px 1fr 88px 84px 90px 72px 76px; align-items: center; padding: 9px 16px; gap: 8px; border-bottom: 1px solid var(--hairline); }
        .mk-row:last-child { border-bottom: none; }
        .mk-row:hover { background: var(--chip-bg); }
        .mk-row:hover .mk-trade-btn { background: var(--iris-violet) !important; border-color: transparent !important; color: #fff !important; }
        .mk-hide { display: block; }
        .mk-spark { display: block; }
        @media (max-width: 680px) {
          .mk-stats { grid-template-columns: 1fr 1fr; }
          .mk-row { grid-template-columns: 26px 1fr 78px 72px 60px; padding: 12px 12px; }
          .mk-hdr { grid-template-columns: 26px 1fr 78px 72px 60px; }
          .mk-hide { display: none !important; }
          .mk-spark { display: none !important; }
        }
        @media (max-width: 420px) {
          .mk-stats { grid-template-columns: 1fr 1fr; gap: 8px; }
          .mk-row { grid-template-columns: 26px 1fr 68px 60px 56px; padding: 11px 8px; gap: 4px; }
          .mk-hdr { grid-template-columns: 26px 1fr 68px 60px 56px; padding: 8px 8px; gap: 4px; }
          .mk-col-vol { display: none !important; }
          .mk-col-change { display: none !important; }
        }
        .mk-cats { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin-bottom: 14px; }
        .mk-cats::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 12px', borderRadius: 999, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', marginBottom: 10 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pnl-up)', display: 'inline-block', boxShadow: '0 0 6px var(--pnl-up)' }} />
          <span style={{ ...S.label, fontSize: 10 }}>LIVE MARKETS</span>
        </div>
        <h1 style={{ ...S.display, fontSize: 'clamp(34px,6vw,50px)', color: 'var(--fg)', lineHeight: 1, margin: '0 0 6px', letterSpacing: '-0.03em' }}>
          All <em>Markets</em>
        </h1>
        <p style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)' }}>
          {PAIRS.length} perpetual markets · Up to 50× leverage
        </p>
      </div>

      {/* Stats */}
      <div className="mk-stats">
        {[
          { label: 'Total Mkt Cap', value: formatLarge(totalMcap), icon: <BarChart2 size={13}/>, color: 'var(--fg)' },
          { label: '24H Volume',    value: formatLarge(totalVol),  icon: <Activity size={13}/>,  color: 'var(--fg)' },
          { label: 'Gainers',       value: String(gainers),        icon: <TrendingUp size={13}/>,   color: 'var(--pnl-up)' },
          { label: 'Losers',        value: String(losers),         icon: <TrendingDown size={13}/>, color: 'var(--pnl-down)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 12, backdropFilter: 'blur(20px)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, color: s.color }}>{s.icon}<span style={{ ...S.label, fontSize: 9, color: 'inherit' }}>{s.label}</span></div>
            <div style={{ ...S.mono, fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 130 }}>
          <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 9, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
            onFocus={e => (e.target.style.borderColor = 'var(--iris-violet)')}
            onBlur={e => (e.target.style.borderColor = 'var(--hairline)')}
          />
        </div>
        <button
          onClick={() => setShowFavOnly(f => !f)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: showFavOnly ? '1px solid oklch(0.80 0.16 60/0.6)' : '1px solid var(--hairline)', background: showFavOnly ? 'oklch(0.80 0.16 60/0.1)' : 'var(--chip-bg)', ...S.label, fontSize: 10, color: showFavOnly ? 'oklch(0.80 0.16 60)' : 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap' }}
        >
          <Star size={11} fill={showFavOnly ? 'currentColor' : 'none'} />
          Watchlist{watchlist.length > 0 ? ' (' + watchlist.length + ')' : ''}
        </button>
      </div>

      {/* Category pills */}
      <div className="mk-cats">
        {ALL_CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)} style={{ padding: '6px 12px', borderRadius: 8, border: category === cat ? '1px solid var(--iris-violet)' : '1px solid var(--hairline)', background: category === cat ? 'oklch(0.68 0.22 295/0.12)' : 'var(--chip-bg)', ...S.label, fontSize: 10, color: category === cat ? 'var(--iris-violet)' : 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--hairline)', borderRadius: 16, backdropFilter: 'blur(24px)', overflow: 'hidden' }}>

        {/* Header */}
        <div className="mk-hdr">
          <div/>
          <button onClick={() => handleSort('name')} style={thBtn('left','name')}>Market<SortInd col="name"/></button>
          <button onClick={() => handleSort('price')} style={thBtn('right','price')}>Price<SortInd col="price"/></button>
          <button onClick={() => handleSort('change')} className="mk-col-change" style={thBtn('right','change')}>24h<SortInd col="change"/></button>
          <button onClick={() => handleSort('volume')} className="mk-hide" style={thBtn('right','volume')}>Volume<SortInd col="volume"/></button>
          <div className="mk-spark" style={{ ...S.label, textAlign: 'center' }}>7D</div>
          <div style={{ ...S.label, textAlign: 'right' }}>Trade</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <p style={{ ...S.display, fontSize: 20, color: 'var(--fg)', margin: '0 0 6px' }}>No markets found</p>
            <p style={{ ...S.label, fontSize: 10 }}>Try a different search or category</p>
          </div>
        ) : filtered.map(pair => {
          const price  = marketPrices[pair.id];
          const change = marketChanges[pair.id] ?? 0;
          const up     = change >= 0;
          const spark  = sparklines[pair.id] || [];
          const vol    = volumes[pair.id];
          const cat    = PAIR_CATEGORIES[pair.id];
          const catColor = cat ? CATEGORY_COLORS[cat] : 'var(--fg-subtle)';
          const isFav  = watchlist.includes(pair.id);
          const ticker = pair.id.split('/')[0];

          return (
            <div key={pair.id} className="mk-row" onClick={() => onNavigateToSocial(ticker)}>

              {/* Star */}
              <button onClick={e => { e.stopPropagation(); onToggleWatchlist(pair.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isFav ? 'oklch(0.80 0.16 60)' : 'var(--fg-subtle)', padding: 0, display: 'flex', alignItems: 'center', transition: 'color 0.12s', flexShrink: 0 }}>
                <Star size={13} fill={isFav ? 'currentColor' : 'none'} />
              </button>

              {/* Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <img src={pair.logo} alt={pair.name} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--hairline)', flexShrink: 0, background: 'var(--chip-bg)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>{ticker}</span>
                    {cat && (
                      <span className="mk-hide" style={{ padding: '1px 5px', borderRadius: 5, background: catColor + '18', border: '1px solid ' + catColor + '44', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: catColor, textTransform: 'uppercase', flexShrink: 0 }}>
                        {cat}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{pair.name}</span>
                </div>
              </div>

              {/* Price */}
              <div style={{ ...S.mono, fontSize: 13, fontWeight: 700, color: 'var(--fg)', textAlign: 'right' }}>
                {price != null ? '$' + formatPrice(price) : '—'}
              </div>

              {/* Change */}
              <div className="mk-col-change" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                {up
                  ? <ArrowUpRight size={11} style={{ color: 'var(--pnl-up)', flexShrink: 0 }} />
                  : <ArrowDownRight size={11} style={{ color: 'var(--pnl-down)', flexShrink: 0 }} />}
                <span style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: up ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                  {up ? '+' : ''}{change.toFixed(2)}%
                </span>
              </div>

              {/* Volume */}
              <div className="mk-hide" style={{ ...S.mono, fontSize: 12, color: 'var(--fg-muted)', textAlign: 'right' }}>
                {vol ? formatLarge(vol) : '—'}
              </div>

              {/* Sparkline */}
              <div className="mk-spark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {spark.length > 1
                  ? drawSparkline(spark, up)
                  : <div style={{ width: 72, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ ...S.label, fontSize: 8 }}>…</span></div>}
              </div>

              {/* Trade button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="mk-trade-btn"
                  onClick={e => { e.stopPropagation(); const po = PAIRS.find(p => p.id === pair.id); if (po) onNavigateToTrade(po); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--hairline-strong)', background: 'var(--chip-bg)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                >
                  Trade<ChevronRight size={11}/>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', textAlign: 'center', marginTop: 14 }}>
        Prices · Binance &nbsp;·&nbsp; Market cap · CoinGecko &nbsp;·&nbsp; {filtered.length} of {PAIRS.length} markets · Click row to view token page
      </p>
    </div>
  );
};
