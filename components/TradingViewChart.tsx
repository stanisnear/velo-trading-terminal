
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
    createChart, 
    ColorType, 
    IChartApi, 
    ISeriesApi, 
    LineStyle, 
    CrosshairMode,
    CandlestickSeries,
    AreaSeries,
    LineSeries,
    Time
} from 'lightweight-charts';
import { Candle, ChartTimeframe, ChartStyle, Position } from '../types';
import { BarChart2, Activity, Layers } from 'lucide-react';

interface TradingViewChartProps {
  initialData: Candle[];
  theme: 'light' | 'dark';
  pairName: string;
  currentPrice: number;
  activePosition?: Position | null;
  onTimeframeChange?: (tf: ChartTimeframe) => void;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ initialData, theme, pairName, currentPrice, activePosition, onTimeframeChange }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | ISeriesApi<"Line"> | null>(null);
  const smaSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  const [chartStyle, setChartStyle] = useState<ChartStyle>('CANDLES');
  const [showIndicators, setShowIndicators] = useState({ sma: true });
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('15m');

  const colors = {
    background: 'transparent',
    text: theme === 'dark' ? '#9ca3af' : '#4b5563',
    grid: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
    up: '#10b981',
    down: '#ef4444',
  };

  const handleTimeframeChange = (tf: ChartTimeframe) => {
      setTimeframe(tf);
      if (onTimeframeChange) {
          onTimeframeChange(tf);
      }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
        window.requestAnimationFrame(() => {
            if (!entries || entries.length === 0 || !entries[0].contentRect) return;
            if (chartRef.current) {
                const { width, height } = entries[0].contentRect;
                if(width > 0 && height > 0) {
                    chartRef.current.applyOptions({ width, height });
                }
            }
        });
    });

    resizeObserver.observe(chartContainerRef.current);

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      },
      width: chartContainerRef.current.clientWidth || 600,
      height: chartContainerRef.current.clientHeight || 400,
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: colors.grid,
      },
      rightPriceScale: {
        borderColor: colors.grid,
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      crosshair: {
          mode: CrosshairMode.Normal,
      }
    });

    chartRef.current = chart;

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
          chart.remove();
          chartRef.current = null;
      }
      seriesRef.current = null;
      smaSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current); } catch(e) {}
        seriesRef.current = null;
    }
    if (smaSeriesRef.current) {
        try { chart.removeSeries(smaSeriesRef.current); } catch(e) {}
        smaSeriesRef.current = null;
    }

    let newSeries: any;
    
    if (chartStyle === 'CANDLES') {
        newSeries = chart.addSeries(CandlestickSeries, {
            upColor: colors.up,
            downColor: colors.down,
            borderVisible: false,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
        });
        if (initialData && initialData.length > 0) {
             const mapData = initialData.map(d => ({
                 time: d.time as Time,
                 open: d.open,
                 high: d.high,
                 low: d.low,
                 close: d.close
             }));
             newSeries.setData(mapData);
        }
    } else if (chartStyle === 'AREA') {
        newSeries = chart.addSeries(AreaSeries, {
            lineColor: '#3b82f6',
            topColor: 'rgba(59, 130, 246, 0.4)',
            bottomColor: 'rgba(59, 130, 246, 0.0)',
            lineWidth: 2,
        });
        if (initialData && initialData.length > 0) {
            newSeries.setData(initialData.map(d => ({ time: d.time as Time, value: d.close })));
        }
    } else {
        newSeries = chart.addSeries(LineSeries, {
            color: '#3b82f6',
            lineWidth: 2,
        });
        if (initialData && initialData.length > 0) {
            newSeries.setData(initialData.map(d => ({ time: d.time as Time, value: d.close })));
        }
    }
    
    seriesRef.current = newSeries;

    if (showIndicators.sma) {
        const smaSeries = chart.addSeries(LineSeries, {
            color: '#8b5cf6',
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            title: 'SMA 20',
            crosshairMarkerVisible: false
        });
        if (initialData && initialData.length > 0) {
            const smaData = calculateSMA(initialData, 20);
            smaSeries.setData(smaData);
        }
        smaSeriesRef.current = smaSeries;
    }

    chart.applyOptions({
        layout: { textColor: colors.text }
    });

    updatePriceLines(activePosition);

  }, [chartStyle, showIndicators, initialData, pairName, theme]);

  useEffect(() => {
    if (!seriesRef.current || !initialData || initialData.length === 0) return;
    
    const lastCandle = initialData[initialData.length - 1];
    if (!lastCandle) return;

    const updatedTime = lastCandle.time as Time;

    try {
        if (chartStyle === 'CANDLES') {
            const updatedData = {
                time: updatedTime,
                open: lastCandle.open,
                high: Math.max(lastCandle.high, currentPrice),
                low: Math.min(lastCandle.low, currentPrice),
                close: currentPrice
            };
            seriesRef.current.update(updatedData);
        } else {
            seriesRef.current.update({ time: updatedTime, value: currentPrice });
        }
    } catch(e) {
        // Ignore
    }
  }, [currentPrice]);

  const updatePriceLines = useCallback((position?: Position | null) => {
      if (!seriesRef.current) return;

      priceLinesRef.current.forEach(line => {
          try { seriesRef.current?.removePriceLine(line); } catch(e) {}
      });
      priceLinesRef.current = [];

      if (!position) return;

      const lines = [
          { price: position.entryPrice, color: '#3b82f6', title: 'ENTRY', style: LineStyle.Dotted },
          position.takeProfit ? { price: position.takeProfit, color: '#10b981', title: 'TP', style: LineStyle.Dashed } : null,
          position.stopLoss ? { price: position.stopLoss, color: '#ef4444', title: 'SL', style: LineStyle.Dashed } : null,
      ].filter(Boolean);

      lines.forEach(l => {
          if(!l) return;
          try {
              const lineObj = seriesRef.current?.createPriceLine({
                  price: l.price,
                  color: l.color,
                  lineWidth: 1,
                  lineStyle: l.style,
                  axisLabelVisible: true,
                  title: l.title,
              });
              if(lineObj) priceLinesRef.current.push(lineObj);
          } catch(e) {}
      });
  }, []);

  useEffect(() => {
    updatePriceLines(activePosition);
  }, [activePosition, updatePriceLines]);

  return (
    <div className="flex flex-col h-full relative group">
        <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md z-10 rounded-t-3xl">
            <div className="flex items-center gap-2 pr-4 border-r border-gray-200 dark:border-white/10 hidden md:flex">
                 <span className="font-bold text-gray-900 dark:text-white text-sm">{pairName}</span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {['1m', '5m', '15m', '1H', '4H', '1D'].map((tf) => (
                    <button 
                        key={tf}
                        onClick={() => handleTimeframeChange(tf as ChartTimeframe)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${timeframe === tf ? 'bg-white/10 text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
                    >
                        {tf}
                    </button>
                ))}
            </div>
            <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1"></div>
            <div className="flex items-center gap-1">
                 <button onClick={() => setChartStyle('CANDLES')} className={`p-1.5 rounded-lg transition-colors ${chartStyle === 'CANDLES' ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                     <BarChart2 size={18} className="rotate-90"/>
                 </button>
                 <button onClick={() => setChartStyle('AREA')} className={`p-1.5 rounded-lg transition-colors ${chartStyle === 'AREA' ? 'text-blue-500 bg-blue-500/10' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                     <Activity size={18}/>
                 </button>
            </div>
            <div className="w-px h-4 bg-gray-200 dark:bg-white/10 mx-1"></div>
            <button 
                onClick={() => setShowIndicators(prev => ({ ...prev, sma: !prev.sma }))}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${showIndicators.sma ? 'text-purple-500 bg-purple-500/10' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}
            >
                <Layers size={14}/>
                <span className="hidden sm:inline">SMA</span>
            </button>
        </div>
        <div ref={chartContainerRef} className="flex-1 w-full h-full min-h-[300px] bg-transparent" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.02] text-8xl font-black text-gray-900 dark:text-white select-none">
            VELO
        </div>
    </div>
  );
};

function calculateSMA(data: Candle[], period: number) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({ time: data[i].time as Time, value: sum / period });
    }
    return sma;
}
