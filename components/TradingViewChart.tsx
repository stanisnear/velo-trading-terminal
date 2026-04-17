
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
    createChart, ColorType, IChartApi, ISeriesApi, LineStyle, CrosshairMode,
    CandlestickSeries, AreaSeries, LineSeries, HistogramSeries, Time
} from 'lightweight-charts';
import { Candle, ChartTimeframe, ChartStyle, Position } from '../types';
import { BarChart2, Activity, Layers, ChevronDown, TrendingUp, Volume2 } from 'lucide-react';

interface TradingViewChartProps {
  initialData: Candle[];
  theme: 'light' | 'dark';
  pairName: string;
  currentPrice: number;
  activePosition?: Position | null;
  onTimeframeChange?: (tf: ChartTimeframe) => void;
}

interface IndicatorConfig {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  period?: number;
}

const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: 'sma20', name: 'SMA 20', enabled: true, color: '#8b5cf6', period: 20 },
  { id: 'sma50', name: 'SMA 50', enabled: false, color: '#f59e0b', period: 50 },
  { id: 'ema12', name: 'EMA 12', enabled: false, color: '#06b6d4', period: 12 },
  { id: 'ema26', name: 'EMA 26', enabled: false, color: '#ec4899', period: 26 },
  { id: 'bb', name: 'Bollinger Bands', enabled: false, color: '#6366f1', period: 20 },
];

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ initialData, theme, pairName, currentPrice, activePosition, onTimeframeChange }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<any[]>([]);
  const volumeSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);

  const [chartStyle, setChartStyle] = useState<ChartStyle>('CANDLES');
  const [indicators, setIndicators] = useState<IndicatorConfig[]>(DEFAULT_INDICATORS);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('15m');

  const colors = {
    background: 'transparent',
    text: theme === 'dark' ? '#9ca3af' : '#4b5563',
    grid: theme === 'dark' ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.025)',
    up: '#10b981',
    down: '#ef4444',
  };

  const handleTimeframeChange = (tf: ChartTimeframe) => {
    setTimeframe(tf);
    if (onTimeframeChange) onTimeframeChange(tf);
  };

  const toggleIndicator = (id: string) => {
    setIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, enabled: !ind.enabled } : ind));
  };

  // Create chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!entries?.[0]?.contentRect || !chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) chartRef.current.applyOptions({ width, height });
      });
    });
    resizeObserver.observe(chartContainerRef.current);

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: colors.background }, textColor: colors.text, fontFamily: "'-apple-system', 'SF Pro Display', sans-serif" },
      width: chartContainerRef.current.clientWidth || 600,
      height: chartContainerRef.current.clientHeight || 400,
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: colors.grid },
      rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.15, bottom: 0.25 } },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) { chart.remove(); chartRef.current = null; }
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRef.current = [];
    };
  }, []);

  // Update series when data/style/indicators change
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    // Remove old series
    if (seriesRef.current) { try { chart.removeSeries(seriesRef.current); } catch(e) {} seriesRef.current = null; }
    if (volumeSeriesRef.current) { try { chart.removeSeries(volumeSeriesRef.current); } catch(e) {} volumeSeriesRef.current = null; }
    indicatorSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch(e) {} });
    indicatorSeriesRef.current = [];

    if (!initialData || initialData.length === 0) return;

    // Main series
    let newSeries: any;
    if (chartStyle === 'CANDLES') {
      newSeries = chart.addSeries(CandlestickSeries, { upColor: colors.up, downColor: colors.down, borderVisible: false, wickUpColor: colors.up, wickDownColor: colors.down });
      newSeries.setData(initialData.map(d => ({ time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close })));
    } else if (chartStyle === 'AREA') {
      newSeries = chart.addSeries(AreaSeries, { lineColor: '#3b82f6', topColor: 'rgba(59, 130, 246, 0.3)', bottomColor: 'rgba(59, 130, 246, 0.0)', lineWidth: 2 });
      newSeries.setData(initialData.map(d => ({ time: d.time as Time, value: d.close })));
    } else {
      newSeries = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
      newSeries.setData(initialData.map(d => ({ time: d.time as Time, value: d.close })));
    }
    seriesRef.current = newSeries;

    // Volume
    if (showVolume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(initialData.map(d => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
      })));
      volumeSeriesRef.current = volSeries;
    }

    // Indicators
    indicators.filter(i => i.enabled).forEach(ind => {
      if (ind.id.startsWith('sma') && ind.period) {
        const smaData = calculateSMA(initialData, ind.period);
        if (smaData.length > 0) {
          const s = chart.addSeries(LineSeries, { color: ind.color, lineWidth: 1, title: ind.name, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false });
          s.setData(smaData);
          indicatorSeriesRef.current.push(s);
        }
      }
      if (ind.id.startsWith('ema') && ind.period) {
        const emaData = calculateEMA(initialData, ind.period);
        if (emaData.length > 0) {
          const s = chart.addSeries(LineSeries, { color: ind.color, lineWidth: 1, title: ind.name, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false });
          s.setData(emaData);
          indicatorSeriesRef.current.push(s);
        }
      }
      if (ind.id === 'bb' && ind.period) {
        const bbData = calculateBollingerBands(initialData, ind.period);
        if (bbData.length > 0) {
          const upper = chart.addSeries(LineSeries, { color: ind.color, lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Upper', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
          upper.setData(bbData.map(d => ({ time: d.time, value: d.upper })));
          const lower = chart.addSeries(LineSeries, { color: ind.color, lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'BB Lower', crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
          lower.setData(bbData.map(d => ({ time: d.time, value: d.lower })));
          const middle = chart.addSeries(LineSeries, { color: ind.color, lineWidth: 1, title: 'BB Mid', crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false });
          middle.setData(bbData.map(d => ({ time: d.time, value: d.middle })));
          indicatorSeriesRef.current.push(upper, lower, middle);
        }
      }
    });

    chart.applyOptions({ layout: { textColor: colors.text } });
    updatePriceLines(activePosition);
  }, [chartStyle, indicators, initialData, pairName, theme, showVolume]);

  // Update current price
  useEffect(() => {
    if (!seriesRef.current || !initialData || initialData.length === 0) return;
    const lastCandle = initialData[initialData.length - 1];
    if (!lastCandle) return;
    try {
      if (chartStyle === 'CANDLES') {
        seriesRef.current.update({ time: lastCandle.time as Time, open: lastCandle.open, high: Math.max(lastCandle.high, currentPrice), low: Math.min(lastCandle.low, currentPrice), close: currentPrice });
      } else {
        seriesRef.current.update({ time: lastCandle.time as Time, value: currentPrice });
      }
    } catch(e) {}
  }, [currentPrice]);

  const updatePriceLines = useCallback((position?: Position | null) => {
    if (!seriesRef.current) return;
    priceLinesRef.current.forEach(line => { try { seriesRef.current?.removePriceLine(line); } catch(e) {} });
    priceLinesRef.current = [];
    if (!position) return;
    const lines = [
      { price: position.entryPrice, color: '#3b82f6', title: 'ENTRY', style: LineStyle.Dotted },
      position.takeProfit ? { price: position.takeProfit, color: '#10b981', title: 'TP', style: LineStyle.Dashed } : null,
      position.stopLoss ? { price: position.stopLoss, color: '#ef4444', title: 'SL', style: LineStyle.Dashed } : null,
      { price: position.liquidationPrice, color: '#f59e0b', title: 'LIQ', style: LineStyle.SparseDotted },
    ].filter(Boolean);
    lines.forEach(l => {
      if (!l) return;
      try {
        const lineObj = seriesRef.current?.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.style, axisLabelVisible: true, title: l.title });
        if (lineObj) priceLinesRef.current.push(lineObj);
      } catch(e) {}
    });
  }, []);

  useEffect(() => { updatePriceLines(activePosition); }, [activePosition, updatePriceLines]);

  const enabledCount = indicators.filter(i => i.enabled).length;

  return (
    <div className="flex flex-col h-full relative group">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md z-10 rounded-t-3xl flex-wrap">
        <div className="flex items-center gap-1 pr-3 border-r border-gray-200 dark:border-white/10 hidden md:flex">
          <span className="font-bold text-gray-900 dark:text-white text-sm">{pairName}</span>
        </div>
        {/* Timeframes */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {(['1m', '5m', '15m', '1H', '4H', '1D'] as ChartTimeframe[]).map((tf) => (
            <button key={tf} onClick={() => handleTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${timeframe === tf ? 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
              {tf}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
        {/* Chart types */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setChartStyle('CANDLES')} className={`p-1.5 rounded-lg transition-colors ${chartStyle === 'CANDLES' ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-300'}`}>
            <BarChart2 size={16} className="rotate-90"/>
          </button>
          <button onClick={() => setChartStyle('AREA')} className={`p-1.5 rounded-lg transition-colors ${chartStyle === 'AREA' ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-300'}`}>
            <Activity size={16}/>
          </button>
          <button onClick={() => setChartStyle('LINE')} className={`p-1.5 rounded-lg transition-colors ${chartStyle === 'LINE' ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-300'}`}>
            <TrendingUp size={16}/>
          </button>
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
        {/* Volume toggle */}
        <button onClick={() => setShowVolume(!showVolume)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all ${showVolume ? 'text-blue-500 bg-blue-500/10' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
          <Volume2 size={13}/> <span className="hidden sm:inline">Vol</span>
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1" />
        {/* Indicators dropdown */}
        <div className="relative">
          <button onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${enabledCount > 0 ? 'text-purple-500 bg-purple-500/10' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>
            <Layers size={13}/>
            <span className="hidden sm:inline">Indicators</span>
            {enabledCount > 0 && <span className="bg-purple-500 text-white text-[9px] px-1.5 rounded-full">{enabledCount}</span>}
            <ChevronDown size={12}/>
          </button>
          {showIndicatorMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowIndicatorMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-40 min-w-[200px] py-1 animate-fade-in">
                {indicators.map(ind => (
                  <button key={ind.id} onClick={() => toggleIndicator(ind.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left">
                    <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${ind.enabled ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                      {ind.enabled && <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={4}><path d="M20 6 9 17l-5-5"/></svg>}
                    </div>
                    <div className="w-3 h-0.5 rounded" style={{ background: ind.color }} />
                    <span className="text-xs font-medium text-gray-900 dark:text-white">{ind.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* Active indicator pills */}
        {indicators.filter(i => i.enabled).map(ind => (
          <span key={ind.id} className="hidden lg:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ color: ind.color, background: ind.color + '15' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: ind.color }} />
            {ind.name}
          </span>
        ))}
      </div>
      {/* Chart */}
      <div ref={chartContainerRef} className="flex-1 w-full h-full min-h-[300px] bg-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.015] text-8xl font-black text-gray-900 dark:text-white select-none">VELO</div>
    </div>
  );
};

// ─── INDICATOR CALCULATIONS ────────────────────────────────────────────
function calculateSMA(data: Candle[], period: number) {
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    sma.push({ time: data[i].time as Time, value: sum / period });
  }
  return sma;
}

function calculateEMA(data: Candle[], period: number) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  const result = [{ time: data[period - 1].time as Time, value: ema }];
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time as Time, value: ema });
  }
  return result;
}

function calculateBollingerBands(data: Candle[], period: number, stdDev: number = 2) {
  const result: { time: Time; upper: number; middle: number; lower: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += Math.pow(data[i - j].close - mean, 2);
    const std = Math.sqrt(variance / period);
    result.push({ time: data[i].time as Time, middle: mean, upper: mean + stdDev * std, lower: mean - stdDev * std });
  }
  return result;
}
