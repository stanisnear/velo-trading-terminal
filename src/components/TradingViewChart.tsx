import React, { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react';
import { Position } from '../utils/types';

// ═══════════════════════════════════════════════════════════════════════════
// TradingView free widget adapter
// ───────────────────────────────────────────────────────────────────────────
// The free embed (`s3.tradingview.com/tv.js`) only accepts configuration via
// the widget constructor. It does NOT expose `activeChart()`, `createStudy`,
// `createShape`, or `removeEntity` — those are paid Advanced Charting Library
// APIs. Previous builds tried to call them and silently swallowed the errors,
// which is why "indicators" and "overlays" never showed up on the chart.
//
// Fix: we pass `studies` via the constructor, and recreate the widget when
// the indicator list or symbol/timeframe/style changes. For entry/TP/SL/liq
// overlays we render pinned HTML price badges absolutely positioned over the
// chart container — no drawings API required, renders identically in every
// theme, and is 100% reliable.
// ═══════════════════════════════════════════════════════════════════════════

// TradingView ticker symbols for our pair list. For pairs that Orderly
// supports (Velo's live-mode universe) we use COINBASE feeds because they
// track the spot index closely and don't carry the Tether premium that
// shows up on BINANCE charts. For demo-only pairs we fall back to whichever
// venue has the deepest book.
// Chart data source: Pyth (PYTH:* symbols on TradingView). This is the SAME
// oracle the VeloPerps contract settles trades against and that now drives the
// live mark price, so the chart, the ticker, and on-chain fills all agree.
// (Previously these were COINBASE:/BINANCE: symbols, which left the chart a few
// cents off from every fill — a different exchange, not a different time.)
const TV_SYMBOLS: Record<string,string> = {
  // On-chain tradable pairs (VELO_PAIRS) — all verified on TradingView's PYTH source
  'BTC/USD':    'PYTH:BTCUSD',
  'ETH/USD':    'PYTH:ETHUSD',
  'SOL/USD':    'PYTH:SOLUSD',
  'AVAX/USD':   'PYTH:AVAXUSD',
  'LINK/USD':   'PYTH:LINKUSD',
  'DOGE/USD':   'PYTH:DOGEUSD',
  'NEAR/USD':   'PYTH:NEARUSD',
  'INJ/USD':    'PYTH:INJUSD',
  'APT/USD':    'PYTH:APTUSD',
  'ARB/USD':    'PYTH:ARBUSD',
  'OP/USD':     'PYTH:OPUSD',
  'SUI/USD':    'PYTH:SUIUSD',
  'TIA/USD':    'PYTH:TIAUSD',
  'SEI/USD':    'PYTH:SEIUSD',
  'RENDER/USD': 'PYTH:RENDERUSD',
  'WLFI/USD':   'PYTH:WLFIUSD',
  'POL/USD':    'PYTH:POLUSD',
  // Display-only pairs from the broad PAIRS list
  'RNDR/USD':   'PYTH:RENDERUSD',
  'WIF/USD':    'PYTH:WIFUSD',
  'JUP/USD':    'PYTH:JUPUSD',
  'BONK/USD':   'PYTH:BONKUSD',
  'PEPE/USD':   'PYTH:PEPEUSD',
  'PYTH/USD':   'PYTH:PYTHUSD',
};

export const TV_INTERVALS_QUICK: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1H': '60', '4H': '240', '1D': 'D',
};

export const TV_INTERVALS: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1H': '60', '2H': '120', '4H': '240', '6H': '360', '12H': '720',
  '1D': 'D', '3D': '3D', '1W': 'W', '1M': 'M',
};

export type ChartStyleCode = '0' | '1' | '2' | '3' | '4' | '5' | '8' | '9' | '10';

export const CHART_STYLES: { label: string; code: ChartStyleCode; icon: string }[] = [
  { label: 'Candles',        code: '1',  icon: '▮'  },
  { label: 'Hollow Candles', code: '9',  icon: '□'  },
  { label: 'Heikin Ashi',    code: '8',  icon: '▦'  },
  { label: 'Bars',           code: '0',  icon: '▥'  },
  { label: 'Line',           code: '2',  icon: '╱'  },
  { label: 'Area',           code: '3',  icon: '△'  },
  { label: 'Baseline',       code: '10', icon: '⌇'  },
  { label: 'Renko',          code: '4',  icon: '◼'  },
  { label: 'Kagi',           code: '5',  icon: '⏢'  },
];

// The 12 most-used indicators, grouped. The free TradingView embed only
// accepts the `studies: [...]` constructor param (no createStudy API), so
// we keep this list tight to reduce the UI noise the user sees when picking.
export const INDICATORS = [
  // Trend
  { id: 'MASimple@tv-basicstudies',    label: 'MA',        group: 'Trend'      },
  { id: 'MAExp@tv-basicstudies',       label: 'EMA',       group: 'Trend'      },
  { id: 'BB@tv-basicstudies',          label: 'Bollinger', group: 'Trend'      },
  { id: 'IchimokuCloud@tv-basicstudies', label: 'Ichimoku', group: 'Trend'     },
  // Momentum
  { id: 'RSI@tv-basicstudies',         label: 'RSI',       group: 'Momentum'   },
  { id: 'MACD@tv-basicstudies',        label: 'MACD',      group: 'Momentum'   },
  { id: 'Stochastic@tv-basicstudies',  label: 'Stochastic',group: 'Momentum'   },
  // Volatility
  { id: 'ATR@tv-basicstudies',         label: 'ATR',       group: 'Volatility' },
  // Volume
  { id: 'Volume@tv-basicstudies',      label: 'Volume',    group: 'Volume'     },
  { id: 'VWAP@tv-basicstudies',        label: 'VWAP',      group: 'Volume'     },
  { id: 'OBV@tv-basicstudies',         label: 'OBV',       group: 'Volume'     },
  { id: 'MFI@tv-basicstudies',         label: 'MFI',       group: 'Volume'     },
];

interface TradingViewChartProps {
  initialData?: any[];
  theme: 'light' | 'dark';
  pairName: string;
  currentPrice: number;
  activePosition?: Position | null;
  onTimeframeChange?: (tf: string) => void;
  externalTimeframe?: string;
  externalChartStyle?: ChartStyleCode;
  externalIndicators?: string[];
  showEntryLine?: boolean;
  showTPLine?: boolean;
  showSLLine?: boolean;
  showLiqLine?: boolean;
  liqPrice?: number;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = memo(({
  theme, pairName, currentPrice, activePosition, initialData,
  externalTimeframe, externalChartStyle, externalIndicators,
  showEntryLine = true, showTPLine = true, showSLLine = true, showLiqLine = true,
  liqPrice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState(externalTimeframe || '15m');
  const [chartStyle, setChartStyle] = useState<ChartStyleCode>(externalChartStyle || '1');
  const scriptLoadedRef = useRef(false);
  const widgetRef = useRef<any>(null);
  const isDark = theme === 'dark';

  // Branded chart surface — never pure white/black. Matches the obsidian dark
  // and soft-lavender light panel tokens so the chart sits in the brand rather
  // than punching a white hole in the page.
  const BG = isDark ? '#0b0d12' : '#f0eef8';
  // RGB channels of BG, for building the edge-feather gradient (rgba() with alpha).
  const featherRGB = isDark ? '11,13,18' : '240,238,248';

  const tvSymbol = TV_SYMBOLS[pairName] || 'PYTH:BTCUSD';
  const tvInterval = TV_INTERVALS[timeframe] || '15';

  // Estimate the chart's visible price band from the real Pyth candles we were
  // handed (initialData). The TradingView embed runs in a cross-origin iframe,
  // so we can't read its price scale in production — without this, overlay lines
  // were placed by a ±28% guess and landed far from where they should. Using the
  // recent candles' high/low (plus TradingView-like auto-scale padding) puts the
  // entry / TP / SL / liq lines in roughly the right place reliably.
  const visibleRange = useMemo(() => {
    const data = Array.isArray(initialData) ? initialData : [];
    if (data.length < 2) return null;
    const recent = data.slice(-60);
    let hi = -Infinity, lo = Infinity;
    for (const c of recent as any[]) {
      const h = Number(c?.high ?? c?.h ?? c?.close ?? c?.c);
      const l = Number(c?.low ?? c?.l ?? c?.close ?? c?.c);
      if (isFinite(h)) hi = Math.max(hi, h);
      if (isFinite(l)) lo = Math.min(lo, l);
    }
    if (!isFinite(hi) || !isFinite(lo) || hi <= lo) return null;
    const pad = (hi - lo) * 0.12; // ~12% total, mimics TradingView auto-scale padding
    return { high: hi + pad, low: lo - pad };
  }, [initialData]);

  useEffect(() => { if (externalTimeframe) setTimeframe(externalTimeframe); }, [externalTimeframe]);
  useEffect(() => { if (externalChartStyle) setChartStyle(externalChartStyle); }, [externalChartStyle]);

  // Sorted+joined indicator-list fingerprint — dedupes rapid toggles from
  // causing multiple widget rebuilds with identical content
  const indicatorKey = (externalIndicators || []).slice().sort().join('|');

  const createWidget = useCallback(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.id = 'tv_' + Date.now();
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '100%';
    containerRef.current.appendChild(widgetDiv);

    const localBG = BG;
    const localBG2 = isDark ? '#12141b' : '#e8e5f2';
    const localGRID = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(10,10,14,0.06)';
    const localTICK = isDark ? 'rgba(154,154,164,0.6)' : 'rgba(84,85,100,0.75)';

    // Clear cached TradingView settings that would override our theme overrides
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('tradingview.') || key.startsWith('tv-chart-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}

    const bgOverrides = {
      'paneProperties.background':                   localBG,
      'paneProperties.backgroundGradientStartColor': localBG,
      'paneProperties.backgroundGradientEndColor':   localBG,
      'paneProperties.backgroundType':               'solid',
      'paneProperties.vertGridProperties.color':     localGRID,
      'paneProperties.horzGridProperties.color':     localGRID,
      'paneProperties.vertGridProperties.style':     1,
      'paneProperties.horzGridProperties.style':     1,
      'scalesProperties.textColor':       localTICK,
      'scalesProperties.backgroundColor': localBG,
      'scalesProperties.lineColor':       localGRID,
      'scalesProperties.fontSize':        11,
    };

    try {
      const widget = new (window as any).TradingView.widget({
        container_id: widgetDiv.id,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: 'Etc/UTC',
        theme: isDark ? 'dark' : 'light',
        toolbar_bg: localBG2,
        style: chartStyle,
        locale: 'en',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_top_toolbar: true,
        hide_legend: false,
        hide_side_toolbar: true,
        save_image: false,
        withdateranges: false,
        details: false,
        hotlist: false,
        calendar: false,
        show_popup_button: false,
        studies: externalIndicators || [],
        disabled_features: [
          'header_symbol_search', 'header_compare', 'header_undo_redo',
          'header_screenshot', 'header_saveload', 'symbol_search_hot_key',
          'display_market_status', 'compare_symbol', 'border_around_the_chart',
          'remove_library_container_border', 'go_to_date', 'timeframes_toolbar',
        ],
        enabled_features: [
          'side_toolbar_in_fullscreen_mode',
          'study_templates',
          'create_volume_indicator_by_default',
          'items_favoriting',
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor':               '#4ade80',
          'mainSeriesProperties.candleStyle.downColor':             '#f87171',
          'mainSeriesProperties.candleStyle.borderUpColor':         '#4ade80',
          'mainSeriesProperties.candleStyle.borderDownColor':       '#f87171',
          'mainSeriesProperties.candleStyle.wickUpColor':           '#4ade80',
          'mainSeriesProperties.candleStyle.wickDownColor':         '#f87171',
          'mainSeriesProperties.hollowCandleStyle.upColor':         '#4ade80',
          'mainSeriesProperties.hollowCandleStyle.downColor':       '#f87171',
          'mainSeriesProperties.hollowCandleStyle.borderUpColor':   '#4ade80',
          'mainSeriesProperties.hollowCandleStyle.borderDownColor': '#f87171',
          'mainSeriesProperties.hollowCandleStyle.wickUpColor':     '#4ade80',
          'mainSeriesProperties.hollowCandleStyle.wickDownColor':   '#f87171',
          'mainSeriesProperties.haStyle.upColor':                   '#4ade80',
          'mainSeriesProperties.haStyle.downColor':                 '#f87171',
          'mainSeriesProperties.haStyle.borderUpColor':             '#4ade80',
          'mainSeriesProperties.haStyle.borderDownColor':           '#f87171',
          'mainSeriesProperties.haStyle.wickUpColor':               '#4ade80',
          'mainSeriesProperties.haStyle.wickDownColor':             '#f87171',
          'mainSeriesProperties.barStyle.upColor':                  '#4ade80',
          'mainSeriesProperties.barStyle.downColor':                '#f87171',
          'mainSeriesProperties.lineStyle.color':     '#8b5cf6',
          'mainSeriesProperties.lineStyle.linewidth': 2,
          'mainSeriesProperties.areaStyle.color1':    'rgba(139,92,246,0.22)',
          'mainSeriesProperties.areaStyle.color2':    'rgba(139,92,246,0.01)',
          'mainSeriesProperties.areaStyle.lineColor': '#8b5cf6',
          'mainSeriesProperties.areaStyle.linewidth': 2,
          'mainSeriesProperties.baselineStyle.topLineColor':    '#4ade80',
          'mainSeriesProperties.baselineStyle.bottomLineColor': '#f87171',
          'mainSeriesProperties.priceLineColor': '#8b5cf6',
          'mainSeriesProperties.priceLineWidth': 1,
          ...bgOverrides,
        },
        studies_overrides: {
          'volume.volume.color.0':      'rgba(248,113,113,0.35)',
          'volume.volume.color.1':      'rgba(74,222,128,0.35)',
          'volume.volume ma.color':     '#8b5cf6',
          'volume.volume ma.linewidth': 1,
          'volume.show ma':             false,
        },
        loading_screen: { backgroundColor: localBG, foregroundColor: '#8b5cf6' },
        autosize: true,
      });
      widgetRef.current = widget;
    } catch (e) {
      console.warn('TradingView widget error:', e);
    }
  }, [tvSymbol, tvInterval, isDark, chartStyle, indicatorKey]);

  // Widget lifecycle — recreate on any of: symbol, timeframe, theme, style,
  // or indicator-set changes. Free widget has no hot-patch API so this is
  // the only reliable path.
  useEffect(() => {
    if (scriptLoadedRef.current && (window as any).TradingView) {
      createWidget();
    } else {
      const existing = document.querySelector('script[src*="tradingview.com/tv.js"]');
      if (existing && (window as any).TradingView) {
        scriptLoadedRef.current = true;
        createWidget();
      } else if (existing) {
        const poll = setInterval(() => {
          if ((window as any).TradingView) {
            clearInterval(poll);
            scriptLoadedRef.current = true;
            createWidget();
          }
        }, 100);
        return () => clearInterval(poll);
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => { scriptLoadedRef.current = true; createWidget(); };
        document.head.appendChild(script);
      }
    }
    return () => { widgetRef.current = null; };
  }, [createWidget]);

  // Keep the embedded iframe fully opaque; the pane background is now branded
  // directly via overrides, so no blend hack is needed.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const apply = () => {
      const iframe = container.querySelector('iframe');
      if (iframe) {
        (iframe as HTMLElement).style.mixBlendMode = 'normal';
        (iframe as HTMLElement).style.opacity = '1';
      }
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(container, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [isDark]);

  // ─── Overlay price lines ────────────────────────────────────────────────
  // We render horizontal price lines + right-side labels over the chart.
  // These are absolutely-positioned HTML elements — no createShape API needed.
  // Y position is estimated from a visible price range derived from the
  // current price and known position prices.
  const fmt = (n?: number) => {
    if (n == null || !isFinite(n)) return '';
    if (n < 1)    return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    if (n < 100)  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const badge = (bg: string, color: string, border: string): React.CSSProperties => ({
    background: bg,
    color,
    padding: '3px 9px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: `1px solid ${border}`,
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  });

  // ── Price-axis scraper ──────────────────────────────────────────────────
  // We poll the TradingView iframe's DOM every 300 ms to read the actual
  // price-scale labels and their pixel Y positions. This gives us a real
  // price→pixel mapping that tracks zooming/panning correctly.
  // Falls back to a heuristic when cross-origin blocks DOM access.
  const axisPointsRef = useRef<{ price: number; yPx: number }[]>([]);
  const containerHeightRef = useRef<number>(0);

  useEffect(() => {
    const scrape = () => {
      const container = containerRef.current;
      if (!container) return;
      containerHeightRef.current = container.getBoundingClientRect().height;

      try {
        const iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
        if (!iframe) return;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        // TradingView renders price labels as text nodes inside the right-side
        // price scale. We walk all text nodes, filter those that look like prices,
        // and record their bounding-rect Y relative to the overlay container.
        const containerRect = container.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();
        const points: { price: number; yPx: number }[] = [];

        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
          const text = node.textContent?.trim() ?? '';
          const clean = text.replace(/,/g, '');
          const num = parseFloat(clean);
          if (!isFinite(num) || num <= 0) continue;
          if (!/^\d[\d,.]*(\.\d+)?$/.test(text)) continue;

          const parent = node.parentElement;
          if (!parent) continue;
          // getBoundingClientRect() on elements inside an iframe returns
          // coordinates in the IFRAME's own viewport space (not the main page).
          const rect = parent.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;

          // iframeRect gives us the iframe's position in the MAIN page.
          // rect.left/top are in IFRAME-local coords.
          // To check if element is in the right 25% of iframe:
          const iframeW = iframeRect.width;
          if (rect.left < iframeW * 0.75) continue; // right 25% price scale

          const yCenterLocal = rect.top + rect.height / 2;
          const iframeH = iframeRect.height;
          // Exclude volume pane at bottom ~18%
          if (yCenterLocal > iframeH * 0.82) continue;
          if (yCenterLocal < 10) continue;

          // Convert iframe-local Y to overlay-container Y:
          // overlay container top = iframeRect.top - containerRect.top (since iframe starts at same place)
          const yRelContainer = (iframeRect.top - containerRect.top) + yCenterLocal;
          points.push({ price: num, yPx: yRelContainer });
        }

        if (points.length >= 2) {
          // Sort by price descending (high price = low Y pixel)
          points.sort((a, b) => b.price - a.price);
          // Deduplicate prices within 0.01% of each other
          const deduped: typeof points = [points[0]];
          for (let i = 1; i < points.length; i++) {
            const prev = deduped[deduped.length - 1];
            if (Math.abs(points[i].price - prev.price) / prev.price > 0.0001) {
              deduped.push(points[i]);
            }
          }
          if (deduped.length >= 2) {
            axisPointsRef.current = deduped;
          }
        }
      } catch (_) {
        // Cross-origin — iframe DOM is blocked in production. Fall through to
        // heuristic below; axisPointsRef stays empty/stale.
      }
    };

    const id = setInterval(scrape, 300);
    return () => clearInterval(id);
  }, []); // runs once; containerRef stable

  // Map a price to a Y pixel position using scraped axis points.
  // Falls back to a heuristic if not enough points are available.
  const getPriceYpx = (price: number, refPrice: number): number | null => {
    if (!price || !refPrice || refPrice <= 0) return null;
    const h = containerHeightRef.current || containerRef.current?.getBoundingClientRect().height || 400;

    const pts = axisPointsRef.current;
    if (pts.length >= 2) {
      // pts is sorted descending by price: pts[0] = highest price (lowest Y px)
      const visibleHigh = pts[0].price;
      const visibleLow  = pts[pts.length - 1].price;

      // Price is outside the visible chart range — don't extrapolate, hide the line
      if (price > visibleHigh || price < visibleLow) return null;

      // Find the two surrounding axis points and interpolate
      let above = pts[0];
      let below = pts[pts.length - 1];
      for (let i = 0; i < pts.length - 1; i++) {
        if (pts[i].price >= price && pts[i + 1].price <= price) {
          above = pts[i];
          below = pts[i + 1];
          break;
        }
      }
      const priceRange = above.price - below.price;
      if (priceRange <= 0) return null;
      const t = (above.price - price) / priceRange;
      const yPx = above.yPx + t * (below.yPx - above.yPx);
      // Clamp to visible area with a small margin
      if (yPx < 10 || yPx > h - 30) return null;
      return yPx;
    }

    // ── Range fallback (cross-origin iframe / not yet scraped) ──────────
    // Prefer the real candle-derived band; otherwise a tight ±3% around the
    // reference price (never the old ±28% which threw lines off-screen).
    let high: number, low: number;
    if (visibleRange) {
      high = visibleRange.high;
      low = visibleRange.low;
    } else {
      const halfRange = refPrice * 0.03;
      high = refPrice + halfRange;
      low = refPrice - halfRange;
    }
    if (price > high || price < low) return null;
    const chartTop    = h * 0.04;
    const chartBottom = h * 0.84; // keep inside the price pane, above the time axis
    const chartH = chartBottom - chartTop;
    const pct = (high - price) / (high - low);
    const yPx = chartTop + pct * chartH;
    if (yPx < chartTop || yPx > chartBottom) return null;
    return yPx;
  };

  const PriceLine = ({ price, refPrice, lineColor, labelBg, labelColor, labelBorder, label }: {
    price: number; refPrice: number;
    lineColor: string; labelBg: string; labelColor: string; labelBorder: string;
    label: string;
  }) => {
    const yPx = getPriceYpx(price, refPrice);
    if (yPx === null) return null;
    return (
      <div style={{
        position: 'absolute', left: 0, right: 52, top: yPx,
        zIndex: 20, pointerEvents: 'none',
        transform: 'translateY(-50%)',
      }}>
        {/* Dashed horizontal line */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%',
          height: 1, transform: 'translateY(-50%)',
          borderTop: `1.5px dashed ${lineColor}`,
          opacity: 0.7,
        }} />
        {/* Single left-side label — "LABEL · $price". The old right-side badge
            sat in the price-axis gutter and collided with TradingView's own
            price labels, so it's gone. */}
        <div style={{
          position: 'absolute', left: 6, top: '50%',
          transform: 'translateY(-50%)',
          ...badge(labelBg + 'cc', labelColor, labelBorder),
          fontSize: 9, padding: '2px 7px',
        }}>
          {label} · ${fmt(price)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: BG }}>
      {/* VELO watermark */}
      <div style={{
        position: 'absolute', bottom: '18%', left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, pointerEvents: 'none', userSelect: 'none',
        fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400,
        fontSize: 'clamp(64px, 9vw, 128px)', letterSpacing: '-0.04em', lineHeight: 1,
        color: isDark ? 'rgba(255,255,255,0.032)' : 'rgba(10,10,14,0.05)',
        whiteSpace: 'nowrap',
      }}>VELO</div>

      {/* Chart widget container */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: BG }} />

      {/* Edge-blend overlay — the free TradingView embed paints its own opaque
          surface inside a cross-origin iframe and ignores our paneProperties
          background override, so in light mode it shows as a hard white block.
          We can't recolour the iframe interior, but we CAN feather its edges
          into the page tone: this radial wash is fully transparent over the
          centre (candles stay crisp) and ramps to the surface colour at the
          rim, so the chart dissolves into the page instead of punching a white
          rectangle. pointer-events:none keeps the chart fully interactive. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none',
        background: `radial-gradient(140% 130% at 50% 42%, rgba(${featherRGB},0) 50%, rgba(${featherRGB},0.20) 80%, rgba(${featherRGB},0.72) 100%)`,
      }} />
      {/* Soft inner ring so the panel edge reads as intentional, not cropped */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 16, pointerEvents: 'none',
        boxShadow: `inset 0 0 0 1px ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(90,70,160,0.10)'}`,
        borderRadius: 'inherit',
      }} />

      {/* Overlay price LINES (entry / TP / SL / liquidation) */}
      {(() => {
        if (!activePosition) return null;
        const entry = Number(activePosition.entryPrice);
        if (!activePosition.pair || !activePosition.side || !isFinite(entry) || entry <= 0) return null;
        const normPair = (s: string) => s.replace(/[^A-Z]/gi, '').replace(/USD[TC]?$/i, '').toUpperCase();
        if (normPair(activePosition.pair) !== normPair(pairName)) return null;

        const resolvedLiq = (() => {
          const posLiq = Number(activePosition.liquidationPrice);
          if (isFinite(posLiq) && posLiq > 0) return posLiq;
          if (liqPrice && isFinite(liqPrice) && liqPrice > 0) return liqPrice;
          return null;
        })();

        const ref = currentPrice > 0 ? currentPrice : entry;

        return (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20, overflow: 'hidden' }}>
            {showEntryLine && (
              <PriceLine price={entry} refPrice={ref}
                lineColor="#a78bfa" labelBg="rgba(139,92,246,0.22)" labelColor="#a78bfa" labelBorder="rgba(139,92,246,0.35)"
                label={activePosition.side} />
            )}
            {showTPLine && (() => {
              const tp = Number(activePosition.takeProfit);
              return isFinite(tp) && tp > 0 ? (
                <PriceLine price={tp} refPrice={ref}
                  lineColor="#4ade80" labelBg="rgba(74,222,128,0.18)" labelColor="#4ade80" labelBorder="rgba(74,222,128,0.35)"
                  label="TP" />
              ) : null;
            })()}
            {showSLLine && (() => {
              const sl = Number(activePosition.stopLoss);
              return isFinite(sl) && sl > 0 ? (
                <PriceLine price={sl} refPrice={ref}
                  lineColor="#f87171" labelBg="rgba(248,113,113,0.18)" labelColor="#f87171" labelBorder="rgba(248,113,113,0.35)"
                  label="SL" />
              ) : null;
            })()}
            {showLiqLine && resolvedLiq != null && (
              <PriceLine price={resolvedLiq} refPrice={ref}
                lineColor="#f97316" labelBg="rgba(249,115,22,0.18)" labelColor="#f97316" labelBorder="rgba(249,115,22,0.35)"
                label="Liq" />
            )}
          </div>
        );
      })()}
    </div>
  );
});
