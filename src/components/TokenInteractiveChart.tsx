/**
 * TokenInteractiveChart — pure-SVG price / market-cap chart for token pages,
 * with 24H/7D/30D timeframes (lazy Binance klines + CoinGecko mcap fetches)
 * and crosshair hover. Extracted from App.tsx (stage 5 of the monolith
 * decomposition): fully self-contained — props in, JSX out, own data fetches.
 */
import React from 'react';

export const TokenInteractiveChart = ({
    priceData, up, ticker, currentPrice, geckoId
}: {
    priceData: number[], up: boolean, ticker: string,
    currentPrice: number, geckoId?: string
}) => {
    const [mode, setMode] = React.useState<'PRICE' | 'MCAP'>('PRICE');
    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
    const [timeframe, setTimeframe] = React.useState<'24H' | '7D' | '30D'>('24H');
    const [extPriceData, setExtPriceData] = React.useState<Record<string, number[]>>({});
    const [mcapDataMap, setMcapDataMap] = React.useState<Record<string, number[]>>({});
    const [mcapLoading, setMcapLoading] = React.useState(false);

    const binanceSym = ticker === 'BTC' ? 'BTCUSDT' : ticker === 'ETH' ? 'ETHUSDT' : ticker === 'SOL' ? 'SOLUSDT' : ticker === 'DOGE' ? 'DOGEUSDT' : `${ticker}USDT`;

    // Fetch 7D / 30D price data lazily from Binance
    React.useEffect(() => {
        const intervals: Record<string, string> = { '7D': '4h', '30D': '1d' };
        const limits: Record<string, number> = { '7D': 42, '30D': 30 };
        Object.entries(intervals).forEach(([tf, interval]) => {
            if (extPriceData[tf]) return;
            fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${limits[tf]}`)
                .then(r => r.json())
                .then((d: any[]) => {
                    if (Array.isArray(d)) {
                        setExtPriceData(prev => ({ ...prev, [tf]: d.map((c: any) => parseFloat(c[4])) }));
                    }
                }).catch(() => {});
        });
    }, [ticker]);

    // Fetch market cap data from CoinGecko when MCAP mode is selected
    React.useEffect(() => {
        if (mode !== 'MCAP' || !geckoId) return;
        const tfDays: Record<string, string> = { '24H': '1', '7D': '7', '30D': '30' };
        const days = tfDays[timeframe];
        const cacheKey = timeframe;
        if (mcapDataMap[cacheKey]) return;
        setMcapLoading(true);
        fetch(`https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`)
            .then(r => r.json())
            .then(d => {
                if (d?.market_caps) {
                    setMcapDataMap(prev => ({ ...prev, [cacheKey]: d.market_caps.map((c: any) => c[1]) }));
                }
            })
            .catch(() => {})
            .finally(() => setMcapLoading(false));
    }, [mode, timeframe, geckoId]);

    const priceDataForTf = timeframe === '24H' ? priceData : (extPriceData[timeframe] || []);
    const activeData = mode === 'PRICE' ? priceDataForTf : (mcapDataMap[timeframe] || []);
    const loading = activeData.length < 2 || (mode === 'MCAP' && mcapLoading && (mcapDataMap[timeframe] || []).length < 2);

    const w = 800, h = 280;
    const pad = { top: 20, right: 16, bottom: 36, left: 78 };

    const min = loading ? 0 : Math.min(...activeData);
    const max = loading ? 1 : Math.max(...activeData);
    const range = max - min || 1;
    const toX = (i: number) => pad.left + (i / Math.max(activeData.length - 1, 1)) * (w - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((max - v) / range) * (h - pad.top - pad.bottom);

    // Purple for MCAP (matches dashboard equity chart), green/red for PRICE
    const color = mode === 'MCAP' ? 'var(--iris-violet)' : (up ? 'var(--pnl-up)' : 'var(--pnl-down)');
    const colorOklch = mode === 'MCAP' ? 'oklch(0.68 0.22 295)' : (up ? 'oklch(0.78 0.18 150)' : 'oklch(0.66 0.22 25)');

    const formatTick = (v: number) => {
        if (mode === 'MCAP') {
            if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
            if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
            if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
        }
        return v >= 1000 ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(5)}`;
    };

    const ticks = !loading ? [0, 1, 2, 3].map(i => min + (range * (3 - i)) / 3) : [];
    const now = new Date();
    const xTickCount = 5;
    const xTickIdxs = Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * Math.max(activeData.length - 1, 0)));
    const getXLabel = (i: number) => {
        if (timeframe === '24H') {
            const hoursAgo = activeData.length - 1 - i;
            const d = new Date(now.getTime() - hoursAgo * 3600 * 1000);
            return d.getHours().toString().padStart(2, '0') + ':00';
        }
        const daysAgo = Math.round((activeData.length - 1 - i) * (timeframe === '7D' ? 7 : 30) / activeData.length);
        const d = new Date(now.getTime() - daysAgo * 86400 * 1000);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const hoveredVal = hoveredIdx !== null && activeData[hoveredIdx] != null ? activeData[hoveredIdx] : null;
    const hoveredX = hoveredIdx !== null ? toX(hoveredIdx) : null;
    const hoveredY = hoveredVal != null ? toY(hoveredVal) : null;

    const firstVal = activeData[0];
    const lastVal = activeData[activeData.length - 1];
    const pctChange = firstVal && lastVal ? ((lastVal - firstVal) / firstVal) * 100 : null;

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' } as React.CSSProperties,
    };

    return (
        <div style={{ width: '100%' }}>
            {/* Header: value + controls */}
            <div className="token-chart-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 0', gap: 8, flexWrap: 'wrap' }}>
                {/* Left: value + change */}
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ ...S.mono, fontSize: 20, fontWeight: 700, color: 'var(--fg)', lineHeight: 1 }}>
                            {hoveredVal != null ? formatTick(hoveredVal) : (!loading && lastVal ? formatTick(lastVal) : (mcapLoading ? 'Loading…' : '—'))}
                        </span>
                        {pctChange != null && hoveredIdx === null && (
                            <span style={{ ...S.mono, fontSize: 11, fontWeight: 700, color: pctChange >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', background: pctChange >= 0 ? 'oklch(0.68 0.18 162 / 0.1)' : 'oklch(0.65 0.2 25 / 0.1)', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                                {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(2)}%
                            </span>
                        )}
                        {hoveredIdx !== null && hoveredVal != null && (
                            <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{getXLabel(hoveredIdx)}</span>
                        )}
                    </div>
                    <div style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)', marginTop: 3 }}>
                        {mode === 'PRICE' ? 'Price' : 'Market Cap'} · {timeframe} · {mode === 'MCAP' ? 'CoinGecko' : 'Binance'}
                    </div>
                </div>
                {/* Right: mode + timeframe — inline on mobile */}
                <div className="token-chart-controls" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'var(--chip-bg)', borderRadius: 8, padding: 3, border: '1px solid var(--hairline)', gap: 2 }}>
                        {(['PRICE', 'MCAP'] as const).map(m => (
                            <button key={m} onClick={() => setMode(m)} style={{
                                padding: '4px 10px', borderRadius: 6,
                                border: mode === m ? '1px solid var(--iris-violet)' : '1px solid transparent',
                                cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                background: mode === m ? 'var(--bg-base-2)' : 'transparent',
                                color: mode === m ? 'var(--fg)' : 'var(--fg-subtle)',
                                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                                transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}>
                                {m === 'PRICE' ? 'Price' : 'Mkt Cap'}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                        {(['24H', '7D', '30D'] as const).map(tf => (
                            <button key={tf} onClick={() => setTimeframe(tf)} style={{
                                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                ...S.label, fontSize: 9,
                                background: timeframe === tf ? 'var(--bg-base-2)' : 'transparent',
                                color: timeframe === tf ? 'var(--fg)' : 'var(--fg-subtle)',
                                boxShadow: timeframe === tf ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                                transition: 'all 0.15s',
                            }}>
                                {tf}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* SVG Chart — responsive, no fixed height */}
            <div style={{ position: 'relative', userSelect: 'none', marginTop: 8 }}>
                {loading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                        <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>
                            {mcapLoading ? 'Fetching market cap data…' : 'Loading chart…'}
                        </span>
                    </div>
                )}
                <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="token-chart-svg"
                    style={{ width: '100%', height: 'auto', minHeight: 200, maxHeight: 320, display: 'block', overflow: 'visible', opacity: loading ? 0.2 : 1, transition: 'opacity 0.3s' }}
                    preserveAspectRatio="xMidYMid meet"
                    onMouseLeave={() => setHoveredIdx(null)}
                    onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((e.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        setHoveredIdx(Math.round(frac * (activeData.length - 1)));
                    }}
                    onTouchMove={(e) => {
                        e.preventDefault();
                        const touch = e.touches[0];
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((touch.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        setHoveredIdx(Math.round(frac * (activeData.length - 1)));
                    }}
                    onTouchEnd={() => setHoveredIdx(null)}
                >
                    <defs>
                        <linearGradient id={`fill-${ticker}-${mode}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colorOklch} stopOpacity="0.28"/>
                            <stop offset="65%" stopColor={colorOklch} stopOpacity="0.06"/>
                            <stop offset="100%" stopColor={colorOklch} stopOpacity="0"/>
                        </linearGradient>
                        <clipPath id={`clip-${ticker}-${mode}`}>
                            <rect x={pad.left} y={pad.top} width={w - pad.left - pad.right} height={h - pad.top - pad.bottom}/>
                        </clipPath>
                    </defs>

                    {/* Grid lines */}
                    {ticks.map((t, i) => (
                        <line key={i} x1={pad.left} x2={w - pad.right} y1={toY(t)} y2={toY(t)}
                            stroke="var(--hairline)" strokeWidth="0.5" strokeDasharray="4,6"/>
                    ))}

                    {/* Hover vertical line */}
                    {hoveredIdx !== null && hoveredX !== null && (
                        <line x1={hoveredX} x2={hoveredX} y1={pad.top} y2={h - pad.bottom}
                            stroke={color} strokeWidth="1" strokeDasharray="3,4" strokeOpacity="0.45"/>
                    )}

                    {/* Fill */}
                    {!loading && (
                        <path
                            d={`${activeData.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')} L${toX(activeData.length-1).toFixed(1)},${(h-pad.bottom).toFixed(1)} L${pad.left},${(h-pad.bottom).toFixed(1)} Z`}
                            fill={`url(#fill-${ticker}-${mode})`}
                            clipPath={`url(#clip-${ticker}-${mode})`}
                        />
                    )}

                    {/* Line */}
                    {!loading && (
                        <polyline
                            points={activeData.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')}
                            fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                            clipPath={`url(#clip-${ticker}-${mode})`}
                        />
                    )}

                    {/* Hover dot */}
                    {hoveredIdx !== null && hoveredX !== null && hoveredY !== null && (
                        <>
                            <circle cx={hoveredX} cy={hoveredY} r={6} fill={color} fillOpacity={0.15}/>
                            <circle cx={hoveredX} cy={hoveredY} r={4} fill={color} stroke="var(--bg-base)" strokeWidth={2}/>
                        </>
                    )}

                    {/* Endpoint dot */}
                    {!loading && hoveredIdx === null && (
                        <circle cx={toX(activeData.length-1)} cy={toY(activeData[activeData.length-1])} r={4}
                            fill={color} stroke="var(--bg-base)" strokeWidth={2}/>
                    )}

                    {/* Y labels */}
                    {ticks.map((t, i) => (
                        <text key={i} x={pad.left - 8} y={toY(t) + 4} textAnchor="end"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--fg-subtle)' }}>
                            {formatTick(t)}
                        </text>
                    ))}

                    {/* X labels */}
                    {xTickIdxs.map(i => (
                        <text key={i} x={toX(i)} y={h - 8} textAnchor="middle"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--fg-subtle)' }}>
                            {getXLabel(i)}
                        </text>
                    ))}

                    {/* VELO watermark */}
                    <text x={w/2} y={h/2+10} textAnchor="middle"
                        style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 32,
                            fill: 'var(--fg)', opacity: 0.03, letterSpacing: '-0.02em', userSelect: 'none' }}>
                        VELO
                    </text>
                </svg>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, padding: '4px 14px 12px' }}>
                <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>{timeframe} · {mode === 'MCAP' ? 'CoinGecko' : 'Binance'}</span>
                {!loading && <span style={{ ...S.label, fontSize: 9, color: 'var(--fg-subtle)' }}>Low: {formatTick(min)} · High: {formatTick(max)}</span>}
            </div>
        </div>
    );
};

export default TokenInteractiveChart;
