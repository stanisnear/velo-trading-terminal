/**
 * TokenInteractiveChart — pure-SVG price / market-cap chart for token pages,
 * with 24H/7D/30D timeframes from the server-side market-data gateway
 * and crosshair hover. Extracted from App.tsx (stage 5 of the monolith
 * decomposition): fully self-contained — props in, JSX out, own data fetches.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMarketData } from '../services/marketDiscovery';

export const TokenInteractiveChart = ({
    up, ticker, currentPrice, assetId
}: {
    priceData?: number[], up: boolean, ticker: string,
    currentPrice: number, assetId?: string
}) => {
    const [mode, setMode] = React.useState<'PRICE' | 'MCAP'>('PRICE');
    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
    const [timeframe, setTimeframe] = React.useState<'24H' | '7D' | '30D'>('24H');
    const chartId = React.useId().replace(/:/g, '');
    const chartSvgRef = React.useRef<SVGSVGElement | null>(null);

    const days = { '24H': 1, '7D': 7, '30D': 30 }[timeframe];
    const history = useQuery({
        queryKey: ['public-markets', 'chart', assetId, days],
        queryFn: ({ signal }) => fetchMarketData('chart', assetId, days, signal),
        enabled: !!assetId, staleTime: days === 1 ? 900000 : 3600000, retry: 1,
    });
    const rows: number[][] = history.data?.[mode === 'PRICE' ? 'prices' : 'market_caps'] || [];
    const points = rows.filter(row => Number.isFinite(row?.[0]) && Number.isFinite(row?.[1]) && row[1] > 0);
    const activeData = points.map(row => row[1]);
    const hasData = activeData.length >= 2;
    const loading = !hasData && history.isPending && !!assetId;
    const failed = !hasData && !loading;

    const [plotSize, setPlotSize] = React.useState({ width: 800, height: 280 });
    React.useEffect(() => {
        const svg = chartSvgRef.current;
        if (!hasData || !svg) return;
        const updateSize = () => {
            const rect = svg.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            setPlotSize(current => current.width === width && current.height === height ? current : { width, height });
        };
        const observer = new ResizeObserver(updateSize);
        observer.observe(svg);
        updateSize();
        return () => observer.disconnect();
    }, [hasData]);

    const w = plotSize.width, h = plotSize.height;
    const pad = { top: 20, right: 16, bottom: 36, left: 78 };

    const min = hasData ? Math.min(...activeData) : 0;
    const max = hasData ? Math.max(...activeData) : 1;
    const range = max - min || 1;
    const startTime = points[0]?.[0] || 0;
    const timeRange = (points[points.length - 1]?.[0] || 0) - startTime || 1;
    const toX = (i: number) => pad.left + (((points[i]?.[0] || startTime) - startTime) / timeRange) * (w - pad.left - pad.right);
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
    const xTickCount = w < 500 ? 3 : 5;
    const xTickIdxs = [...new Set(Array.from({ length: xTickCount }, (_, i) => Math.round((i / (xTickCount - 1)) * Math.max(activeData.length - 1, 0))))];
    const getXLabel = (i: number) => {
        const timestamp = points[i]?.[0];
        if (!Number.isFinite(timestamp)) return '';
        const date = new Date(timestamp);
        return timeframe === '24H'
            ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
        numeric: { fontFamily: 'var(--font-sans)', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum" 1', letterSpacing: 'normal' } as React.CSSProperties,
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
                    ref={chartSvgRef}
                    viewBox={`0 0 ${w} ${h}`}
                    className="token-chart-svg"
                    style={{ width: '100%', height: 'clamp(210px, 28vw, 270px)', display: 'block', overflow: 'hidden' }}
                    preserveAspectRatio="none"
                    onPointerLeave={() => setHoveredIdx(null)}
                    onPointerMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const svgX = ((e.clientX - rect.left) / rect.width) * w;
                        const frac = Math.max(0, Math.min(1, (svgX - pad.left) / (w - pad.left - pad.right)));
                        const timestamp = startTime + frac * timeRange;
                        setHoveredIdx(points.reduce((closest, point, index) => Math.abs(point[0] - timestamp) < Math.abs(points[closest][0] - timestamp) ? index : closest, 0));
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
                            style={{ ...S.numeric, fontSize: 11, fill: 'var(--fg-subtle)' }}>
                            {formatTick(t)}
                        </text>
                    ))}

                    {/* X labels */}
                    {xTickIdxs.map(i => (
                        <text key={i} x={toX(i)} y={h - 8} textAnchor={i === 0 ? 'start' : i === activeData.length - 1 ? 'end' : 'middle'}
                            style={{ ...S.numeric, fontSize: 11, fill: 'var(--fg-subtle)' }}>
                            {getXLabel(i)}
                        </text>
                    ))}

                </svg> : (
                    <div className="token-chart-empty" role="status" aria-live="polite">
                        <span className="token-chart-empty-mark" aria-hidden="true">V</span>
                        <span className="token-chart-empty-title">{loading ? 'Loading market history' : failed ? 'Market history unavailable' : 'No chart data yet'}</span>
                        <span className="token-chart-empty-copy">{loading ? 'Fetching verified price points.' : failed ? 'The live price is still available. Try loading the chart again.' : 'Price history will appear when data is available.'}</span>
                        {failed && <button className="token-chart-retry" disabled={history.isFetching} onClick={() => void history.refetch()}>Retry</button>}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="token-chart-footer" style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 4, padding: '0 18px 14px' }}>
                <a href="https://coinmarketcap.com/" target="_blank" rel="noopener noreferrer" style={{ marginRight: 'auto', fontSize: 10, color: 'var(--fg-muted)' }}>Data: CoinMarketCap</a>
                {hasData && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-subtle)' }}>Low {formatTick(min)} <span aria-hidden="true">·</span> High {formatTick(max)}</span>}
            </div>
        </div>
    );
};

export default TokenInteractiveChart;
