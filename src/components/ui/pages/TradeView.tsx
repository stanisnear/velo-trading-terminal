import { AnimatedText } from '../AnimatedValue';
import { LEGACY_V31_RESTRICTED } from '@/services/testnetReleaseGate';
import { positionPnl } from '@/services/positionValuation.mjs';
import { IS_V4, PAIR_INDEX, VELO_PERPS_V4_ADDRESS, type VeloPairLabel } from '@/services/veloPerpsService';
import { VELO_PERPS_V4_ABI } from '@/services/veloPerpsV4Abi';
import { useReadContract } from 'wagmi';
import { validateTradeForm } from '@/services/tradeFormValidation.mjs';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Copy, Edit, Lock, User, Bot, Search, X, Zap, Activity, Share2, Plus, Check, RefreshCw, Loader2 } from 'lucide-react';
import { TradingViewChart, TV_INTERVALS, TV_INTERVALS_QUICK, CHART_STYLES, INDICATORS, ChartStyleCode } from '@/components/TradingViewChart';
import { OrderBook } from '@/components/OrderBook';
import { Button, Input, VeloAssetIcon, formatMoney, formatPrice, formatTime, playSound } from '@/components/ui/shared';
import { Position, OpenOrder, OrderType, MarginMode, PAIRS, ORDERLY_PAIRS, TradeHistoryItem } from '@/utils/types';
import { OrderDetailsModal, DetailsPayload } from '@/components/ui/OrderDetailsModal';
import { Dialog } from '@/components/ui/Dialog';
import './TradeView.css';
import { TradeRail } from './TradeRail';
// ── Orderly helpers inlined to avoid circular-dependency bundler errors ────────
// (TradeView → OrderBook → orderlyOrderbookStream → orderlyService → viem causes
//  a "cannot access before initialization" ReferenceError in the Vite bundle)
const ORDERLY_SYMBOL_MAP: Record<string, string> = {
  'BTC/USD':  'PERP_BTC_USDC',
  'ETH/USD':  'PERP_ETH_USDC',
  'SOL/USD':  'PERP_SOL_USDC',
  'AVAX/USD': 'PERP_AVAX_USDC',
  'LINK/USD': 'PERP_LINK_USDC',
  'DOGE/USD': 'PERP_DOGE_USDC',
  'NEAR/USD': 'PERP_NEAR_USDC',
  'INJ/USD':  'PERP_INJ_USDC',
};
const orderlyPortfolioUrl = () => 'https://testnet.orderly.org/portfolio';
const orderlyOrderUrl = (orderId: number) => `https://testnet.orderly.org/portfolio?order=${orderId}`;
const baseScanTxUrl = (txHash: string) => `https://sepolia.basescan.org/tx/${txHash}`;
const EMPTY_CHART_CANDLES: never[] = [];
interface OrderlyPosition {
  symbol: string; positionQty: number; costPosition: number;
  lastSumUnitaryFunding: number; pendingLongQty: number; pendingShortQty: number;
  settlePrice: number; averageOpenPrice: number; unsettledPnl: number;
  markPrice: number; estLiqPrice: number | null; imrwithOrders: number;
  mmrwithOrders: number; pnl24H: number; fee24H: number; settledPnl: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — centralized so every sub-component speaks the same language
// ─────────────────────────────────────────────────────────────────────────────
const S = {
    // Three type roles from the brand spec:
    //   display  → Instrument Serif italic  (prices, pair names, hero values)
    //   mono     → JetBrains Mono           (all numeric data, labels, tabs)
    //   sans     → Inter Tight              (UI buttons, body copy)
    display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' },
    mono:    { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1', fontVariantNumeric: 'tabular-nums' as const },
    label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' as const },
    sans:    { fontFamily: 'var(--font-sans)', fontWeight: 700 },

    // Surfaces
    panel2:  { background: 'var(--bg-base-2)', border: '1px solid var(--hairline)' },
    chip:    { background: 'var(--chip-bg)', borderRadius: 8 },
} as const;

// Small reusable dropdown panel wrapper
const DropPanel = ({ children, align = 'right' }: { children: React.ReactNode; align?: 'right' | 'left' }) => (
    <div className="velo-popover" style={{ position: 'absolute', [align]: 0, top: 'calc(100% + 5px)', background: 'var(--bg-base-2)', border: '1px solid var(--hairline-strong)', borderRadius: 13, boxShadow: '0 16px 48px rgba(0,0,0,0.45)', overflow: 'hidden', zIndex: 200, minWidth: 160 }}>
        {children}
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Pair Selector Modal
// ─────────────────────────────────────────────────────────────────────────────
const PairSelector = ({ isOpen, onClose, onSelect, marketPrices = {}, marketChanges = {}, isLiveMode = false }: any) => {
    const [search, setSearch] = useState('');
    useEffect(() => { if (isOpen) setSearch(''); }, [isOpen]);
    if (!isOpen) return null;
    const allPairs = ORDERLY_PAIRS;
    const filtered = allPairs.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
    );
    return (
        <Dialog open={isOpen} onClose={onClose} title="Select market">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--hairline)' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--fg-subtle)', flexShrink: 0 }} />
                        <input autoFocus aria-label="Search trading markets" placeholder="Search markets…" value={search} onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 9, padding: '7px 10px 7px 30px', outline: 'none', ...S.mono, fontSize: 12, color: 'var(--fg)', boxSizing: 'border-box' as const }} />
                    </div>
                </div>
                <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: 5 }}>
                    {filtered.map(p => {
                        const chg = marketChanges[p.id];
                        const hasChg = chg !== undefined && chg !== null;
                        const chgColor = hasChg ? (chg >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-subtle)';
                        return (
                            <button key={p.id} onClick={() => { onSelect(p); onClose(); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', transition: 'background 0.1s', color: 'var(--fg)' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                    <VeloAssetIcon src={p.logo} symbol={p.id.split('/')[0]} size={28} />
                                    <div style={{ textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)' }}>{p.id}</span>
                                        </div>
                                        <div style={{ ...S.label, fontSize: 9 }}>{p.name}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ ...S.mono, fontSize: 12, fontWeight: 700, color: 'var(--fg)' }}>{<AnimatedText text={Number.isFinite(marketPrices[p.id]) ? `$${formatPrice(marketPrices[p.id])}` : 'Unavailable'}/>}</div>
                                    {hasChg && (
                                        <div style={{ ...S.mono, fontSize: 10, fontWeight: 700, color: chgColor }}>
                                            {chg >= 0 ? '+' : ''}{<AnimatedText text={chg.toFixed(2)}/>}%
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                    {!filtered.length && <p role="status" style={{ padding: 20, color: 'var(--fg-muted)' }}>No matching trading markets.</p>}
                </div>
            </div>
        </Dialog>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Timeframe Selector — quick-access pills + "More" dropdown for extended TFs
// ─────────────────────────────────────────────────────────────────────────────
const TF_GROUPS = [
    { label: 'Minutes', tfs: ['1m', '3m', '5m', '15m', '30m'] },
    { label: 'Hours',   tfs: ['1H', '2H', '4H', '6H', '12H'] },
    { label: 'Days+',   tfs: ['1D', '3D', '1W', '1M'] },
];

const TfSelector = ({ tf, setTf, isMobile }: { tf: string; setTf: (t: string) => void; isMobile: boolean }) => {
    const [showMore, setShowMore] = React.useState(false);
    const moreRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const h = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const quickKeys = Object.keys(TV_INTERVALS_QUICK);
    const moreKeys  = Object.keys(TV_INTERVALS).filter(k => !quickKeys.includes(k));
    const isMore    = !quickKeys.includes(tf);

    const btnStyle = (active: boolean): React.CSSProperties => ({
        fontFamily: 'var(--font-mono)',
        fontFeatureSettings: '"tnum" 1',
        fontSize: isMobile ? 9 : 10,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        padding: isMobile ? '2px 5px' : '3px 7px',
        borderRadius: 6,
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.12s',
        whiteSpace: 'nowrap' as const,
        background: active ? 'var(--glass-bg-strong)' : 'transparent',
        color: active ? 'var(--fg)' : 'var(--fg-subtle)',
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {quickKeys.map(t => (
                <button key={t} onClick={() => setTf(t)} style={btnStyle(tf === t)}>{t}</button>
            ))}
            {/* "More" dropdown for extended timeframes */}
            <div ref={moreRef} style={{ position: 'relative' }}>
                <button onClick={() => setShowMore(v => !v)} style={{ ...btnStyle(isMore), display: 'flex', alignItems: 'center', gap: 2 }}>
                    {isMore ? tf : 'More'} <ChevronDown size={8} />
                </button>
                {showMore && (
                    <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', background: 'var(--bg-base-2)', border: '1px solid var(--hairline-strong)', borderRadius: 11, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 60, overflow: 'hidden', minWidth: 130 }}>
                        {TF_GROUPS.map(group => (
                            <div key={group.label}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)', padding: '6px 11px 3px', background: 'var(--chip-bg)' }}>{group.label}</div>
                                {group.tfs.filter(t => !quickKeys.includes(t)).map(t => (
                                    <button key={t} onClick={() => { setTf(t); setShowMore(false); }}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 11px', border: 'none', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: tf === t ? 'var(--accent)' : 'var(--fg-muted)', transition: 'background 0.1s' }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                        {t}
                                        {tf === t && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Chart toolbar (desktop)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Indicator Config Modal
// Each indicator has sensible defaults; user can tweak before adding to chart
// ─────────────────────────────────────────────────────────────────────────────
const INDICATOR_CONFIGS: Record<string, { label: string; fields: { key: string; label: string; type: 'number' | 'color' | 'select'; default: any; options?: string[] }[] }> = {
    'MASimple@tv-basicstudies': {
        label: 'Moving Average (MA)',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 20 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'MAExp@tv-basicstudies': {
        label: 'Exponential MA (EMA)',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 21 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'DoubleEMA@tv-basicstudies': {
        label: 'Double EMA (DEMA)',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 21 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'TripleEMA@tv-basicstudies': {
        label: 'Triple EMA (TEMA)',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 21 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'HullMA@tv-basicstudies': {
        label: 'Hull Moving Average',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 9 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#91a9b6' },
        ],
    },
    'BB@tv-basicstudies': {
        label: 'Bollinger Bands (BB)',
        fields: [
            { key: 'length', label: 'Period', type: 'number', default: 20 },
            { key: 'mult', label: 'Standard Deviations', type: 'number', default: 2 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Band Color', type: 'color', default: '#91a9b6' },
        ],
    },
    'IchimokuCloud@tv-basicstudies': {
        label: 'Ichimoku Cloud',
        fields: [
            { key: 'conversionPeriod', label: 'Conversion Period', type: 'number', default: 9 },
            { key: 'basePeriod', label: 'Base Period', type: 'number', default: 26 },
            { key: 'laggingSpan2Period', label: 'Lagging Span 2 Period', type: 'number', default: 52 },
            { key: 'displacement', label: 'Displacement', type: 'number', default: 26 },
        ],
    },
    'PSAR@tv-basicstudies': {
        label: 'Parabolic SAR',
        fields: [
            { key: 'start', label: 'Start', type: 'number', default: 0.02 },
            { key: 'increment', label: 'Increment', type: 'number', default: 0.02 },
            { key: 'maximum', label: 'Maximum', type: 'number', default: 0.2 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'SuperTrend@tv-basicstudies': {
        label: 'SuperTrend',
        fields: [
            { key: 'period', label: 'ATR Period', type: 'number', default: 10 },
            { key: 'factor', label: 'Factor', type: 'number', default: 3 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'VWAP@tv-basicstudies': {
        label: 'Volume Weighted Avg Price (VWAP)',
        fields: [
            { key: 'anchor', label: 'Anchor Period', type: 'select', default: 'Session', options: ['Session', 'Week', 'Month', 'Quarter', 'Year'] },
        ],
    },
    'RSI@tv-basicstudies': {
        label: 'Relative Strength Index (RSI)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 14 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'overbought', label: 'Overbought Level', type: 'number', default: 70 },
            { key: 'oversold', label: 'Oversold Level', type: 'number', default: 30 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'MACD@tv-basicstudies': {
        label: 'MACD',
        fields: [
            { key: 'fastLength', label: 'Fast Length', type: 'number', default: 12 },
            { key: 'slowLength', label: 'Slow Length', type: 'number', default: 26 },
            { key: 'signalLength', label: 'Signal Smoothing', type: 'number', default: 9 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'MACD Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'Stochastic@tv-basicstudies': {
        label: 'Stochastic Oscillator',
        fields: [
            { key: 'length', label: '%K Period', type: 'number', default: 14 },
            { key: 'smoothK', label: '%K Smoothing', type: 'number', default: 3 },
            { key: 'smoothD', label: '%D Smoothing', type: 'number', default: 3 },
            { key: 'overbought', label: 'Overbought', type: 'number', default: 80 },
            { key: 'oversold', label: 'Oversold', type: 'number', default: 20 },
            { key: 'color', label: '%K Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'StochasticRSI@tv-basicstudies': {
        label: 'Stochastic RSI',
        fields: [
            { key: 'lengthRSI', label: 'RSI Length', type: 'number', default: 14 },
            { key: 'lengthStoch', label: 'Stoch Length', type: 'number', default: 14 },
            { key: 'smoothK', label: '%K Smoothing', type: 'number', default: 3 },
            { key: 'smoothD', label: '%D Smoothing', type: 'number', default: 3 },
            { key: 'overbought', label: 'Overbought', type: 'number', default: 80 },
            { key: 'oversold', label: 'Oversold', type: 'number', default: 20 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: '%K Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'MOM@tv-basicstudies': {
        label: 'Momentum',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 10 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'CCI@tv-basicstudies': {
        label: 'Commodity Channel Index (CCI)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 20 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#b4d5bf' },
        ],
    },
    'WilliamsPctR@tv-basicstudies': {
        label: 'Williams %R',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 14 },
            { key: 'overbought', label: 'Overbought', type: 'number', default: -20 },
            { key: 'oversold', label: 'Oversold', type: 'number', default: -80 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'UltimateOscillator@tv-basicstudies': {
        label: 'Ultimate Oscillator',
        fields: [
            { key: 'shortCycle', label: 'Short Cycle', type: 'number', default: 7 },
            { key: 'middleCycle', label: 'Middle Cycle', type: 'number', default: 14 },
            { key: 'longCycle', label: 'Long Cycle', type: 'number', default: 28 },
        ],
    },
    'ROC@tv-basicstudies': {
        label: 'Rate of Change (ROC)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 9 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low'] },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'ATR@tv-basicstudies': {
        label: 'Average True Range (ATR)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 14 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#d3bc87' },
        ],
    },
    'ChaikinVolatility@tv-basicstudies': {
        label: 'Chaikin Volatility',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 10 },
            { key: 'rocLength', label: 'ROC Length', type: 'number', default: 10 },
        ],
    },
    'HistoricalVolatility@tv-basicstudies': {
        label: 'Historical Volatility',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 10 },
            { key: 'color', label: 'Line Color', type: 'color', default: '#91a9b6' },
        ],
    },
    'KeltnerChannels@velo': {
        label: 'Keltner Channels',
        fields: [
            { key: 'length', label: 'EMA Period', type: 'number', default: 20 },
            { key: 'mult', label: 'ATR Multiplier', type: 'number', default: 2 },
            { key: 'source', label: 'Source', type: 'select', default: 'close', options: ['close', 'open', 'high', 'low', 'hl2'] },
            { key: 'color', label: 'Channel Color', type: 'color', default: '#91a9b6' },
        ],
    },
    'DonchianChannels@velo': {
        label: 'Donchian Channels',
        fields: [
            { key: 'length', label: 'Lookback Period', type: 'number', default: 20 },
            { key: 'color', label: 'Channel Color', type: 'color', default: '#91a9b6' },
        ],
    },
    'Volume@tv-basicstudies': {
        label: 'Volume',
        fields: [
            { key: 'maLength', label: 'MA Length', type: 'number', default: 20 },
        ],
    },
    'OBV@tv-basicstudies': {
        label: 'On Balance Volume (OBV)',
        fields: [],
    },
    'CMF@tv-basicstudies': {
        label: 'Chaikin Money Flow (CMF)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 20 },
        ],
    },
    'MFI@tv-basicstudies': {
        label: 'Money Flow Index (MFI)',
        fields: [
            { key: 'length', label: 'Length', type: 'number', default: 14 },
        ],
    },
};

const IndicatorConfigModal = ({ indicatorId, onConfirm, onCancel, theme }: { indicatorId: string; onConfirm: (id: string, values: Record<string, unknown>) => void; onCancel: () => void; theme: 'light' | 'dark' }) => {
    const config = INDICATOR_CONFIGS[indicatorId];
    const [values, setValues] = useState<Record<string, any>>(() => {
        const init: Record<string, any> = {};
        const lightColors: Record<string, string> = {
            'MASimple@tv-basicstudies': '#8a6c3d',
            'MAExp@tv-basicstudies': '#52765f',
            'DoubleEMA@tv-basicstudies': '#52765f',
            'TripleEMA@tv-basicstudies': '#8a6c3d',
            'HullMA@tv-basicstudies': '#607f8c',
            'BB@tv-basicstudies': '#607f8c',
            'SuperTrend@tv-basicstudies': '#52765f',
            'PSAR@tv-basicstudies': '#8a6c3d',
            'RSI@tv-basicstudies': '#52765f',
            'MACD@tv-basicstudies': '#52765f',
            'Stochastic@tv-basicstudies': '#52765f',
            'StochasticRSI@tv-basicstudies': '#52765f',
            'MOM@tv-basicstudies': '#52765f',
            'CCI@tv-basicstudies': '#52765f',
            'WilliamsPctR@tv-basicstudies': '#8a6c3d',
            'ROC@tv-basicstudies': '#8a6c3d',
            'ATR@tv-basicstudies': '#8a6c3d',
            'HistoricalVolatility@tv-basicstudies': '#607f8c',
            'KeltnerChannels@velo': '#607f8c',
            'DonchianChannels@velo': '#607f8c',
        };
        config?.fields.forEach(f => { init[f.key] = f.key === 'color' && theme === 'light' ? lightColors[indicatorId] || f.default : f.default; });
        return init;
    });
    if (!config) return null;

    return (
        <div className="velo-modal-enter-backdrop" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)' }}>
            <div className="velo-modal-enter-card" role="dialog" aria-modal="true" aria-label={config.label} onClick={(e: any) => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, borderRadius: 18, background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(32px)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ ...S.display, fontSize: 16, color: 'var(--fg)' }}>{config.label}</div>
                        <div style={{ ...S.label, fontSize: 9, marginTop: 2 }}>Indicator Settings</div>
                    </div>
                    <button aria-label="Close indicator settings" onClick={onCancel} style={{ background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 7, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--fg-subtle)' }}>
                        <X size={12} />
                    </button>
                </div>
                {/* Fields */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {config.fields.map(field => (
                        <div key={field.key}>
                            <div style={{ ...S.label, fontSize: 9, marginBottom: 4 }}>{field.label}</div>
                            {field.type === 'number' && (
                                <input aria-label={field.label} type="number" step={Number(field.default) % 1 === 0 ? 1 : 'any'} value={values[field.key]} onChange={e => setValues(p => ({ ...p, [field.key]: e.target.value }))}
                                    style={{ width: '100%', background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', outline: 'none', ...S.mono, fontSize: 12, color: 'var(--fg)', boxSizing: 'border-box' as const }} />
                            )}
                            {field.type === 'color' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="color" value={values[field.key]} onChange={e => setValues(p => ({ ...p, [field.key]: e.target.value }))}
                                        style={{ width: 36, height: 28, borderRadius: 6, border: '1px solid var(--hairline)', cursor: 'pointer', background: 'none', padding: 2 }} />
                                    <span style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)' }}>{values[field.key]}</span>
                                </div>
                            )}
                            {field.type === 'select' && (
                                <select aria-label={field.label} value={values[field.key]} onChange={e => setValues(p => ({ ...p, [field.key]: e.target.value }))}
                                    style={{ width: '100%', background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', outline: 'none', ...S.mono, fontSize: 12, color: 'var(--fg)', boxSizing: 'border-box' as const, cursor: 'pointer' }}>
                                    {field.options?.map(o => <option key={o} value={o} style={{ background: 'var(--bg-base-2)' }}>{o}</option>)}
                                </select>
                            )}
                        </div>
                    ))}
                </div>
                {/* Footer */}
                <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 8 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: '1px solid var(--hairline-strong)', background: 'transparent', cursor: 'pointer', ...S.label, fontSize: 10, color: 'var(--fg-2)' }}>
                        Cancel
                    </button>
                    <button className="velo-button velo-button--primary" onClick={() => onConfirm(indicatorId, values)} style={{ flex: 2, padding: '8px 0', borderRadius: 9, cursor: 'pointer', ...S.label, fontSize: 10, color: 'var(--primary-fg)' }}>
                        Add to Chart
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Chart toolbar (desktop)
// ─────────────────────────────────────────────────────────────────────────────
const ChartToolbar = ({ activePair, tf, setTf, indicators, toggleIndicator, chartStyle, setChartStyle, showInd, setShowInd, indicatorQuery, setIndicatorQuery, showCandle, setShowCandle, showOverlays, setShowOverlays, overlays, toggleOverlay, indRef, candleRef, overlaysRef, onPairClick, onIndicatorConfig, isMobile }: any) => (
    <div style={{ flexShrink: 0, padding: isMobile ? '5px 10px' : '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', borderBottom: '1px solid var(--hairline)', position: 'relative', zIndex: 40, overflow: 'visible', flexWrap: isMobile ? 'wrap' as const : 'nowrap' as const, gap: isMobile ? 6 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexWrap: 'nowrap' }}>
            {/* Pair selector — desktop only (mobile has its own header) */}
            {!isMobile && (
                <button onClick={onPairClick} style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid var(--hairline-strong)', background: 'var(--chip-bg)', borderRadius: 8, padding: '4px 9px', cursor: 'pointer' }}>
                    <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)' }}>{activePair.id}</span>
                    <ChevronDown size={11} style={{ color: 'var(--fg-subtle)' }} />
                </button>
            )}
            {LEGACY_V31_RESTRICTED && <a href="https://velotrading.live/docs#contracts" target="_blank" rel="noopener noreferrer" title="Cross-margin, margin adjustments and reduce-only entry orders are paused for a contract correction. Test funds only." style={{ fontSize: 10, color: 'var(--fg-subtle)' }}>Testnet · limited release</a>}
            {/* Timeframe selector — quick buttons + "More" dropdown */}
            <TfSelector tf={tf} setTf={setTf} isMobile={isMobile} />
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 4 : 5, alignItems: 'center' }}>
            {/* Indicators dropdown */}
            <div ref={indRef} style={{ position: 'relative' }}>
                <button aria-haspopup="dialog" aria-expanded={showInd} onClick={() => { setShowInd((v: boolean) => !v); setShowCandle(false); setShowOverlays(false); }} style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '3px 7px' : '4px 9px', borderRadius: 8, border: `1px solid ${indicators.length > 0 ? 'var(--accent)' : 'var(--hairline-strong)'}`, background: indicators.length > 0 ? 'color-mix(in oklab, var(--accent) 9%, transparent)' : 'transparent', color: indicators.length > 0 ? 'var(--accent)' : 'var(--fg-subtle)', cursor: 'pointer', fontSize: isMobile ? 9 : 10, transition: 'all 0.12s' }}>
                    Indicators
                    {indicators.length > 0 && <span style={{ background: 'var(--accent)', color: 'var(--bg)', fontSize: 9, width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{indicators.length}</span>}
                </button>
                {showInd && (
                    <div className="chart-indicator-menu velo-popover" role="dialog" aria-label="Chart indicators">
                        <div className="chart-indicator-menu__header">
                            <div>
                                <strong>Indicators</strong>
                                <small>{indicators.length ? `${indicators.length} active` : 'Choose a study'}</small>
                            </div>
                            <button type="button" className="chart-indicator-menu__close" aria-label="Close indicators" onClick={() => setShowInd(false)}><X size={15} /></button>
                        </div>
                        <div className="chart-indicator-menu__search-wrap">
                            <Search size={14} aria-hidden="true" />
                            <input className="chart-indicator-menu__search" aria-label="Search indicators" autoFocus placeholder="Search indicators" value={indicatorQuery} onChange={event => setIndicatorQuery(event.target.value)} />
                        </div>
                        <div className="chart-indicator-menu__grid custom-scrollbar">
                            {(['Trend', 'Momentum', 'Volatility'] as const).map(group => {
                                const items = INDICATORS.filter((indicator: any) => indicator.group === group && indicator.label.toLowerCase().includes(indicatorQuery.trim().toLowerCase()));
                                if (!items.length) return null;
                                return <React.Fragment key={group}>
                                    <div className="chart-indicator-menu__group">{group}</div>
                                    {items.map((indicator: any) => {
                                        const isActive = indicators.some((entry: string) => entry.split('|', 1)[0] === indicator.id);
                                        return <button key={indicator.id} type="button" className="chart-indicator-menu__item" aria-pressed={isActive} title={indicator.label} onClick={() => {
                                            if (isActive) toggleIndicator(indicator.id);
                                            else onIndicatorConfig(indicator.id);
                                        }}>
                                            <span>{indicator.label}</span>
                                            {isActive ? <Check size={14} aria-label="Active" /> : <Plus size={14} aria-hidden="true" />}
                                        </button>;
                                    })}
                                </React.Fragment>;
                            })}
                            {!INDICATORS.some((indicator: any) => indicator.label.toLowerCase().includes(indicatorQuery.trim().toLowerCase())) && <div className="chart-indicator-menu__empty">No matching indicators</div>}
                        </div>
                    </div>
                )}
            </div>
            {/* Position risk levels */}
            <div ref={overlaysRef} style={{ position: 'relative' }}>
                <button onClick={() => { setShowOverlays((v: boolean) => !v); setShowInd(false); setShowCandle(false); }} aria-expanded={showOverlays} style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '3px 7px' : '4px 9px', borderRadius: 8, border: '1px solid var(--hairline-strong)', background: showOverlays ? 'var(--chip-bg)' : 'transparent', color: 'var(--fg-subtle)', cursor: 'pointer', fontSize: isMobile ? 9 : 10 }}>
                    Levels
                    <span style={{ color: 'var(--accent)' }}>{Number(overlays.entry) + Number(overlays.tp) + Number(overlays.sl) + Number(overlays.liq)}</span>
                </button>
                {showOverlays && (
                    <DropPanel>
                        <div style={{ ...S.label, fontSize: 9, padding: '8px 11px 6px', background: 'var(--chip-bg)' }}>Position levels</div>
                        {[
                            ['entry', 'Entry price'],
                            ['tp', 'Take profit'],
                            ['sl', 'Stop loss'],
                            ['liq', 'Liquidation'],
                        ].map(([key, label]) => (
                            <button key={key} role="checkbox" aria-checked={Boolean(overlays[key])} onClick={() => toggleOverlay(key)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px', border: 'none', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', ...S.sans, fontSize: 12 }}>
                                {label}
                                <span style={{ width: 16, height: 16, display: 'grid', placeItems: 'center', borderRadius: 5, border: `1px solid ${overlays[key] ? 'var(--accent)' : 'var(--hairline-strong)'}`, background: overlays[key] ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'transparent', color: 'var(--accent)', fontSize: 11, lineHeight: 1 }}>{overlays[key] ? '✓' : ''}</span>
                            </button>
                        ))}
                        <div style={{ padding: '5px 11px 9px', color: 'var(--fg-subtle)', fontFamily: 'var(--font-sans)', fontSize: 10 }}>Shown when a position is open.</div>
                    </DropPanel>
                )}
            </div>
            {/* Candle style */}
            <div ref={candleRef} style={{ position: 'relative' }}>
                <button onClick={() => { setShowCandle((v: boolean) => !v); setShowInd(false); }} style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '3px 7px' : '4px 9px', borderRadius: 8, border: '1px solid var(--hairline-strong)', background: 'transparent', color: 'var(--fg-subtle)', cursor: 'pointer', fontSize: isMobile ? 9 : 10 }}>
                    {CHART_STYLES.find((s: any) => s.code === chartStyle)?.label || 'Candles'} <ChevronDown size={9} />
                </button>
                {showCandle && (
                    <DropPanel>
                        {CHART_STYLES.map((s: any) => (
                            <button key={s.code} onClick={() => { setChartStyle(s.code); setShowCandle(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', border: 'none', background: 'transparent', ...S.mono, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: chartStyle === s.code ? 'var(--accent)' : 'var(--fg-muted)', transition: 'background 0.1s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <span style={{ fontSize: 13, width: 16, textAlign: 'center' as const }}>{s.icon}</span>
                                {s.label}
                                {chartStyle === s.code && <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
                            </button>
                        ))}
                    </DropPanel>
                )}
            </div>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Positions / Orders / History panel
// ─────────────────────────────────────────────────────────────────────────────

// Small tooltip for column headers — anchored to the trigger element via
// getBoundingClientRect so it never moves while visible, and uses a
// enter/leave delay so brief cursor wobbles don't dismiss it.
const ColTip = ({ label, tip }: { label: string; tip: string }) => {
    const [rect, setRect] = React.useState<DOMRect | null>(null);
    const triggerRef = React.useRef<HTMLSpanElement>(null);
    const showTimer  = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideTimer  = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = () => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        showTimer.current = setTimeout(() => {
            if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
        }, 60);
    };
    const hide = () => {
        if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
        hideTimer.current = setTimeout(() => setRect(null), 250);
    };

    React.useEffect(() => () => {
        if (showTimer.current) clearTimeout(showTimer.current);
        if (hideTimer.current) clearTimeout(hideTimer.current);
    }, []);

    const TOOLTIP_W = 260;
    const left = rect ? Math.min(Math.max(rect.left + rect.width / 2, TOOLTIP_W / 2 + 8), window.innerWidth - TOOLTIP_W / 2 - 8) : 0;
    const top  = rect ? rect.top - 10 : 0;

    return (
        <span ref={triggerRef}
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'help' }}
            onMouseEnter={show}
            onMouseLeave={hide} tabIndex={0} onFocus={show} onBlur={hide} onKeyDown={e => { if (e.key === 'Escape') setRect(null); }}>
            {label}
            {rect && ReactDOM.createPortal(
                <div
                    onMouseEnter={show}
                    onMouseLeave={hide}
                    style={{
                        position: 'fixed',
                        left,
                        top,
                        transform: 'translate(-50%, -100%)',
                        background: 'var(--glass-bg-strong)',
                        border: '1px solid var(--hairline-strong)',
                        borderRadius: 8, padding: '7px 11px',
                        fontFamily: 'var(--font-sans, sans-serif)', fontSize: 11, fontWeight: 400,
                        color: 'var(--fg)',
                        boxShadow: 'var(--glass-shadow)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        zIndex: 99999, pointerEvents: 'auto',
                        letterSpacing: 0,
                        maxWidth: 260,
                        whiteSpace: 'normal',
                        lineHeight: 1.5,
                        textTransform: 'none',
                        fontStyle: 'normal',
                    }}>
                    {tip}
                    <div style={{
                        position: 'absolute', top: '100%', left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0, height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderTop: '5px solid var(--glass-bg-strong)',
                    }} />
                </div>,
                document.body
            )}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Positions / Orders / History panel
// ─────────────────────────────────────────────────────────────────────────────
const TradeAuthGate = ({ onRequireAuth, title, description, compact = false }: any) => (
    <div className={`trade-auth-gate${compact ? ' trade-auth-gate--compact' : ''}`}>
        {!compact && <div className="trade-auth-gate__mark"><Lock size={18} /></div>}
        <div className="trade-auth-gate__copy">
            <strong>{title}</strong>
            <span>{description}</span>
        </div>
        <button type="button" className="velo-btn-primary trade-auth-gate__button" onClick={onRequireAuth}>
            {compact ? 'Sign in' : 'Sign in to trade'}
            {!compact && <span aria-hidden="true">↗</span>}
        </button>
        {!compact && <span className="trade-auth-gate__note">Read-only market data stays available.</span>}
    </div>
);

const PositionsPanel = ({ user, positions, openOrders, marketPrices, tab, setTab, pageState, setPageState, onRequireAuth, onClosePosition, onEditPosition, onSharePosition, onShareHistory, handleCancelOrder, isMobile, onOpenDetails, highlightHistoryId, onNavigatePair, orderlyIsReady = false, orderlyBalance = 0 }: any) => {
    const PER = 5;
    const page = (items: any[], k: string) => {
        const pg = pageState[k];
        return { items: items.slice((pg - 1) * PER, pg * PER), pages: Math.ceil(items.length / PER), pg };
    };
    const pos  = page(positions, 'POSITIONS');
    const ord  = page(openOrders, 'ORDERS');
    // History shows ALL trade events the user has taken — opens, closes,
    // liquidations. Filtering to CLOSE-only hid every new OPEN, leaving the tab
    // empty until something closed (which never happens for users still building
    // positions). The variable name is kept as `closedHistory` to minimise diff
    // size in downstream references, but it contains every row.
    const closedHistory = (user?.tradeHistory || []);
    const hist = page(closedHistory, 'HISTORY');

    const TABS = [
        { k: 'POSITIONS',   label: 'Positions',   n: positions.length },
        { k: 'OPEN ORDERS', label: 'Open Orders', n: openOrders.length },
        { k: 'HISTORY',     label: 'History',     n: closedHistory.length },
    ];

    const bump = (k: string, d: number) => setPageState((p: any) => ({ ...p, [k]: p[k] + d }));
    const Empty = ({ msg }: { msg: string }) => <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--fg-subtle)', ...S.mono, fontSize: 11 }}>· {msg}</div>;

    const Pager = ({ k, pages, pg }: { k: string, pages: number, pg: number }) => pages <= 1 ? null : (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', borderTop: '1px solid var(--hairline)' }}>
            {[['Prev', pg > 1, -1], ['Next', pg < pages, 1]].map(([lbl, en, d]) => (
                <button key={String(lbl)} disabled={!en} onClick={() => bump(k, Number(d))}
                    style={{ ...S.label, background: 'none', border: 'none', cursor: en ? 'pointer' : 'default', opacity: en ? 1 : 0.28, fontSize: 9 }}>{String(lbl)}</button>
            ))}
        </div>
    );

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'transparent' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
                <div style={{ display: 'flex', flex: 1 }}>
                    {TABS.map(({ k, label, n }) => (
                        <button key={k} onClick={() => setTab(k)} style={{ ...S.label,
                            padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                            borderBottom: `2px solid ${tab === k ? 'var(--iris-violet)' : 'transparent'}`,
                            color: tab === k ? 'var(--fg)' : 'var(--fg-subtle)',
                            fontSize: 10, transition: 'all 0.12s',
                        }}>
                            {label} <span style={{ opacity: 0.4, marginLeft: 2 }}>· {n}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Body */}
            <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: isMobile ? 'max(100px, calc(env(safe-area-inset-bottom, 0px) + 100px))' : 0 }}>

                {!user ? (
                    <div style={{ padding: isMobile ? '18px 14px' : '20px 16px' }}>
                        <TradeAuthGate
                            compact
                            onRequireAuth={onRequireAuth}
                            title="Your trading activity"
                            description="Sign in to view positions, working orders and history."
                        />
                    </div>
                ) : <>

                {/* POSITIONS */}
                {tab === 'POSITIONS' && <>
                    {/* Desktop table */}
                    <div style={{ overflowX: 'auto' }}>
                    <table className="hidden md:table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' as const, display: isMobile ? 'none' : 'table' }}>
                        <thead>
                            <tr style={{ ...S.label, fontSize: 9, position: 'sticky', top: 0, background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 2 }}>
                                {[
                                    { h: 'Pair',      tip: 'Trading pair — the asset you are long or short against USD' },
                                    { h: 'Side',      tip: 'Direction of your position: LONG profits when price rises, SHORT profits when price falls' },
                                    { h: 'Size',      tip: 'Total notional value of your position (margin × leverage)' },
                                    { h: 'Entry',     tip: 'Average price at which your position was opened' },
                                    { h: 'Mark',      tip: 'Current fair-market price used for PnL and liquidation calculations' },
                                    { h: 'Liq.',      tip: 'Liquidation price — your position is force-closed if the mark price reaches this level' },
                                    { h: 'Buffer',    tip: 'Distance between current mark price and your liquidation price, as a percentage. Lower = closer to forced close.' },
                                    { h: 'PnL (ROE)', tip: 'Unrealized profit/loss in USD · Return on equity (leverage-adjusted %)' },
                                    { h: 'TP/SL',     tip: 'Take Profit / Stop Loss prices. Click the edit icon to set or change them.' },
                                    { h: '',          tip: null },
                                ].map(({ h, tip }, i) => (
                                    <th key={i} style={{ padding: '5px 7px', fontWeight: 700 }}>
                                        {tip ? <ColTip label={h} tip={tip} /> : h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {pos.items.length === 0 ? <tr><td colSpan={10}><Empty msg="No open positions." /></td></tr>
                                : (() => {
                                    return pos.items.map((p: Position) => {
                                    const cp = marketPrices[p.pair] || p.entryPrice;
                                    const pnl = positionPnl(p, cp);
                                    const roe = (pnl / (p.size / p.leverage)) * 100;
                                    // V3 liquidation threshold is 90% of collateral lost (LIQUIDATION_THRESHOLD_BPS = 9000).
                                    // Liq price formula: entry ± (collateral * 0.9 / notional) * entry
                                    // For cross positions p.liquidationPrice may be 0 (not set by V2 path), so compute it.
                                    const collateral = p.size / p.leverage;
                                    const computedLiq = p.liquidationPrice > 0
                                        ? p.liquidationPrice
                                        : p.side === 'LONG'
                                            ? p.entryPrice * (1 - 0.9 / p.leverage)
                                            : p.entryPrice * (1 + 0.9 / p.leverage);
                                    const liqPrice = computedLiq;
                                    const buf = liqPrice > 0 ? Math.abs((cp - liqPrice) / cp) * 100 : 100;
                                    const bufClr = buf < 5 ? 'var(--pnl-down)' : buf < 10 ? '#f97316' : 'var(--pnl-up)';
                                    const bufLabel = buf < 2 ? 'EXTREME' : buf < 5 ? 'HIGH' : buf < 10 ? 'MED' : 'LOW';
                                    const pi = PAIRS.find(x => x.id === p.pair);
                                    return (
                                        <tr key={p.id}
                                            onClick={() => onOpenDetails && onOpenDetails({ kind: 'POSITION', item: p })}
                                            style={{ ...S.mono, fontSize: 11, borderTop: '1px solid var(--hairline)', transition: 'background 0.1s', cursor: 'pointer' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--chip-bg)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            <td style={{ padding: '4px 7px', fontWeight: 700 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    {pi?.logo && <VeloAssetIcon src={pi.logo} symbol={p.pair.split('/')[0]} size={18} />}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onNavigatePair && onNavigatePair(p.pair); }}
                                                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                                        title={`Switch chart to ${p.pair}`}
                                                    >
                                                        <span style={{ ...S.display, fontSize: 13, color: 'var(--fg)', textDecoration: 'underline', textDecorationColor: 'var(--hairline-strong)', textUnderlineOffset: 3 }}>{p.pair}</span>
                                                    </button>
                                                    <span style={{ ...S.chip, padding: '1px 5px', fontSize: 9, color: 'var(--fg-subtle)', fontWeight: 700 }}>{p.leverage}x</span>
                                                    <span style={{ padding: '1px 5px', borderRadius: 5, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, background: p.marginMode === 'CROSS' ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'oklch(0.78 0.18 150/0.10)', color: p.marginMode === 'CROSS' ? 'var(--iris-violet)' : 'oklch(0.78 0.18 150)', border: `1px solid ${p.marginMode === 'CROSS' ? 'color-mix(in oklab, var(--accent) 25%, transparent)' : 'oklch(0.78 0.18 150/0.25)'}` }}>{p.marginMode === 'CROSS' ? 'CROSS' : 'ISO'}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '4px 7px', fontWeight: 700, color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</td>
                                            <td style={{ padding: '4px 7px', color: 'var(--fg)' }}>${<AnimatedText text={formatMoney(p.size)}/>}</td>
                                            <td style={{ padding: '4px 7px', color: 'var(--fg)' }}>${<AnimatedText text={formatPrice(p.entryPrice)}/>}</td>
                                            <td style={{ padding: '4px 7px', color: 'var(--fg)' }}>${<AnimatedText text={formatPrice(cp)}/>}</td>
                                            <td style={{ padding: '4px 7px', fontWeight: 700, color: bufClr }}>
                                                {<AnimatedText text={liqPrice > 0 ? `$${formatPrice(liqPrice)}` : '—'}/>}
                                            </td>
                                            <td style={{ padding: '4px 7px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 72 }}>
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ color: bufClr, fontWeight: 700, fontSize: 11 }}>{<AnimatedText text={buf.toFixed(1)}/>}%</span>
                                                    <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: bufClr, textTransform: 'uppercase' as const }}>{bufLabel}</span>
                                                  </div>
                                                  <div style={{ height: 3, borderRadius: 2, background: 'var(--hairline-strong)', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${Math.min(100, buf * 5)}%`, background: bufClr, borderRadius: 2, transition: 'width 0.3s' }} />
                                                  </div>
                                                </div>
                                            </td>
                                            <td style={{ padding: '4px 7px', fontWeight: 700, color: pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>
                                                ${<AnimatedText text={formatMoney(pnl)}/>}<span style={{ opacity: 0.55, fontSize: 9 }}> ({<AnimatedText text={roe.toFixed(1)}/>}%)</span>
                                            </td>
                                            <td style={{ padding: '4px 7px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ color: 'var(--fg-subtle)', fontSize: 10 }}>
                                                      {p.takeProfit && p.takeProfit > 0
                                                        ? <span style={{ color: 'var(--pnl-up)' }}>TP ${<AnimatedText text={formatPrice(p.takeProfit)}/>}</span>
                                                        : <span>–</span>}
                                                      {' / '}
                                                      {p.stopLoss && p.stopLoss > 0.00001
                                                        ? <span style={{ color: 'var(--pnl-down)' }}>SL ${<AnimatedText text={formatPrice(p.stopLoss)}/>}</span>
                                                        : <span>–</span>}
                                                    </span>
                                                    <button onClick={(e) => { e.stopPropagation(); onEditPosition(p, 'TRIGGERS'); }} style={{ background: 'var(--chip-bg)', border: 'none', cursor: 'pointer', borderRadius: 5, padding: 2, display: 'flex', color: 'var(--fg-muted)' }} title="Set Take Profit / Stop Loss"><Edit size={10} /></button>
                                                </div>
                                            </td>
                                            <td style={{ padding: '4px 9px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                  {onSharePosition && (
                                                    <button onClick={(e) => { e.stopPropagation(); onSharePosition(p); }} title="Share position" style={{ background: 'color-mix(in oklab, var(--accent) 11%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)', cursor: 'pointer', borderRadius: 6, padding: '3px 5px', display: 'inline-flex', color: 'var(--accent-text)' }}>
                                                      <Share2 size={10} />
                                                    </button>
                                                  )}
                                                  <button onClick={(e) => { e.stopPropagation(); onEditPosition(p, 'PARTIAL'); }} title="Choose how much of this position to close" style={{ ...S.label, background: 'var(--chip-bg)', border: '1px solid var(--hairline)', cursor: 'pointer', color: 'var(--fg)', borderRadius: 5, padding: '3px 8px', fontSize: 9 }}>Close</button>
                                                  <button onClick={(e) => { e.stopPropagation(); onClosePosition(p.id); }} title="Close the entire position at market" style={{ ...S.label, background: 'rgba(255,60,60,0.12)', border: '1px solid oklch(0.66 0.22 25/0.3)', cursor: 'pointer', color: 'var(--pnl-down)', borderRadius: 5, padding: '3px 8px', fontSize: 9, fontWeight: 700 }}>Close 100%</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })})()}
                        </tbody>
                    </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden" style={{ padding: 7, display: isMobile ? 'flex' : 'none', flexDirection: 'column', gap: 6 }}>
                        {pos.items.length === 0 ? <Empty msg="No open positions." /> : pos.items.map((p: Position) => {
                            const cp = marketPrices[p.pair] || p.entryPrice;
                            const pnl = positionPnl(p, cp);
                            const roe = (pnl / (p.size / p.leverage)) * 100;
                            return (
                                <div
                                    key={p.id}
                                    onClick={() => onOpenDetails && onOpenDetails({ kind: 'POSITION', item: p })}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onOpenDetails) { e.preventDefault(); onOpenDetails({ kind: 'POSITION', item: p }); } }}
                                    style={{ ...S.panel2, padding: 11, borderRadius: 11, cursor: 'pointer', border: p.onChain ? '1px solid oklch(0.78 0.18 150 / 0.25)' : undefined }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)' }}>{p.pair}</span>
                                        </div>
                                        <span style={{ ...S.mono, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: p.side === 'LONG' ? 'rgba(62,207,142,0.12)' : 'rgba(255,60,60,0.12)', color: p.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{p.side}</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, ...S.mono, fontSize: 11, marginBottom: 7 }}>
                                        {[['Size', `$${formatMoney(p.size)}`], ['Entry', `$${formatPrice(p.entryPrice)}`], ['Mark', `$${formatPrice(cp)}`], ['PnL', `$${formatMoney(pnl)} (${roe.toFixed(1)}%)`]].map(([k, v]) => (
                                            <div key={k}><span style={{ color: 'var(--fg-subtle)' }}>{k}: </span><span style={{ fontWeight: 700, color: k === 'PnL' ? (pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg)' }}>{v}</span></div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        {!p.onChain && <button onClick={(e) => { e.stopPropagation(); onEditPosition(p, 'TRIGGERS'); }} style={{ ...S.label, flex: 1, background: 'var(--chip-bg)', border: 'none', padding: '6px 0', borderRadius: 8, cursor: 'pointer', textAlign: 'center' as const, fontSize: 9 }}>Edit TP/SL</button>}
                                        {onSharePosition && (
                                          <button onClick={(e) => { e.stopPropagation(); onSharePosition(p); }} title="Share" style={{ padding: '6px 12px', background: 'color-mix(in oklab, var(--accent) 11%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)', borderRadius: 8, cursor: 'pointer', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Share2 size={11} />
                                          </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); onEditPosition(p, 'PARTIAL'); }} style={{ ...S.label, flex: 1, padding: '6px 0', background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 8, cursor: 'pointer', color: 'var(--fg)', textAlign: 'center' as const, fontSize: 9 }}>Close</button>
                                        <button onClick={(e) => { e.stopPropagation(); onClosePosition(p.id); }} style={{ ...S.label, flex: 1, padding: '6px 0', background: 'rgba(255,60,60,0.12)', border: '1px solid oklch(0.66 0.22 25/0.3)', borderRadius: 8, cursor: 'pointer', color: 'var(--pnl-down)', textAlign: 'center' as const, fontSize: 9, fontWeight: 700 }}>Close 100%</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <Pager k="POSITIONS" pages={pos.pages} pg={pos.pg} />
                </>}

                {/* OPEN ORDERS */}
                {tab === 'OPEN ORDERS' && (
                    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {ord.items.length === 0 ? <Empty msg="No open orders." /> : ord.items.map((o: OpenOrder) => (
                            <div
                                key={o.id}
                                onClick={() => onOpenDetails && onOpenDetails({ kind: 'ORDER', item: o })}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onOpenDetails) { e.preventDefault(); onOpenDetails({ kind: 'ORDER', item: o }); } }}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 11px', ...S.panel2, borderRadius: 9, cursor: 'pointer', transition: 'background 0.12s' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--chip-bg)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-base-2)'; }}
                            >
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                        <span style={{ ...S.mono, fontWeight: 700, fontSize: 12, color: 'var(--fg)' }}>{o.pair} <span style={{ opacity: 0.38, fontSize: 10 }}>{o.leverage}x</span></span>
                                        {o.copyTraderId && <span style={{ ...S.chip, padding: '1px 6px', ...S.mono, fontSize: 9, fontWeight: 700, color: 'var(--iris-violet)', display: 'flex', alignItems: 'center', gap: 2 }}><Copy size={8} /> Copy</span>}
                                        {!o.copyTraderId && <span style={{ ...S.chip, padding: '1px 6px', ...S.mono, fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 2 }}><User size={8} /> Manual</span>}
                                    </div>
                                    <span style={{ ...S.label, fontSize: 9 }}>{(() => {
                                        // For TP/SL the order's `side` field stores the CLOSING side
                                        // (opposite of the open position). Displaying that confuses users —
                                        // they opened a LONG and see "TAKE_PROFIT SHORT". Find the related
                                        // position and show its side instead.
                                        const tp = o.type === 'TAKE_PROFIT';
                                        const sl = o.type === 'STOP_LOSS';
                                        if (tp || sl) {
                                            const related = positions.find((p: any) => p.id === o.relatedPositionId);
                                            const posSide = related?.side ?? (o.side === 'LONG' ? 'SHORT' : 'LONG');
                                            return `${tp ? 'TAKE PROFIT' : 'STOP LOSS'} · ${posSide} @ $${formatPrice(o.price)} · ${formatTime(o.timestamp)}`;
                                        }
                                        return `${o.type} ${o.side} @ $${formatPrice(o.price)} · ${formatTime(o.timestamp)}`;
                                    })()}</span>
                                </div>
                                <Button variant="danger" onClick={(e: any) => { e.stopPropagation(); handleCancelOrder(o.id); }} className="h-6 px-2 text-[9px]" disabled={!!o.copyTraderId}>Cancel</Button>
                            </div>
                        ))}
                        <Pager k="ORDERS" pages={ord.pages} pg={ord.pg} />
                    </div>
                )}

                {/* HISTORY */}
                {tab === 'HISTORY' && (
                    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {hist.items.length === 0 ? <Empty msg="No trade history." /> : hist.items.map((t: TradeHistoryItem) => {
                            const isHighlighted = highlightHistoryId === t.id;
                            return (
                                <div
                                    key={t.id}
                                    onClick={() => onOpenDetails && onOpenDetails({ kind: 'HISTORY', item: t })}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onOpenDetails) { e.preventDefault(); onOpenDetails({ kind: 'HISTORY', item: t }); } }}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '7px 11px',
                                        ...S.panel2,
                                        borderRadius: 9,
                                        cursor: 'pointer',
                                        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                        borderColor: isHighlighted ? 'var(--accent)' : 'var(--hairline)',
                                        boxShadow: isHighlighted ? '0 0 0 1px var(--accent), 0 0 16px color-mix(in oklab, var(--accent) 34%, transparent)' : 'none',
                                        animation: isHighlighted ? 'velo-pulse 1.1s ease-out 2' : undefined,
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--chip-bg)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-base-2)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                          <span style={{ ...S.display, fontSize: 14, color: 'var(--fg)' }}>{t.pair} </span>
                                          <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: t.side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)' }}>{t.side}</span>
                                          {/* Action badge — distinguishes OPEN from CLOSE at a glance.
                                              History used to be CLOSE-only so this was implicit; now
                                              that all events show, the badge prevents confusion. */}
                                          {t.action && (
                                            <span style={{
                                              ...S.mono, fontSize: 8.5, fontWeight: 700,
                                              padding: '1px 5px', borderRadius: 4,
                                              letterSpacing: '0.05em',
                                              color: t.action === 'CLOSE'
                                                ? (t.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)')
                                                : 'var(--iris-violet)',
                                              background: t.action === 'CLOSE'
                                                ? (t.pnl >= 0 ? 'oklch(0.78 0.18 150 / 0.12)' : 'oklch(0.62 0.22 25 / 0.12)')
                                                : 'color-mix(in oklab, var(--accent) 12%, transparent)',
                                              border: t.action === 'CLOSE'
                                                ? (t.pnl >= 0 ? '1px solid oklch(0.78 0.18 150 / 0.28)' : '1px solid oklch(0.62 0.22 25 / 0.28)')
                                                : '1px solid color-mix(in oklab, var(--accent) 28%, transparent)',
                                            }}>{t.action}</span>
                                          )}
                                          {t.onChain && null}
                                        </div>
                                        {/* Adapt the secondary line to the event type:
                                            – OPEN: show entry price and notional size (PnL is 0 / meaningless)
                                            – CLOSE: show PnL (the user's primary signal for a closed trade) */}
                                        {t.action === 'OPEN' ? (
                                          <span style={{ ...S.label, fontSize: 9 }}>
                                            Entry: <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>${<AnimatedText text={formatPrice(t.entryPrice)}/>}</span>
                                            <span style={{ opacity: 0.5, margin: '0 4px' }}>·</span>
                                            Size: <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>${<AnimatedText text={formatMoney(t.size)}/>}</span>
                                            {t.leverage ? <> · <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>{t.leverage}×</span></> : null}
                                          </span>
                                        ) : (
                                          <span style={{ ...S.label, fontSize: 9 }}>PnL: <span style={{ color: t.pnl >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', fontWeight: 700 }}>${<AnimatedText text={formatMoney(t.pnl)}/>}</span></span>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', ...S.mono, fontSize: 10, color: 'var(--fg-subtle)' }}>
                                        <div>{new Date(t.timestamp).toLocaleDateString()}</div>
                                        <div>{formatTime(t.timestamp)}</div>
                                        {t.onChain && t.orderlyOrderId && (
                                          <a
                                            href={orderlyOrderUrl(t.orderlyOrderId)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2, color: 'var(--pnl-up)', fontSize: 9, fontWeight: 700, textDecoration: 'none', padding: '1px 5px', borderRadius: 4, background: 'oklch(0.78 0.18 150 / 0.1)', border: '1px solid oklch(0.78 0.18 150 / 0.25)', letterSpacing: '0.04em' }}>
                                            #{t.orderlyOrderId} ↗
                                          </a>
                                        )}
                                        {t.txHash && (
                                          <a
                                            href={baseScanTxUrl(t.txHash)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2, color: 'var(--iris-violet)', fontSize: 9, fontWeight: 700, textDecoration: 'none', padding: '1px 5px', borderRadius: 4, background: 'color-mix(in oklab, var(--accent) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 25%, transparent)', letterSpacing: '0.04em' }}>
                                            Tx ↗
                                          </a>
                                        )}
                                        {/* Share button for closed positions in history. Lets users
                                            share their PnL card AFTER they've already closed, instead
                                            of auto-popping a modal. */}
                                        {onShareHistory && t.action === 'CLOSE' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onShareHistory(t); }}
                                            title="Share PnL card"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4, marginLeft: 4, color: 'var(--iris-violet)', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: 'color-mix(in oklab, var(--accent) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--accent) 25%, transparent)', cursor: 'pointer', letterSpacing: '0.04em' }}>
                                            <Share2 size={9} /> Share
                                          </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <Pager k="HISTORY" pages={hist.pages} pg={hist.pg} />
                    </div>
                )}
                </>}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Leverage Change Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────
const LeverageModal = ({ leverageModal, positions, activePair, currentPrice, user, onConfirm, onClose, formatPrice, formatMoney, orderlyIsReady = false, orderlyBalance = 0 }: {
    leverageModal: { needed: number; shortfall: number; currentLeverage: number; targetLeverage: number; direction: 'up' | 'down'; marginFreed?: number };
    positions: any[];
    activePair: any;
    currentPrice: number;
    user: any;
    onConfirm: (targetLeverage: number) => void;
    onClose: () => void;
    formatPrice: (v: number) => string;
    formatMoney: (v: number) => string;
    orderlyIsReady?: boolean;
    orderlyBalance?: number;
}) => {
    const isUp = leverageModal.direction === 'up';
    const isBlocked = leverageModal.shortfall > 0;
    const ex = positions.find((p: Position) => p.pair === activePair.id && !p.isCopyTrade);

    const mm = 0.005;
    const newLiqPreview = ex
        ? (ex.side === 'LONG'
            ? ex.entryPrice * (1 - 1 / leverageModal.targetLeverage + mm)
            : ex.entryPrice * (1 + 1 / leverageModal.targetLeverage - mm))
        : 0;
    const currentLiqDist = ex ? Math.abs((currentPrice - ex.liquidationPrice) / currentPrice) * 100 : 0;
    const newLiqDist = newLiqPreview > 0 ? Math.abs((currentPrice - newLiqPreview) / currentPrice) * 100 : 0;

    const accentColor = isBlocked ? 'var(--pnl-down)' : isUp ? '#f97316' : 'var(--iris-violet)';
    const accentBg = isBlocked ? 'rgba(239,68,68,0.10)' : isUp ? 'rgba(249,115,22,0.10)' : 'color-mix(in oklab, var(--accent) 10%, transparent)';
    const accentBorder = isBlocked ? 'rgba(239,68,68,0.30)' : isUp ? 'rgba(249,115,22,0.30)' : 'color-mix(in oklab, var(--accent) 30%, transparent)';
    const textPrimary = 'var(--fg)';
    const textMuted = 'var(--fg-muted)';
    const borderRow = '1px solid var(--hairline-strong)';

    const rows: [string, string, string][] = [
        ['Leverage change', `${leverageModal.currentLeverage}x → ${leverageModal.targetLeverage}x`, textPrimary],
        ...(isBlocked ? [
            ['Required extra margin', `$${leverageModal.needed.toFixed(2)}`, textPrimary],
            ['Your free balance',     `$${formatMoney(orderlyIsReady ? orderlyBalance : (user ? Math.max(0, user.balance) : 0))}`, textPrimary],
            ['Shortfall',            `$${leverageModal.shortfall.toFixed(2)}`, 'var(--pnl-down)'],
        ] as [string, string, string][] : isUp ? [
            ['Margin freed',          `$${((leverageModal.marginFreed ?? 0) > 0 ? leverageModal.marginFreed! : 0).toFixed(2)}`, 'var(--pnl-up)'],
            ['Current liq. distance', `${currentLiqDist.toFixed(1)}%`, textPrimary],
            ['New liq. distance',     `${newLiqDist.toFixed(1)}%`, newLiqDist < 5 ? 'var(--pnl-down)' : newLiqDist < 10 ? '#f97316' : 'var(--pnl-up)'],
            ['New liq. price',        `$${formatPrice(newLiqPreview)}`, '#f97316'],
        ] as [string, string, string][] : [
            ['Extra margin locked',   `$${leverageModal.needed.toFixed(2)}`, textPrimary],
            ['Current liq. distance', `${currentLiqDist.toFixed(1)}%`, textPrimary],
            ['New liq. distance',     `${newLiqDist.toFixed(1)}%`, newLiqDist < 5 ? 'var(--pnl-down)' : newLiqDist < 10 ? '#f97316' : 'var(--pnl-up)'],
            ['New liq. price',        `$${formatPrice(newLiqPreview)}`, 'var(--iris-violet)'],
        ] as [string, string, string][]),
    ];

    return (
        <div className="velo-modal-enter-backdrop" onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}>
            <div className="velo-modal-enter-card" onClick={(e: any) => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 340, borderRadius: 20, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: borderRow, boxShadow: '0 24px 64px rgba(0,0,0,0.45)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '16px 16px 12px', borderBottom: borderRow, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', background: 'transparent' }}>
                    <div>
                        <div style={{ ...S.display, fontSize: 17, color: textPrimary }}>
                            {isBlocked ? 'Cannot Reduce Leverage' : isUp ? 'Increase Leverage?' : 'Reduce Leverage?'}
                        </div>
                        <div style={{ ...S.label, fontSize: 9, marginTop: 3, color: accentColor }}>
                            {isBlocked ? 'Insufficient Free Balance' : isUp ? 'Higher Risk · More Volatile' : 'Margin Required'}
                        </div>
                    </div>
                    <button onClick={onClose}
                        style={{ background: 'var(--chip-bg)', border: borderRow, borderRadius: 7, width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: textMuted }}>
                        <X size={12} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'transparent' }}>
                    {/* Warning banner */}
                    <div style={{ background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 10, padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ ...S.label, fontSize: 9, color: accentColor }}>
                            {isBlocked ? 'What happened' : isUp ? 'Risk warning' : 'What changes'}
                        </div>
                        <div style={{ ...S.mono, fontSize: 12, color: textPrimary, lineHeight: 1.6 }}>
                            {isBlocked && (
                                <>Reducing leverage from <span style={{ color: 'var(--pnl-up)', fontWeight: 700 }}>{leverageModal.currentLeverage}x</span> to <span style={{ color: 'var(--pnl-down)', fontWeight: 700 }}>{leverageModal.targetLeverage}x</span> requires locking extra margin. You don't have enough free balance.</>
                            )}
                            {!isBlocked && isUp && (
                                <>Increasing from <span style={{ color: 'var(--pnl-up)', fontWeight: 700 }}>{leverageModal.currentLeverage}x</span> to <span style={{ color: '#f97316', fontWeight: 700 }}>{leverageModal.targetLeverage}x</span> moves your liquidation price significantly closer to the current mark price. Your margin risk increases.</>
                            )}
                            {!isBlocked && !isUp && (
                                <>Reducing from <span style={{ color: '#f97316', fontWeight: 700 }}>{leverageModal.currentLeverage}x</span> to <span style={{ color: 'var(--iris-violet)', fontWeight: 700 }}>{leverageModal.targetLeverage}x</span> will lock <span style={{ fontWeight: 700 }}>${<AnimatedText text={leverageModal.needed.toFixed(2)}/>}</span> of additional margin from your free balance.</>
                            )}
                        </div>
                    </div>

                    {/* Stats table */}
                    <div style={{ borderRadius: 10, overflow: 'hidden', border: borderRow }}>
                        {rows.map(([label, val, valColor], i) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: i % 2 === 0 ? 'var(--chip-bg)' : 'transparent', borderBottom: i < rows.length - 1 ? borderRow : 'none' }}>
                                <span style={{ ...S.label, fontSize: 9, color: textMuted }}>{label}</span>
                                <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: valColor }}>{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Summary line */}
                    {!isBlocked && (
                        <div style={{ ...S.mono, fontSize: 11, color: textMuted, lineHeight: 1.55, padding: '2px 0' }}>
                            {isUp
                                ? <>At <span style={{ color: '#f97316', fontWeight: 700 }}>{leverageModal.targetLeverage}x</span>, your position liquidates if price moves <span style={{ color: textPrimary, fontWeight: 700 }}>{<AnimatedText text={newLiqDist.toFixed(1)}/>}%</span> against you.</>
                                : <>Free balance decreases by <span style={{ color: textPrimary, fontWeight: 700 }}>${<AnimatedText text={leverageModal.needed.toFixed(2)}/>}</span>. Liquidation distance increases — lower risk.</>
                            }
                        </div>
                    )}
                    {isBlocked && (
                        <div style={{ ...S.mono, fontSize: 11, color: textMuted, lineHeight: 1.55, padding: '2px 0' }}>
                            Deposit <span style={{ color: textPrimary, fontWeight: 700 }}>${<AnimatedText text={leverageModal.shortfall.toFixed(2)}/>}</span> or more to reduce leverage to {leverageModal.targetLeverage}x.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 16px 16px', borderTop: borderRow, display: 'flex', gap: 8, background: 'transparent' }}>
                    <button onClick={onClose}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: borderRow, background: 'var(--chip-bg)', color: 'var(--fg)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
                        Keep {leverageModal.currentLeverage}x
                    </button>
                    {isBlocked ? (
                        <button onClick={onClose}
                            style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: 'var(--iris-violet)', color: '#ffffff', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
                            Deposit Funds
                        </button>
                    ) : (
                        <button onClick={() => onConfirm(leverageModal.targetLeverage)}
                            style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: isUp ? '#f97316' : 'var(--iris-violet)', color: '#ffffff', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
                            Confirm {leverageModal.targetLeverage}x
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main TradeView
// ─────────────────────────────────────────────────────────────────────────────
export const TradeView = ({
    tradingPending = false,
    activePair, setActivePair, marketPrices, marketChanges = {}, candles, chartHistoryStatus = 'loading', onRetryChartHistory, onLoadOlderHistory, user, positions, onOpenPosition, onClosePosition, onRequireAuth, onEditPosition, onSharePosition, onShareHistory, openOrders, handleCancelOrder, onTimeframeChange, appTheme,
    savedChartPrefs, onChartPrefsChange, tradeFocus, autoOpenHistoryId,
    orderlyBalance = 0, orderlyIsReady = false,
    // V3 cross-margin account (optional — pass from App.tsx)
    onOpenCrossAccount,                  // (tab?: 'DEPOSIT'|'WITHDRAW') => void
    crossFreeBalance = 0,
    crossTotalBalance = 0,
    // ── Environment split ─────────────────────────────────────────────────────
    // isLiveMode = true  → user connected with crypto wallet → Orderly live trading
    // isLiveMode = false → demo/email user → full pair list, simulated P&L
    isLiveMode = false,
    // Real on-chain positions from Orderly (only populated when isLiveMode=true)
    orderlyPositions = [] as OrderlyPosition[],
}: any) => {

    // Form state
    const [side, setSide]             = useState<'LONG' | 'SHORT'>('LONG');
    const [leverage, setLeverage]     = useState(10);
    const [leverageModal, setLeverageModal] = useState<{ needed: number; shortfall: number; currentLeverage: number; targetLeverage: number; direction: 'up' | 'down'; marginFreed?: number } | null>(null);
    const [sizeSlider, setSizeSlider] = useState(10);
    const [sizeAmount, setSizeAmount] = useState('0');
    const [orderType, setOrderType]   = useState<OrderType>('MARKET');
    const [marginMode, setMarginMode] = useState<MarginMode>('ISOLATED');
    const [limitPrice, setLimitPrice] = useState('');
    const [takeProfit, setTakeProfit] = useState('');
    const [stopLoss, setStopLoss]     = useState('');
    const risk = useReadContract({ address:VELO_PERPS_V4_ADDRESS, abi:VELO_PERPS_V4_ABI, functionName:'marketRisk',
        args:[PAIR_INDEX[activePair.id.replace('/', '-') as VeloPairLabel]],
        chainId:84532, query:{enabled:IS_V4,refetchInterval:30000} });
    const maxLeverage = IS_V4 ? Number(risk.data?.[3] || 1) : 25;
    useEffect(() => {
        if (!IS_V4) return;
        setLeverage(value => Math.min(value, maxLeverage));
        setMarginMode('ISOLATED');
    }, [maxLeverage, activePair.id, leverage]);

    // UI state
    const [pairOpen, setPairOpen]     = useState(false);
    const [tab, setTab]               = useState<'POSITIONS' | 'OPEN ORDERS' | 'HISTORY'>('POSITIONS');
    const [pageState, setPageState]   = useState({ POSITIONS: 1, ORDERS: 1, HISTORY: 1 });
    const [toast, setToast]           = useState<{ message: string; type: string } | null>(null);

    // Order details modal — opens when a row is clicked in any of the three tabs
    const [detailsItem, setDetailsItem] = useState<DetailsPayload | null>(null);

    // Brief row highlight when arriving from a notification click
    const [highlightHistoryId, setHighlightHistoryId] = useState<string | null>(null);

    // React to notification-driven focus: switch tab, paginate to the row, flash it.
    useEffect(() => {
        if (!tradeFocus) return;
        if (tradeFocus.tab) setTab(tradeFocus.tab);
        if (tradeFocus.tab === 'HISTORY' && tradeFocus.highlightId && user?.tradeHistory) {
            const idx = user.tradeHistory.findIndex((t: TradeHistoryItem) => t.id === tradeFocus.highlightId);
            if (idx >= 0) {
                const PER = 5;
                const pageNum = Math.floor(idx / PER) + 1;
                setPageState((p: any) => ({ ...p, HISTORY: pageNum }));
            }
            setHighlightHistoryId(tradeFocus.highlightId);
            const timer = setTimeout(() => setHighlightHistoryId(null), 2200);
            return () => clearTimeout(timer);
        }
    }, [tradeFocus?.key]);

    // Auto-open OrderDetailsModal when arriving from a notification (POSITION_CLOSED etc.)
    useEffect(() => {
        if (!autoOpenHistoryId || !user?.tradeHistory) return;
        const item = user.tradeHistory.find((t: TradeHistoryItem) => t.id === autoOpenHistoryId);
        if (item) {
            setTab('HISTORY');
            setDetailsItem({ kind: 'HISTORY', item });
        }
    }, [autoOpenHistoryId]);

    // Chart controls
    const [tf, setTf]                 = useState(savedChartPrefs?.chartTf || '15m');
    const [chartStyle, setChartStyle] = useState<ChartStyleCode>(savedChartPrefs?.chartStyle || '1');
    const [indicators, setIndicators] = useState<string[]>(savedChartPrefs?.indicators || []);
    const [indicatorQuery, setIndicatorQuery] = useState('');
    const [overlays, setOverlays] = useState(savedChartPrefs?.overlays || { entry: true, tp: true, sl: true, liq: true, openPos: true, funding: false });
    const [showInd, setShowInd]           = useState(false);
    const [showCandle, setShowCandle]     = useState(false);
    const [showOverlays, setShowOverlays] = useState(false);
    const [indConfigId, setIndConfigId]   = useState<string | null>(null);
    const indRef      = useRef<HTMLDivElement>(null);
    const candleRef   = useRef<HTMLDivElement>(null);
    const overlaysRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile]         = useState(false);

    useEffect(() => {
        if (savedChartPrefs?.chartTf) setTf(savedChartPrefs.chartTf);
    }, [savedChartPrefs?.chartTf]);

    useEffect(() => {
        if (savedChartPrefs?.chartStyle) setChartStyle(savedChartPrefs.chartStyle);
    }, [savedChartPrefs?.chartStyle]);

    useEffect(() => {
        if (savedChartPrefs?.indicators) setIndicators(savedChartPrefs.indicators);
    }, [savedChartPrefs?.indicators]);

    useEffect(() => {
        if (savedChartPrefs?.overlays) setOverlays(savedChartPrefs.overlays);
    }, [savedChartPrefs?.overlays]);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check(); window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (indRef.current && !indRef.current.contains(e.target as Node)) setShowInd(false);
            if (candleRef.current && !candleRef.current.contains(e.target as Node)) setShowCandle(false);
            if (overlaysRef.current && !overlaysRef.current.contains(e.target as Node)) setShowOverlays(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowInd(false);
                setShowCandle(false);
                setShowOverlays(false);
            }
        };
        document.addEventListener('mousedown', h);
        document.addEventListener('keydown', onKeyDown);
        return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', onKeyDown); };
    }, []);

    useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

    // ── Sync leverage / side / marginMode from the live position ────────────────
    // Rules:
    //  1. On mount or pair switch → always sync everything from the position (if any)
    //  2. When positions update on the SAME pair → sync leverage only (position may
    //     have just changed via executeLeverageUpdate or a fill); leave side alone
    //     so the user can freely toggle LONG↔SHORT while a position is open.
    //  3. No position on this pair → reset leverage to 10 only on pair switch.
    const prevPairRef    = useRef<string | null>(null);
    const prevLeverageRef = useRef<number>(10); // tracks last confirmed position leverage

    // ─── Merge Orderly on-chain positions with local simulated positions ───────
    // MUST be declared BEFORE the useEffect below that depends on it — otherwise
    // production bundlers minify into a TDZ crash ("Cannot access X before
    // initialization") on first render.
    const mergedPositions: Position[] = useMemo(() => {
        if (!isLiveMode) return positions;

        // Phase 3+: VeloPerps positions are written into `positions` by the
        // App-level sync effect with ids prefixed `velo_<tradeId>`. They are
        // the SINGLE source of truth for on-chain trades. Local optimistic
        // entries (no velo_ prefix, no onChain flag) for the same pairs would
        // produce ghost cards and must be filtered out.
        const veloPositions = (positions as Position[]).filter(
            p => p.id.startsWith('velo_')
        );
        const veloPairs = new Set(veloPositions.map(p => p.pair));

        // Legacy Orderly positions (from the inert orderly hook — should always
        // be empty post-migration). Kept defensively in case the stub ever
        // surfaces something.
        const symbolToPair: Record<string, string> = {};
        Object.entries(ORDERLY_SYMBOL_MAP).forEach(([pairId, sym]) => { symbolToPair[sym] = pairId; });
        const orderlyOnChain: Position[] = orderlyPositions
            .filter((op: OrderlyPosition) => Math.abs(op.positionQty) > 0)
            .map((op: OrderlyPosition): Position | null => {
                const pairId = symbolToPair[op.symbol];
                if (!pairId || veloPairs.has(pairId)) return null;
                const qty     = op.positionQty;
                const side    = qty > 0 ? 'LONG' : 'SHORT';
                const sizeUSD = Math.abs(qty) * op.averageOpenPrice;
                const lev     = op.costPosition > 0 ? Math.round(sizeUSD / op.costPosition) : 1;
                return {
                    id: `orderly_${op.symbol}`,
                    pair: pairId, side, entryPrice: op.averageOpenPrice,
                    size: sizeUSD, leverage: Math.max(1, lev),
                    marginMode: 'ISOLATED', liquidationPrice: op.estLiqPrice ?? 0,
                    timestamp: Date.now(), pnl: op.unsettledPnl, onChain: true,
                } as any;
            })
            .filter(Boolean) as Position[];

        // Local non-onchain entries — drop any whose pair has a Velo position
        // (would render a duplicate card) but keep demo-only positions for
        // pairs not yet on the contract.
        const localKept = (positions as Position[]).filter(
            p => !p.id.startsWith('velo_') && !veloPairs.has(p.pair)
        );
        return [...veloPositions, ...orderlyOnChain, ...localKept];
    }, [positions, orderlyPositions, isLiveMode]);

    useEffect(() => {
        const pairChanged = prevPairRef.current !== activePair.id;
        const ex = mergedPositions.find((p: Position) => p.pair === activePair.id && !p.isCopyTrade);

        if (ex) {
            // Sync leverage whenever the position's leverage differs from what we last knew
            // (covers: initial load, leverage update confirmed, pair switch)
            if (ex.leverage !== prevLeverageRef.current || pairChanged) {
                setLeverage(ex.leverage);
                prevLeverageRef.current = ex.leverage;
            }
            if (pairChanged) {
                setSide(ex.side);
                setMarginMode(ex.marginMode || 'ISOLATED');
            }
        } else if (pairChanged) {
            // Switched to a pair with no position — reset to defaults
            setLeverage(10);
            prevLeverageRef.current = 10;
        }

        prevPairRef.current = activePair.id;
    }, [mergedPositions, activePair.id]);

    const toggleIndicator = (id: string, values?: Record<string, unknown>) => setIndicators(previous => {
        const isActive = previous.some(entry => entry.split('|', 1)[0] === id);
        const next = isActive
            ? previous.filter(entry => entry.split('|', 1)[0] !== id)
            : [...previous, values ? `${id}|${JSON.stringify(values)}` : id];
        onChartPrefsChange?.({ indicators: next });
        return next;
    });
    const toggleOverlay = (key: string) => setOverlays(previous => {
        const next = { ...previous, [key]: !previous[key] };
        onChartPrefsChange?.({ overlays: next });
        return next;
    });
    const handleTfChange  = (t: string) => { setTf(t); onTimeframeChange?.(t); };
    const onIndicatorConfig = (id: string) => { setIndConfigId(id); setShowInd(false); };
    const onIndicatorConfirm = (id: string, values: Record<string, unknown>) => {
        const safeValues = Object.fromEntries(Object.entries(values).map(([key, value]) => {
            if (key === 'color') return [key, /^#[\da-f]{6}$/i.test(String(value)) ? String(value) : undefined];
            if (key === 'source') return [key, ['close', 'open', 'high', 'low', 'hl2', 'hlc3'].includes(String(value)) ? String(value) : undefined];
            if (key === 'anchor') return [key, ['Session', 'Week', 'Month', 'Quarter', 'Year'].includes(String(value)) ? String(value) : undefined];
            const number = Number(value);
            if (!Number.isFinite(number)) return [key, undefined];
            if (id === 'PSAR@tv-basicstudies' && ['start', 'increment', 'maximum'].includes(key)) return [key, Math.min(1, Math.max(0.001, number))];
            if (id === 'WilliamsPctR@tv-basicstudies' && ['overbought', 'oversold'].includes(key)) return [key, Math.min(0, Math.max(-100, number))];
            if (key === 'mult' || key === 'factor') return [key, Math.min(10, Math.max(0.1, number))];
            if (['overbought', 'oversold'].includes(key)) return [key, Math.min(100, Math.max(0, number))];
            return [key, Math.min(500, Math.max(1, Math.round(number)))];
        }).filter(([, value]) => value !== undefined));
        if (id === 'PSAR@tv-basicstudies') {
            safeValues.increment = Math.min(Number(safeValues.maximum) || 0.2, Number(safeValues.increment) || 0.02);
            safeValues.maximum = Math.max(Number(safeValues.start) || 0.02, Number(safeValues.maximum) || 0.2);
        }
        if (id === 'MACD@tv-basicstudies') {
            safeValues.fastLength = Math.min(499, Number(safeValues.fastLength) || 12);
            safeValues.slowLength = Math.min(500, Math.max(Number(safeValues.fastLength) + 1, Number(safeValues.slowLength) || 26));
        }
        setIndicators(previous => {
            const next = [...previous.filter(entry => entry.split('|', 1)[0] !== id), `${id}|${JSON.stringify(safeValues)}`];
            onChartPrefsChange?.({ indicators: next });
            return next;
        });
        setIndConfigId(null);
    };

    // Derived
    const currentPrice   = marketPrices[activePair.id] || activePair.basePrice;

    // Overlays always track the user's OWN position on the active pair.
    // Copy-trade positions are excluded so entry/TP/SL badges are never ambiguous.
    const activePosition =
        mergedPositions.find((p: Position) => p.pair === activePair.id && !p.isCopyTrade)
        || mergedPositions.find((p: Position) => p.pair === activePair.id)
        || null;

    const crossPnl = (mergedPositions || [])
        .filter((p: Position) => p?.marginMode === 'CROSS' && !p.isCopyTrade)
        .reduce((acc: number, p: Position) => {
            const cp = marketPrices?.[p.pair] || p.entryPrice;
            return acc + positionPnl(p, cp);
        }, 0);

    // Locked margin already committed to cross positions — part of the shared pool
    const crossLockedMargin = (mergedPositions || [])
        .filter((p: Position) => p?.marginMode === 'CROSS' && !p.isCopyTrade)
        .reduce((acc: number, p: Position) => acc + (p.size / p.leverage), 0);

    // Buying power:
    //   ISOLATED — only free cash (locked margins are per-position, not in the pool)
    // When Orderly is active the real free margin lives on-chain — use that.
    // Fall back to local sim balance if wallet is not connected/funded.
    const effectiveBalance    = orderlyIsReady ? orderlyBalance : (user ? user.balance : 0);
    const isolatedBuyingPower = Math.max(0, effectiveBalance);
    const crossBuyingPower    = Math.max(0, effectiveBalance + crossPnl);
    const buyingPower = marginMode === 'CROSS' ? crossBuyingPower : isolatedBuyingPower;

    const mm = IS_V4 ? Number(risk.data?.[4] || 50) / 10000 + 0.001 : 0.005, cpn = parseFloat(String(currentPrice));
    let estLiqPrice = 0;
    const sz = parseFloat(sizeAmount);
    if (marginMode === 'ISOLATED') {
        // Isolated: each position has its own margin, liq depends only on that margin
        estLiqPrice = sz > 0
            ? (side === 'LONG' ? cpn * (1 - 1 / leverage + mm) : cpn * (1 + 1 / leverage - mm))
            : 0;
    } else {
        // Cross: the entire free balance + cross PnL backs the position pool.
        // Available cross margin pool = free balance + existing cross PnL.
        // Effective margin for THIS new position = sz / leverage.
        // Liq happens when pool is exhausted across all cross positions.
        // Simplified: liq distance = crossBuyingPower / sz (ratio of pool to position notional)
        if (sz > 0 && crossBuyingPower > 0) {
            const poolRatio = crossBuyingPower / sz;
            estLiqPrice = side === 'LONG'
                ? cpn * (1 - poolRatio + mm)
                : cpn * (1 + poolRatio - mm);
        }
    }
    const dist      = estLiqPrice > 0 ? Math.abs((cpn - estLiqPrice) / cpn) * 100 : 100;
    const riskLevel = dist < 1 ? 'EXTREME' : dist < 5 ? 'HIGH' : dist < 10 ? 'MEDIUM' : 'LOW';
    const riskColor = dist < 1 ? '#dc2626' : dist < 5 ? 'var(--pnl-down)' : dist < 10 ? '#f97316' : 'var(--pnl-up)';

    useEffect(() => {
        if (user) setSizeAmount(((buyingPower * (sizeSlider / 100)) * leverage).toFixed(2));
    }, [sizeSlider, leverage, user, buyingPower]);

    // Sync marginMode to the existing position's marginMode when the pair or positions change.
    // This prevents the UI from defaulting back to ISOLATED on refresh when the user has a CROSS position.
    useEffect(() => {
        const existingPos = (positions || []).find((p: Position) => p?.pair === activePair.id && !p.isCopyTrade);
        if (IS_V4) setMarginMode('ISOLATED');
        else if (existingPos?.marginMode) {
            setMarginMode(existingPos.marginMode);
        }
    }, [mergedPositions, activePair.id]);

    const hasExistPos = (mergedPositions || []).some((p: Position) => p?.pair === activePair.id && !p.isCopyTrade);
    const cost        = parseFloat(sizeAmount) / leverage || 0;

    const handleSubmit = () => {
        if (!user) return onRequireAuth();
        if (tradingPending) return;
        if (IS_V4 && (!risk.data || risk.isError)) { setToast({ message:'Market risk limits are unavailable. Please retry.',type:'ERROR' }); return; }
        if (IS_V4 && (leverage > maxLeverage || Number(sizeAmount) > Number(risk.data![0]) / 1e6)) {
            setToast({ message:'Order exceeds this market’s leverage or position-size limit.',type:'ERROR' }); return;
        }
        const price = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice);
        const error = validateTradeForm({ price, size: Number(sizeAmount), side, takeProfit, stopLoss });
        if (error) { setToast({ message: error, type: 'ERROR' }); return; }

        // Validate TP/SL: must be valid numbers on correct side
        const tpVal = takeProfit ? parseFloat(takeProfit) : NaN;
        const slVal = stopLoss ? parseFloat(stopLoss) : NaN;

        onOpenPosition(activePair.id, side, parseFloat(sizeAmount), leverage, orderType, price, isNaN(tpVal) ? undefined : tpVal, isNaN(slVal) ? undefined : slVal, marginMode);
    };

    const panelProps = { user, positions: mergedPositions, openOrders, marketPrices, tab, setTab, pageState, setPageState, onRequireAuth, onClosePosition, onEditPosition, onSharePosition, onShareHistory, handleCancelOrder, isMobile, onOpenDetails: setDetailsItem, highlightHistoryId, onNavigatePair: (pairId: string) => { const pair = PAIRS.find(pr => pr.id === pairId); if (pair) setActivePair(pair); }, orderlyIsReady, orderlyBalance };

    // ── Render ────────────────────────────────────────────────────────────────
    const activePairChange = marketChanges[activePair.id];
    const changeColor = activePairChange !== undefined ? (activePairChange >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--fg-subtle)';
    const changeLabel = activePairChange !== undefined ? `${activePairChange >= 0 ? '+' : ''}${activePairChange.toFixed(2)}%` : '+0.01%';
    const isActivePairDemo = !isLiveMode && !ORDERLY_SYMBOL_MAP[activePair.id];
    const isActivePairLiveCapable = !isLiveMode && !!ORDERLY_SYMBOL_MAP[activePair.id];
    const marketFeed = (
        <div className="velo-trade-feed" style={{ display: 'flex', flexDirection: 'column', borderRadius: isMobile ? 16 : 18, background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--hairline)', boxShadow: 'var(--glass-shadow)', overflow: 'hidden' }}>
            {!isMobile && <div style={{ flexShrink: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline)' }}>
                <button onClick={() => setPairOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ ...S.display, fontSize: 16, color: 'var(--fg)' }}>{activePair.id}</span>
                            <ChevronDown size={12} style={{ color: 'var(--fg-subtle)' }} />
                            {isActivePairDemo && <span style={{ ...S.label, fontSize: 8, color: 'var(--iris-violet)' }}>DEMO</span>}
                        </div>
                        <div style={{ ...S.label, marginTop: 2, color: 'var(--fg-subtle)' }}>Perpetual</div>
                    </div>
                </button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.display, fontSize: 18, color: 'var(--fg)' }}>${<AnimatedText text={formatPrice(currentPrice)}/>}</div>
                    <div style={{ ...S.label, marginTop: 2, color: changeColor }}>{changeLabel}</div>
                </div>
            </div>}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <OrderBook price={currentPrice} pair={activePair.id} rows={isMobile ? 8 : 10} openOrders={openOrders} />
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', background: 'transparent' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 'calc(100dvh - 84px)', background: 'transparent', overflow: isMobile ? 'visible' : 'hidden', gap: isMobile ? 0 : 10, padding: isMobile ? 0 : '0 10px 10px' }}>
            <PairSelector isOpen={pairOpen} onClose={() => setPairOpen(false)} onSelect={setActivePair} marketPrices={marketPrices} marketChanges={marketChanges} isLiveMode={isLiveMode} />

            {/* Order Details Modal — clicked from History row */}
            <OrderDetailsModal
                payload={detailsItem}
                onClose={() => setDetailsItem(null)}
                marketPrices={marketPrices}
                onClosePosition={onClosePosition}
                onEditPosition={onEditPosition}
                handleCancelOrder={handleCancelOrder}
                onShareHistory={onShareHistory}
                onSharePosition={onSharePosition}
            />

            {/* Indicator Config Modal */}
            {indConfigId && (
                <IndicatorConfigModal
                    indicatorId={indConfigId}
                    theme={appTheme || 'dark'}
                    onConfirm={onIndicatorConfirm}
                    onCancel={() => setIndConfigId(null)}
                />
            )}

            {/* Toast */}
            {toast && (
                <div style={{ ...S.label, position: 'fixed', bottom: isMobile ? 96 : 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 10, background: toast.type === 'ERROR' ? 'var(--pnl-down)' : 'var(--pnl-up)', color: '#fff', fontSize: 11, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>
                    {toast.message}
                    <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7, display: 'flex', padding: 0 }}><X size={11} /></button>
                </div>
            )}

            {/* Mobile pair header */}
            <div style={{ padding: '10px 14px', background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid var(--hairline)', display: isMobile ? 'flex' : 'none', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => setPairOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span style={{ ...S.display, fontSize: 18, color: 'var(--fg)' }}>{activePair.id}</span>
                    <ChevronDown size={12} style={{ color: 'var(--fg-subtle)' }} />
                </button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.display, fontSize: 18, color: 'var(--fg)' }}>${<AnimatedText text={formatPrice(currentPrice)}/>}</div>
                    <div style={{ ...S.label, fontSize: 9, color: changeColor }}>{changeLabel}</div>
                </div>
            </div>

            {/* ── Left: chart + positions ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: isMobile ? 'auto' : '100%', overflow: isMobile ? 'visible' : 'hidden', borderRadius: isMobile ? 0 : 18, background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: isMobile ? 'none' : '1px solid var(--hairline)', boxShadow: isMobile ? 'none' : 'var(--glass-shadow)' }}>
                <ChartToolbar
                    activePair={activePair} tf={tf} setTf={handleTfChange}
                    indicators={indicators} toggleIndicator={toggleIndicator}
                    chartStyle={chartStyle} setChartStyle={(s: any) => { setChartStyle(s); onChartPrefsChange?.({ chartStyle: s }); }}
                    showInd={showInd} setShowInd={setShowInd}
                    indicatorQuery={indicatorQuery} setIndicatorQuery={setIndicatorQuery}
                    showCandle={showCandle} setShowCandle={setShowCandle}
                    showOverlays={showOverlays} setShowOverlays={setShowOverlays}
                    overlays={overlays} toggleOverlay={toggleOverlay}
                    indRef={indRef} candleRef={candleRef}
                    overlaysRef={overlaysRef}
                    onPairClick={() => setPairOpen(true)}
                    onIndicatorConfig={onIndicatorConfig}
                    isMobile={isMobile}
                />

                {/* Chart — on mobile use a fixed tall height so it fills the screen properly */}
                <div style={{ flex: isMobile ? 'none' : 1, height: isMobile ? '60vw' : undefined, minHeight: isMobile ? 280 : 0, maxHeight: isMobile ? 420 : undefined, overflow: 'hidden', background: 'transparent', borderBottom: '1px solid var(--hairline)', position: 'relative' }}>
                    <TradingViewChart
                        initialData={candles[`${activePair.id}::${tf}`] ?? EMPTY_CHART_CANDLES}
                        historyStatus={chartHistoryStatus}
                        onRetryHistory={onRetryChartHistory}
                        onLoadOlderHistory={onLoadOlderHistory}
                        theme={appTheme || 'dark'}
                        pairName={activePair.id}
                        currentPrice={currentPrice}
                        isLivePrice={Number(marketPrices[activePair.id]) > 0}
                        activePosition={activePosition}
                        onTimeframeChange={onTimeframeChange}
                        externalTimeframe={tf}
                        externalChartStyle={chartStyle}
                        externalIndicators={indicators}
                        showEntryLine={overlays.entry}
                        showTPLine={overlays.tp}
                        showSLLine={overlays.sl}
                        showLiqLine={overlays.liq}
                    />
                </div>

                {/* Positions panel — desktop only here; on mobile it's below the order form */}
                {!isMobile && (
                    <div style={{ height: 168, flexShrink: 0, display: 'flex', overflow: 'hidden' }}>
                        <PositionsPanel {...panelProps} />
                    </div>
                )}
            </div>

            {/* Order entry takes priority over the public market feed. */}
            <TradeRail isMobile={isMobile} orderType={orderType} feed={marketFeed}>

                {/* Order form */}
                <section className="velo-order-ticket" aria-label="Order ticket" style={{ borderRadius: isMobile ? 16 : 18, background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--hairline)', boxShadow: 'var(--glass-shadow)' }}>
                        {!user ? (
                            <TradeAuthGate
                                onRequireAuth={onRequireAuth}
                                title="Your next trade starts here"
                                description="Sign in to size an order, set risk and manage positions."
                            />
                        ) : (
                        <>
                        <div className="velo-order-ticket__body custom-scrollbar" tabIndex={0} role="group" aria-label="Order parameters">

                            {/* Order type */}
                            <div style={{ display: 'flex', gap: 14, borderBottom: '1px solid var(--hairline)', paddingBottom: isMobile ? 7 : 4 }}>
                                {(['MARKET', 'LIMIT', 'STOP'] as const).map(t => (
                                    <button key={t} onClick={() => setOrderType(t)} style={{ ...S.label, border: 'none', background: 'none', cursor: 'pointer', position: 'relative', paddingBottom: 3, fontSize: 10, color: orderType === t ? 'var(--fg)' : 'var(--fg-subtle)', transition: 'color 0.12s' }}>
                                        {t}
                                        {orderType === t && <div style={{ position: 'absolute', bottom: -8, left: 0, right: 0, height: 2, background: 'var(--fg)', borderRadius: 2 }} />}
                                    </button>
                                ))}
                            </div>

                            {/* Long / Short */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                {(['LONG', 'SHORT'] as const).map(s => (
                                    <button key={s} onClick={() => setSide(s)} style={{ padding: isMobile ? '8px 0' : '6px 0', borderRadius: 12, border: 'none', cursor: 'pointer', ...S.sans, fontSize: 12, transition: 'all 0.12s', background: side === s ? (s === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)') : 'var(--chip-bg)', color: side === s ? (s === 'LONG' ? '#0a1a10' : '#fff') : 'var(--fg-subtle)', boxShadow: side === s ? (s === 'LONG' ? '0 3px 16px rgba(62,207,142,0.22)' : '0 3px 16px rgba(255,60,60,0.22)') : 'none' }}>
                                        {s === 'LONG' ? 'Buy / Long' : 'Sell / Short'}
                                    </button>
                                ))}
                            </div>

                            {/* Limit price */}
                            {orderType !== 'MARKET' && (
                                <Input label="Price" placeholder={String(currentPrice)} value={limitPrice} onChange={(e: any) => setLimitPrice(e.target.value)} type="number" className="text-xs py-1" />
                            )}

                            {/* Size slider */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                    <span style={{ ...S.label }}>Size · Margin %</span>
                                    <span style={{ ...S.mono, fontSize: 11, fontWeight: 700,
                                        color: sizeSlider > 66 ? '#f97316' : sizeSlider > 33 ? 'var(--iris-violet)' : side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)',
                                        transition: 'color 0.3s ease',
                                    }}>{sizeSlider}%</span>
                                </div>
                                {/* Wrapper slider: native input layered over a styled track for reliable cross-browser animated fill */}
                                <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
                                    {/* Track background */}
                                    <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 999, background: 'var(--hairline-strong, rgba(255,255,255,0.12))', overflow: 'hidden' }}>
                                        {/* Animated fill */}
                                        <div style={{
                                            position: 'absolute', left: 0, top: 0, bottom: 0,
                                            width: `${sizeSlider}%`,
                                            borderRadius: 999,
                                            background: sizeSlider > 66
                                                ? 'linear-gradient(90deg, oklch(0.78 0.18 150), var(--accent), #f97316)'
                                                : sizeSlider > 33
                                                    ? 'linear-gradient(90deg, oklch(0.78 0.18 150), var(--accent))'
                                                    : side === 'LONG'
                                                        ? 'oklch(0.78 0.18 150)'
                                                        : 'oklch(0.66 0.22 25)',
                                            transition: 'width 0.05s linear, background 0.3s ease',
                                        }} />
                                    </div>
                                    {/* Native range input — transparent, sits on top for interaction */}
                                    <input
                                        type="range" min="0" max="100" step="1"
                                        aria-label="Margin percentage"
                                        value={sizeSlider}
                                        onChange={e => setSizeSlider(parseInt(e.target.value))}
                                        className="velo-range-thumb w-full"
                                        style={{ position: 'relative', zIndex: 1 }}
                                    />
                                </div>
                            </div>

                            {/* Cost + Leverage */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--chip-bg)', borderRadius: 12, padding: isMobile ? '8px 12px' : '5px 10px', border: '1px solid var(--hairline)' }}>
                                <div>
                                    <div style={{ ...S.label, marginBottom: 1 }}>Margin (cost)</div>
                                    <div style={{ ...S.display, fontSize: isMobile ? 16 : 14, color: 'var(--fg)' }}>${<AnimatedText text={formatMoney(cost)}/>}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ ...S.label, marginBottom: 1 }}>Leverage</div>
                                    <select aria-label="Leverage" value={leverage} onChange={e => {
                                        const v = parseInt(e.target.value);
                                        const ex = mergedPositions.find((p: Position) => p.pair === activePair.id && !p.isCopyTrade);
                                        // Only a CROSS position re-levers in place (shared margin pool),
                                        // so it gets the confirmation modal. For an isolated position —
                                        // or no position — the selector simply sets the leverage for the
                                        // NEXT order, so you can trade the same coin at a different
                                        // leverage. (Isolated leverage is fixed per position at open.)
                                        if (ex && (ex.marginMode || 'ISOLATED') === 'CROSS') {
                                            const oldMargin = ex.size / ex.leverage;
                                            const newMargin = ex.size / v;
                                            const extra = newMargin - oldMargin; // positive = more margin needed (deleveraging), negative = margin freed (leveraging up)
                                            const freeBalance = orderlyIsReady ? orderlyBalance : (user ? Math.max(0, user.balance) : 0);

                                            if (extra > 0 && freeBalance < extra) {
                                                // Cannot deleverage — insufficient balance
                                                setLeverageModal({ needed: extra, shortfall: extra - freeBalance, currentLeverage: ex.leverage, targetLeverage: v, direction: 'down' });
                                                setLeverage(ex.leverage); // snap back
                                                return;
                                            }

                                            setLeverageModal({
                                                needed: Math.abs(extra),
                                                shortfall: 0,
                                                currentLeverage: ex.leverage,
                                                targetLeverage: v,
                                                direction: v > ex.leverage ? 'up' : 'down',
                                                marginFreed: extra < 0 ? Math.abs(extra) : 0,
                                            });
                                            setLeverage(ex.leverage); // wait for modal confirm
                                        } else {
                                            setLeverage(v);
                                        }
                                    }} style={{ ...S.display, fontSize: 16, color: 'var(--fg)', background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer' }}>
                                        {[1, 2, 5, 10, 15, 20, 25].filter(l => l <= maxLeverage).map(l => <option key={l} value={l} style={{ background: 'var(--bg-base-2)', ...S.mono }}>{l}x</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* TP / SL — numeric only, validated against side */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                <Input
                                    label="TP"
                                    placeholder="Price"
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    value={takeProfit}
                                    onChange={(e: any) => {
                                        const v = e.target.value;
                                        // Allow empty, digits, and decimals only
                                        if (v === '' || /^\d*\.?\d*$/.test(v)) setTakeProfit(v);
                                    }}
                                    error={
                                        takeProfit && !isNaN(parseFloat(takeProfit)) && currentPrice > 0 ? (
                                            (side === 'LONG' && parseFloat(takeProfit) <= currentPrice) ? 'TP must be above current price' :
                                            (side === 'SHORT' && parseFloat(takeProfit) >= currentPrice) ? 'TP must be below current price' : undefined
                                        ) : undefined
                                    }
                                    className="text-xs py-1"
                                />
                                <Input
                                    label="SL"
                                    placeholder="Price"
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    value={stopLoss}
                                    onChange={(e: any) => {
                                        const v = e.target.value;
                                        if (v === '' || /^\d*\.?\d*$/.test(v)) setStopLoss(v);
                                    }}
                                    error={
                                        stopLoss && !isNaN(parseFloat(stopLoss)) && currentPrice > 0 ? (
                                            (side === 'LONG' && parseFloat(stopLoss) >= currentPrice) ? 'SL must be below current price' :
                                            (side === 'SHORT' && parseFloat(stopLoss) <= currentPrice) ? 'SL must be above current price' : undefined
                                        ) : undefined
                                    }
                                    className="text-xs py-1"
                                />
                            </div>

                            {/* Summary rows */}
                            <div style={{ paddingTop: 8, marginTop: 2, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {(marginMode === 'ISOLATED' ? [
                                    ['Est. Liq. Price', `$${formatPrice(estLiqPrice)}`, '#f97316'],
                                    ['Margin Risk', riskLevel, riskColor],
                                    ['Free Balance', `$${formatMoney(isolatedBuyingPower)}`, 'var(--pnl-up)'],
                                ] : [
                                    ['Est. Liq. Price', estLiqPrice > 0 ? `$${formatPrice(estLiqPrice)}` : '—', '#f97316'],
                                    ['Cross Pool Risk', riskLevel, riskColor],
                                    ['Cross Pool', `$${formatMoney(crossBuyingPower)}`, crossBuyingPower > 0 ? 'var(--pnl-up)' : 'var(--pnl-down)'],
                                ]).map(([label, val, color]) => (
                                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ ...S.label, fontSize: 9.5 }}>{label}</span>
                                        <span style={{ ...S.mono, fontSize: 10.5, fontWeight: 700, color: color as string }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                            {IS_V4 && <dl aria-label="Execution costs and limits" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 12px', margin: 0, padding: '8px 0', borderTop: '1px solid var(--hairline)' }}>
                                {[
                                    ['Entry fee', `$${formatMoney(cost * leverage * .001)}`],
                                    ['Net position size', `$${formatMoney(cost * (1 - leverage * .001) * leverage)}`],
                                    ['Gross profit cap', `$${formatMoney(cost * (1 - leverage * .001) * leverage)}`],
                                    ['Borrow / hour', `${(Number(risk.data?.[6] || 0) / 100).toFixed(2)}% of notional`],
                                ].map(([label, value]) => <React.Fragment key={label}>
                                    <dt style={{ ...S.label, fontSize: 9.5, letterSpacing: 0, alignSelf: 'center' }}>{label}</dt>
                                    <dd style={{ ...S.mono, fontSize: 10.5, fontWeight: 600, color: 'var(--fg)', margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</dd>
                                </React.Fragment>)}
                            </dl>}
                        </div>

                            {/* Submit button */}
                        <div className="velo-order-ticket__footer">
                            <button onClick={handleSubmit} aria-busy={tradingPending} disabled={tradingPending || (IS_V4 && (!risk.data || risk.isError)) || !Number.isFinite(Number(sizeAmount)) || Number(sizeAmount) <= 0} style={{
                                width: '100%', padding: isMobile ? '15px 0' : '11px 0', borderRadius: 14, cursor: parseFloat(sizeAmount) <= 0 ? 'not-allowed' : 'pointer', ...S.sans, fontSize: isMobile ? 14 : 12, transition: 'all 0.15s',
                                opacity: 1,
                                background: parseFloat(sizeAmount) <= 0 ? 'var(--disabled-bg)' : side === 'LONG' ? 'var(--pnl-up)' : 'var(--pnl-down)',
                                color: parseFloat(sizeAmount) <= 0 ? 'var(--disabled-fg)' : 'var(--trade-action-fg)',
                                border: parseFloat(sizeAmount) <= 0 ? '1px solid var(--control-border)' : 'none',
                                boxShadow: parseFloat(sizeAmount) <= 0 ? 'none' : side === 'LONG' ? '0 4px 18px rgba(62,207,142,0.24)' : '0 4px 18px rgba(255,60,60,0.24)',
                                marginTop: 2,
                                touchAction: 'manipulation',
                                WebkitTapHighlightColor: 'transparent',
                            }}>
                                {tradingPending ? <span role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 18 }}><Loader2 size={16} className="velo-pending-spinner" />Transaction in progress...</span> : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                                    <span style={{ ...S.label, fontSize: 11, color: 'inherit', letterSpacing: 0 }}>{leverage}x {side}</span>
                                    <span style={{ opacity: 0.45 }}>·</span>
                                    <span style={{ ...S.display, fontSize: 14 }}>{activePair.id.split('/')[0]}</span>
                                    <span>{side === 'LONG' ? '↗' : '↘'}</span>
                                </span>}
                            </button>
                            {/* Subtle demo notice only — live mode no longer needs a label,
                                the user already knows they connected a wallet. */}
                            {user && !isLiveMode && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '2px 0' }}>
                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--iris-violet)', display: 'inline-block' }} />
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--fg-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                                        Demo · Simulated
                                    </span>
                                </div>
                            )}
                        </div>
                        </>
                        )}
                </section>
            </TradeRail>

            {/* ── Mobile-only: Positions panel below order form ── */}
            {isMobile && (
                <div style={{ borderRadius: 0, background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderTop: '1px solid var(--hairline)', minHeight: 180, display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <PositionsPanel {...panelProps} />
                </div>
            )}

            {/* ── Leverage Change Confirmation Modal ── */}
            {leverageModal && (
                <LeverageModal
                    leverageModal={leverageModal}
                    positions={mergedPositions}
                    activePair={activePair}
                    currentPrice={currentPrice}
                    user={user}
                    onClose={() => setLeverageModal(null)}
                    onConfirm={(targetLeverage: number) => {
                        const exPos = mergedPositions.find((p: Position) => p.pair === activePair.id && !p.isCopyTrade);
                        setLeverage(targetLeverage);
                        setLeverageModal(null);
                        if (exPos) onOpenPosition(activePair.id, exPos.side, 0, targetLeverage, 'MARKET', currentPrice, exPos.takeProfit, exPos.stopLoss, exPos.marginMode);
                    }}
                    formatPrice={formatPrice}
                    formatMoney={formatMoney}
                    orderlyIsReady={orderlyIsReady}
                    orderlyBalance={orderlyBalance}
                />
            )}
        </div>
        </div>
    );
};
