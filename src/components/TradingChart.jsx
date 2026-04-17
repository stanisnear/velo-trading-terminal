import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fmt, calcSMA, calcEMA, calcBollingerBands } from "../utils/helpers.jsx";
import { INDICATORS_LIST, TIMEFRAMES } from "../utils/constants.jsx";

// ─── TRADING CHART ─────────────────────────────────────────────────────
export default function TradingChart({ candles, currentPrice, positions, pair, onTimeframeChange }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [crosshair, setCrosshair] = useState(null);
  const [activeIndicators, setActiveIndicators] = useState(["sma20"]);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [chartType, setChartType] = useState("candles"); // candles | line | area
  const [timeframe, setTimeframe] = useState("15m");
  const [showVolume, setShowVolume] = useState(true);

  // Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Chart geometry
  const pad = { top: 12, right: 70, bottom: 30, left: 0 };
  const volHeight = showVolume ? 50 : 0;
  const cw = dims.w - pad.left - pad.right;
  const ch = dims.h - pad.top - pad.bottom - volHeight;
  const data = candles || [];

  // Price range
  const { min, max, range } = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 1, range: 1 };
    let lo = Infinity, hi = -Infinity;
    data.forEach(c => { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; });
    // Include indicators
    activeIndicators.forEach(id => {
      const ind = INDICATORS_LIST.find(x => x.id === id);
      if (!ind) return;
      let vals = [];
      if (id === "bb") {
        vals = calcBollingerBands(data, ind.period);
        vals.forEach(v => { if (v.upper > hi) hi = v.upper; if (v.lower < lo) lo = v.lower; });
      } else if (id.startsWith("ema")) {
        vals = calcEMA(data, ind.period);
        vals.forEach(v => { if (v.value > hi) hi = v.value; if (v.value < lo) lo = v.value; });
      } else {
        vals = calcSMA(data, ind.period);
        vals.forEach(v => { if (v.value > hi) hi = v.value; if (v.value < lo) lo = v.value; });
      }
    });
    const padding = (hi - lo) * 0.08;
    return { min: lo - padding, max: hi + padding, range: hi - lo + padding * 2 };
  }, [data, activeIndicators]);

  const maxVol = useMemo(() => data.length > 0 ? Math.max(...data.map(c => c.volume)) : 1, [data]);
  const y = useCallback((p) => pad.top + ch - ((p - min) / range) * ch, [ch, min, range]);
  const gap = data.length > 0 ? cw / data.length : 1;
  const barW = Math.max(1, Math.min(14, gap * 0.65));
  const x = useCallback((i) => pad.left + i * gap + gap / 2, [gap]);

  // Scale lines
  const scaleLines = useMemo(() => {
    const steps = 8;
    return Array.from({ length: steps }, (_, i) => min + (range / (steps - 1)) * i);
  }, [min, range]);

  // Indicator data
  const indicatorData = useMemo(() => {
    const result = {};
    activeIndicators.forEach(id => {
      const ind = INDICATORS_LIST.find(x => x.id === id);
      if (!ind || data.length < ind.period) return;
      if (id === "bb") result[id] = calcBollingerBands(data, ind.period);
      else if (id.startsWith("ema")) result[id] = calcEMA(data, ind.period);
      else result[id] = calcSMA(data, ind.period);
    });
    return result;
  }, [data, activeIndicators]);

  // Indicator polylines
  const indicatorPaths = useMemo(() => {
    const paths = [];
    for (const [id, values] of Object.entries(indicatorData)) {
      const ind = INDICATORS_LIST.find(x => x.id === id);
      if (!ind) continue;
      if (id === "bb") {
        const offset = data.length - values.length;
        const upperPts = values.map((v, i) => `${x(i + offset)},${y(v.upper)}`).join(" ");
        const middlePts = values.map((v, i) => `${x(i + offset)},${y(v.middle)}`).join(" ");
        const lowerPts = values.map((v, i) => `${x(i + offset)},${y(v.lower)}`).join(" ");
        // Fill between bands
        const fillPts = values.map((v, i) => `${x(i + offset)},${y(v.upper)}`).join(" ") + " " +
          [...values].reverse().map((v, i) => `${x(data.length - 1 - i - (data.length - values.length - values.length + i))},${y(v.lower)}`);
        paths.push(
          { key: id + "_upper", points: upperPts, color: ind.color, width: 1, dash: "4 2", label: "BB Upper" },
          { key: id + "_middle", points: middlePts, color: ind.color, width: 1, dash: "", label: "BB Mid" },
          { key: id + "_lower", points: lowerPts, color: ind.color, width: 1, dash: "4 2", label: "BB Lower" },
        );
      } else {
        const offset = data.length - values.length;
        const pts = values.map((v, i) => `${x(i + offset)},${y(v.value)}`).join(" ");
        paths.push({ key: id, points: pts, color: ind.color, width: 1.5, dash: "", label: ind.name });
      }
    }
    return paths;
  }, [indicatorData, data, x, y]);

  // Mouse handlers
  const handleMouse = useCallback((e) => {
    if (!containerRef.current || data.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < pad.left || mx > dims.w - pad.right || my < pad.top || my > pad.top + ch) {
      setCrosshair(null); return;
    }
    const idx = Math.min(data.length - 1, Math.max(0, Math.round((mx - pad.left - gap / 2) / gap)));
    setCrosshair({ x: x(idx), y: my, idx, candle: data[idx] });
  }, [data, dims, ch, gap, x]);

  const pos = positions?.find(p => p.pair === pair);

  if (data.length < 2) {
    return (
      <div ref={containerRef} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13, fontWeight: 600 }}>
        Loading chart data…
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative", cursor: "crosshair", userSelect: "none" }}
      onMouseMove={handleMouse} onMouseLeave={() => setCrosshair(null)}>
      
      {/* Toolbar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 2, padding: "6px 10px", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {/* Timeframes */}
        {TIMEFRAMES.map(tf => (
          <button key={tf} onClick={() => { setTimeframe(tf); onTimeframeChange?.(tf); }}
            style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: "none", cursor: "pointer",
              background: timeframe === tf ? "rgba(255,255,255,0.08)" : "none",
              color: timeframe === tf ? "#e5e5e5" : "#666",
            }}>{tf}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
        {/* Chart Type */}
        {[
          { id: "candles", label: "⊞" },
          { id: "line", label: "∿" },
          { id: "area", label: "▤" },
        ].map(ct => (
          <button key={ct.id} onClick={() => setChartType(ct.id)}
            style={{ padding: "3px 7px", fontSize: 13, borderRadius: 5, border: "none", cursor: "pointer",
              background: chartType === ct.id ? "rgba(59,130,246,0.15)" : "none",
              color: chartType === ct.id ? "#3b82f6" : "#666",
            }}>{ct.label}</button>
        ))}
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
        {/* Volume Toggle */}
        <button onClick={() => setShowVolume(!showVolume)}
          style={{ padding: "3px 8px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: "none", cursor: "pointer",
            background: showVolume ? "rgba(59,130,246,0.12)" : "none", color: showVolume ? "#3b82f6" : "#666",
          }}>VOL</button>
        {/* Indicators */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
            style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, border: "none", cursor: "pointer",
              background: activeIndicators.length > 0 ? "rgba(139,92,246,0.12)" : "none",
              color: activeIndicators.length > 0 ? "#8b5cf6" : "#666",
            }}>
            ƒ Indicators {activeIndicators.length > 0 && `(${activeIndicators.length})`}
          </button>
          {showIndicatorPanel && (
            <div style={{ position: "absolute", top: 28, left: 0, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 6, zIndex: 20, minWidth: 180, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
              {INDICATORS_LIST.map(ind => {
                const active = activeIndicators.includes(ind.id);
                return (
                  <button key={ind.id}
                    onClick={() => setActiveIndicators(prev => active ? prev.filter(x => x !== ind.id) : [...prev, ind.id])}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                      background: active ? "rgba(255,255,255,0.06)" : "none", color: "#e5e5e5", fontSize: 12, fontWeight: 600, textAlign: "left",
                    }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: active ? ind.color : "rgba(255,255,255,0.1)" }} />
                    {ind.name}
                    {active && <span style={{ marginLeft: "auto", fontSize: 10, color: "#10b981" }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* OHLC info */}
        {crosshair?.candle && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 10, fontWeight: 600, fontFamily: "monospace" }}>
            <span style={{ color: "#888" }}>O <span style={{ color: "#e5e5e5" }}>{fmt(crosshair.candle.open)}</span></span>
            <span style={{ color: "#888" }}>H <span style={{ color: "#10b981" }}>{fmt(crosshair.candle.high)}</span></span>
            <span style={{ color: "#888" }}>L <span style={{ color: "#ef4444" }}>{fmt(crosshair.candle.low)}</span></span>
            <span style={{ color: "#888" }}>C <span style={{ color: "#e5e5e5" }}>{fmt(crosshair.candle.close)}</span></span>
            <span style={{ color: "#888" }}>V <span style={{ color: "#666" }}>{Math.round(crosshair.candle.volume).toLocaleString()}</span></span>
          </div>
        )}
      </div>

      <svg width={dims.w} height={dims.h} style={{ display: "block" }}>
        {/* Grid */}
        {scaleLines.map((p, i) => (
          <g key={i}>
            <line x1={pad.left} y1={y(p)} x2={dims.w - pad.right} y2={y(p)} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
            <text x={dims.w - pad.right + 6} y={y(p) + 3} fill="#555" fontSize={9} fontFamily="'JetBrains Mono', monospace">{fmt(p)}</text>
          </g>
        ))}

        {/* Volume bars */}
        {showVolume && data.map((c, i) => {
          const isUp = c.close >= c.open;
          const vH = (c.volume / maxVol) * volHeight;
          return (
            <rect key={`v${i}`}
              x={x(i) - barW / 2} y={dims.h - pad.bottom - vH}
              width={barW} height={vH}
              fill={isUp ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}
              rx={0.5}
            />
          );
        })}

        {/* Bollinger Bands fill */}
        {indicatorData.bb && (() => {
          const offset = data.length - indicatorData.bb.length;
          const pts = indicatorData.bb.map((v, i) => `${x(i + offset)},${y(v.upper)}`).join(" ") + " " +
            [...indicatorData.bb].reverse().map((v, i) => `${x(data.length - 1 - i - offset)},${y(v.lower)}`).join(" ");
          return <polygon points={pts} fill="rgba(99,102,241,0.04)" />;
        })()}

        {/* Candles / Line / Area */}
        {chartType === "candles" && data.map((c, i) => {
          const isUp = c.close >= c.open;
          const color = isUp ? "#10b981" : "#ef4444";
          const bodyTop = y(Math.max(c.open, c.close));
          const bodyH = Math.max(1, y(Math.min(c.open, c.close)) - bodyTop);
          return (
            <g key={i}>
              <line x1={x(i)} y1={y(c.high)} x2={x(i)} y2={y(c.low)} stroke={color} strokeWidth={1} opacity={0.7} />
              <rect x={x(i) - barW / 2} y={bodyTop} width={barW} height={bodyH} fill={color} rx={barW > 4 ? 1 : 0} />
            </g>
          );
        })}

        {chartType === "line" && (
          <polyline
            points={data.map((c, i) => `${x(i)},${y(c.close)}`).join(" ")}
            fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          />
        )}

        {chartType === "area" && (<>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <polygon
            points={`${x(0)},${y(min)} ` + data.map((c, i) => `${x(i)},${y(c.close)}`).join(" ") + ` ${x(data.length - 1)},${y(min)}`}
            fill="url(#areaGrad)"
          />
          <polyline points={data.map((c, i) => `${x(i)},${y(c.close)}`).join(" ")} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        </>)}

        {/* Indicator lines */}
        {indicatorPaths.map(p => (
          <polyline key={p.key} points={p.points} fill="none" stroke={p.color} strokeWidth={p.width}
            strokeDasharray={p.dash} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        ))}

        {/* Current price line */}
        {currentPrice && (
          <g>
            <line x1={pad.left} y1={y(currentPrice)} x2={dims.w - pad.right} y2={y(currentPrice)} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 2" opacity={0.6} />
            <rect x={dims.w - pad.right} y={y(currentPrice) - 10} width={68} height={20} rx={4} fill="#3b82f6" />
            <text x={dims.w - pad.right + 6} y={y(currentPrice) + 4} fill="#fff" fontSize={10} fontWeight={700} fontFamily="monospace">{fmt(currentPrice)}</text>
          </g>
        )}

        {/* Position overlays */}
        {pos && (
          <g>
            {/* Entry */}
            <line x1={pad.left} y1={y(pos.entryPrice)} x2={dims.w - pad.right} y2={y(pos.entryPrice)} stroke="#8b5cf6" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
            <rect x={pad.left + 4} y={y(pos.entryPrice) - 14} width={70} height={16} rx={3} fill="rgba(139,92,246,0.2)" />
            <text x={pad.left + 8} y={y(pos.entryPrice) - 3} fill="#8b5cf6" fontSize={9} fontWeight={700}>ENTRY {fmt(pos.entryPrice)}</text>
            {/* TP */}
            {pos.takeProfit && <>
              <line x1={pad.left} y1={y(pos.takeProfit)} x2={dims.w - pad.right} y2={y(pos.takeProfit)} stroke="#10b981" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
              <rect x={pad.left + 4} y={y(pos.takeProfit) - 14} width={60} height={16} rx={3} fill="rgba(16,185,129,0.15)" />
              <text x={pad.left + 8} y={y(pos.takeProfit) - 3} fill="#10b981" fontSize={9} fontWeight={700}>TP {fmt(pos.takeProfit)}</text>
            </>}
            {/* SL */}
            {pos.stopLoss && <>
              <line x1={pad.left} y1={y(pos.stopLoss)} x2={dims.w - pad.right} y2={y(pos.stopLoss)} stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
              <rect x={pad.left + 4} y={y(pos.stopLoss) - 14} width={55} height={16} rx={3} fill="rgba(239,68,68,0.15)" />
              <text x={pad.left + 8} y={y(pos.stopLoss) - 3} fill="#ef4444" fontSize={9} fontWeight={700}>SL {fmt(pos.stopLoss)}</text>
            </>}
            {/* Liquidation */}
            <line x1={pad.left} y1={y(pos.liquidationPrice)} x2={dims.w - pad.right} y2={y(pos.liquidationPrice)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 2" opacity={0.4} />
          </g>
        )}

        {/* Crosshair */}
        {crosshair && (
          <g>
            <line x1={crosshair.x} y1={pad.top} x2={crosshair.x} y2={dims.h - pad.bottom} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <line x1={pad.left} y1={crosshair.y} x2={dims.w - pad.right} y2={crosshair.y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            {/* Price label */}
            <rect x={dims.w - pad.right} y={crosshair.y - 10} width={68} height={20} rx={4} fill="rgba(255,255,255,0.1)" />
            <text x={dims.w - pad.right + 6} y={crosshair.y + 4} fill="#ccc" fontSize={9} fontWeight={600} fontFamily="monospace">
              {fmt(min + ((dims.h - pad.bottom - crosshair.y) / ch) * range)}
            </text>
            {/* Time label */}
            {crosshair.candle && (
              <>
                <rect x={crosshair.x - 30} y={dims.h - pad.bottom + 2} width={60} height={18} rx={4} fill="rgba(255,255,255,0.08)" />
                <text x={crosshair.x} y={dims.h - pad.bottom + 14} fill="#888" fontSize={9} textAnchor="middle" fontFamily="monospace">
                  {new Date(crosshair.candle.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </text>
              </>
            )}
          </g>
        )}

        {/* Time axis */}
        {data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 8)) === 0).map((c) => {
          const idx = data.indexOf(c);
          return (
            <text key={idx} x={x(idx)} y={dims.h - pad.bottom + 16} fill="#444" fontSize={9} textAnchor="middle" fontFamily="monospace">
              {new Date(c.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </text>
          );
        })}

        {/* Watermark */}
        <text x={dims.w / 2} y={dims.h / 2 - 10} fill="rgba(255,255,255,0.015)" fontSize={80} fontWeight={900} textAnchor="middle" dominantBaseline="middle" style={{ userSelect: "none", pointerEvents: "none" }}>VELO</text>
      </svg>

      {/* Active indicator legend */}
      {activeIndicators.length > 0 && (
        <div style={{ position: "absolute", top: 38, left: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {activeIndicators.map(id => {
            const ind = INDICATORS_LIST.find(x => x.id === id);
            if (!ind) return null;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: ind.color, opacity: 0.8 }}>
                <div style={{ width: 8, height: 2, background: ind.color, borderRadius: 1 }} />
                {ind.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
