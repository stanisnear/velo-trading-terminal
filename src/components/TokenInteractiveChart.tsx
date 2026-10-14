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
    const [priceDataMap, setPriceDataMap] = React.useState<Record<string, number[]>>({});
    const [priceLoading, setPriceLoading] = React.useState(false);
    const [priceError, setPriceError] = React.useState(false);
    const [priceRetry, setPriceRetry] = React.useState(0);
    const [mcapDataMap, setMcapDataMap] = React.useState<Record<string, number[]>>({});
    const [mcapLoading, setMcapLoading] = React.useState(false);
    const [mcapError, setMcapError] = React.useState(false);
    const [mcapRetry, setMcapRetry] = React.useState(0);
    const chartId = React.useId().replace(/:/g, '');

    const binanceSym = ticker === 'BTC' ? 'BTCUSDT' : ticker === 'ETH' ? 'ETHUSDT' : ticker === 'SOL' ? 'SOLUSDT' : ticker === 'DOGE' ? 'DOGEUSDT' : `${ticker}USDT`;

    // Load only the selected window and keep failures explicit rather than
    // leaving the chart in a permanent loading state.
    React.useEffect(() => {
        const provided24h = priceData.filter(v => Number.isFinite(v) && v > 0);
        if (mode !== 'PRICE' || (timeframe === '24H' && provided24h.length >= 2) || priceDataMap[timeframe]?.length >= 2) return;

        const config: Record<string, { interval: string; limit: number }> = {
            '24H': { interval: '1h', limit: 24 },
            '7D': { interval: '4h', limit: 42 },
            '30D': { interval: '1d', limit: 30 },
        };
        const controller = new AbortController();
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 9000);
        const { interval, limit } = config[timeframe];
        setPriceLoading(true);
        setPriceError(false);
        fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=${limit}`, { signal: controller.signal })
            .then(r => { if (!r.ok) throw new Error('Price history request failed'); return r.json(); })
            .then((rows: any[]) => {
                const values = Array.isArray(rows) ? rows.map(row => Number(row?.[4])).filter(v => Number.isFinite(v) && v > 0) : [];
                if (values.length < 2) throw new Error('Price history unavailable');
                setPriceDataMap(prev => ({ ...prev, [timeframe]: values }));
            })
            .catch(() => { if (!controller.signal.aborted || timedOut) { setPriceError(true); setPriceLoading(false); } })
            .finally(() => { window.clearTimeout(timeout); if (!controller.signal.aborted) setPriceLoading(false); });
        return () => { window.clearTimeout(timeout); controller.abort(); };
    }, [mode, timeframe, ticker, binanceSym, priceData, priceDataMap, priceRetry]);

    // Fetch market cap data from CoinGecko when MCAP mode is selected
    React.useEffect(() => {
        if (mode !== 'MCAP' || !geckoId) return;
        const tfDays: Record<string, string> = { '24H': '1', '7D': '7', '30D': '30' };
        const days = tfDays[timeframe];
        const cacheKey = timeframe;
        if (mcapDataMap[cacheKey]) return;
        const controller = new AbortController();
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 9000);
        setMcapLoading(true);
        setMcapError(false);
        fetch(`https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`, { signal: controller.signal })
            .then(r => { if (!r.ok) throw new Error('Market cap request failed'); return r.json(); })
            .then(d => {
                const values = Array.isArray(d?.market_caps) ? d.market_caps.map((c: any) => Number(c?.[1])).filter((v: number) => Number.isFinite(v) && v > 0) : [];
                if (values.length < 2) throw new Error('Market cap history unavailable');
                setMcapDataMap(prev => ({ ...prev, [cacheKey]: values }));
            })
            .catch(() => { if (!controller.signal.aborted || timedOut) { setMcapError(true); setMcapLoading(false); } })
            .finally(() => { window.clearTimeout(timeout); if (!controller.signal.aborted) setMcapLoading(false); });
        return () => { window.clearTimeout(timeout); controller.abort(); };
    }, [mode, timeframe, geckoId, mcapRetry]);

    const provided24h = priceData.filter(v => Number.isFinite(v) && v > 0);
    const priceDataForTf = timeframe === '24H' && provided24h.length >= 2 ? provided24h : (priceDataMap[timeframe] || []);
    const activeData = mode === 'PRICE' ? priceDataForTf : (mcapDataMap[timeframe] || []);
    const hasData = activeData.length >= 2;
    const loading = !hasData && (mode === 'PRICE' ? priceLoading : mcapLoading);
    const failed = !hasData && (mode === 'PRICE' ? priceError : mcapError);

    const w = 800, h = 280;
    const pad = { top: 20, right: 16, bottom: 36, left: 78 };

    const min = loading ? 0 : Math.min(...activeData);
    const max = loading ? 1 : Math.max(...activeData);
    const range = max - min || 1;
    const toX = (i: number) => pad.left + (i / Math.max(activeData.length - 1, 1)) * (w - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((max - v) / range) * (h - pad.top - pad.bottom);

    const color = 'var(--accent)';

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
    const comparisonValue = mode === 'PRICE' && currentPrice > 0 ? currentPrice : lastVal;
    const pctChange = firstVal && comparisonValue ? ((comparisonValue - firstVal) / firstVal) * 100 : null;
    const displayedValue = hoveredVal != null
        ? formatTick(hoveredVal)
        : mode === 'PRICE' && currentPrice > 0
            ? formatTick(currentPrice)
            : hasData && lastVal
                ? formatTick(lastVal)
                : (loading ? 'Loading…' : '—');

    const S = {
        mono: { fontFamily: 'var(--font-mono)', fontFeatureSettings: '"tnum" 1' } as React.CSSProperties,
        label: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em' } as React.CSSProperties,
    };

    return (
        <div style={{ width: '100%' }}>
            {/* Header: value + controls */}
            <div className="token-chart-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', padding: '16px 18px 0', gap: 12 }}>
                {/* Left: value + change */}
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 23, fontWeight: 650, fontVariantNumeric: 'tabular-nums', letterSpacing: 'normal', color: 'var(--fg)', lineHeight: 1 }}>
                            {displayedValue}
                        </span>
                        {pctChange != null && hoveredIdx === null && (
                            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: pctChange >= 0 ? 'var(--pnl-up)' : 'var(--pnl-down)', background: pctChange >= 0 ? 'color-mix(in oklab, var(--pnl-up) 12%, transparent)' : 'color-mix(in oklab, var(--pnl-down) 10%, transparent)', borderRadius: 6, padding: '3px 7px', flexShrink: 0 }}>
                                {pctChange >= 0 ? '▲' : '▼'} {Math.abs(pctChange).toFixed(2)}%
                            </span>
                        )}
                    </div>
                </div>
                {/* Right: mode + timeframe — inline on mobile */}
                <div className="token-chart-controls" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'flex', background: 'var(--chip-bg)', borderRadius: 8, padding: 3, border: '1px solid var(--hairline)', gap: 2 }}>
                        {(['PRICE', 'MCAP'] as const).map(m => (
                            <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); setHoveredIdx(null); }} style={{
                                padding: '4px 10px', borderRadius: 6,
                                border: mode === m ? '1px solid var(--accent)' : '1px solid transparent',
                                cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                background: mode === m ? 'var(--glass-bg-strong)' : 'transparent',
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
                            <button key={tf} aria-pressed={timeframe === tf} onClick={() => { setTimeframe(tf); setHoveredIdx(null); }} style={{
                                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                                ...S.label, fontSize: 9,
                                background: timeframe === tf ? 'var(--glass-bg-strong)' : 'transparent',
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
            <div className="token-chart-plot" style={{ position: 'relative', userSelect: 'none', marginTop: 8, touchAction: 'pan-y' }}>
                {hasData ? <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="token-chart-svg"
                    style={{ width: '100%', height: 'clamp(210px, 28vw, 270px)', display: 'block', overflow: 'hidden' }}
                    preserveAspectRatio="none"
                    onPointerLeave={() => setHoveredIdx(null)}
                    onPointerMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((e.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        setHoveredIdx(Math.round(frac * (activeData.length - 1)));
                    }}
                >
                    <defs>
                        <linearGradient id={`fill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.17"/>
                            <stop offset="65%" stopColor={color} stopOpacity="0.035"/>
                            <stop offset="100%" stopColor={color} stopOpacity="0"/>
                        </linearGradient>
                        <clipPath id={`clip-${chartId}`}>
                            <rect x={pad.left} y={pad.top} width={w - pad.left - pad.right} height={h - pad.top - pad.bottom}/>
                        </clipPath>
                    </defs>

                    {/* Grid lines */}
                    {ticks.map((t, i) => (
                        <line key={i} x1={pad.left} x2={w - pad.right} y1={toY(t)} y2={toY(t)}
                            stroke="var(--hairline)" strokeWidth="0.65"/>
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
                            fill={`url(#fill-${chartId})`}
                            clipPath={`url(#clip-${chartId})`}
                        />
                    )}

                    {/* Line */}
                    {!loading && (
                        <polyline
                            points={activeData.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')}
                            fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
                            clipPath={`url(#clip-${chartId})`}
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

                </svg> : (
                    <div className="token-chart-empty" role="status" aria-live="polite">
                        <span className="token-chart-empty-mark" aria-hidden="true">V</span>
                        <span className="token-chart-empty-title">{loading ? 'Loading market history' : failed ? 'Market history unavailable' : 'No chart data yet'}</span>
                        <span className="token-chart-empty-copy">{loading ? 'Fetching verified price points.' : failed ? 'The live price is still available. Try loading the chart again.' : 'Price history will appear when data is available.'}</span>
                        {failed && <button className="token-chart-retry" onClick={() => mode === 'PRICE' ? setPriceRetry(v => v + 1) : setMcapRetry(v => v + 1)}>Retry</button>}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="token-chart-footer" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 4, padding: '0 18px 14px' }}>
                {!loading && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-subtle)' }}>Low {formatTick(min)} <span aria-hidden="true">·</span> High {formatTick(max)}</span>}
            </div>
        </div>
    );
};

export default TokenInteractiveChart;
