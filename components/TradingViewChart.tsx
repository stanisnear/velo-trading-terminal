
import React, { useEffect, useRef, useState, memo } from 'react';
import { Position } from '../types';

// Map VELO pair IDs to TradingView symbols
const TV_SYMBOLS: Record<string, string> = {
  'BTC/USD': 'BINANCE:BTCUSDT',
  'ETH/USD': 'BINANCE:ETHUSDT',
  'SOL/USD': 'BINANCE:SOLUSDT',
  'AVAX/USD': 'BINANCE:AVAXUSDT',
  'LINK/USD': 'BINANCE:LINKUSDT',
  'DOGE/USD': 'BINANCE:DOGEUSDT',
  'NEAR/USD': 'BINANCE:NEARUSDT',
  'INJ/USD': 'BINANCE:INJUSDT',
  'RNDR/USD': 'BINANCE:RENDERUSDT',
  'TIA/USD': 'BINANCE:TIAUSDT',
  'WIF/USD': 'BINANCE:WIFUSDT',
  'JUP/USD': 'BYBIT:JUPUSDT',
  'BONK/USD': 'BINANCE:BONKUSDT',
  'PEPE/USD': 'BINANCE:PEPEUSDT',
  'PYTH/USD': 'BINANCE:PYTHUSDT',
  'SUI/USD': 'BINANCE:SUIUSDT',
};

// Map VELO timeframes to TradingView intervals
const TV_INTERVALS: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1H': '60',
  '4H': '240',
  '1D': 'D',
};

interface TradingViewChartProps {
  initialData?: any[];
  theme: 'light' | 'dark';
  pairName: string;
  currentPrice: number;
  activePosition?: Position | null;
  onTimeframeChange?: (tf: string) => void;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = memo(({ theme, pairName, currentPrice, activePosition, onTimeframeChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState('15m');
  const widgetId = useRef(`tv_${Math.random().toString(36).slice(2)}`);

  const tvSymbol = TV_SYMBOLS[pairName] || 'BINANCE:BTCUSDT';
  const tvInterval = TV_INTERVALS[timeframe] || '15';

  // Load TradingView widget
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous widget
    containerRef.current.innerHTML = '';

    // Create widget container
    const widgetDiv = document.createElement('div');
    widgetDiv.id = widgetId.current;
    widgetDiv.style.width = '100%';
    widgetDiv.style.height = '100%';
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof (window as any).TradingView === 'undefined') return;
      
      new (window as any).TradingView.widget({
        container_id: widgetId.current,
        symbol: tvSymbol,
        interval: tvInterval,
        timezone: 'Etc/UTC',
        theme: theme === 'dark' ? 'dark' : 'light',
        style: '1', // Candlestick
        locale: 'en',
        toolbar_bg: theme === 'dark' ? '#0a0a0a' : '#ffffff',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: true,
        studies: ['STD;SMA'],
        withdateranges: true,
        hide_side_toolbar: false,
        details: false,
        hotlist: false,
        calendar: false,
        studies_overrides: {
          'moving average.length': 20,
          'moving average.plot.color': '#8b5cf6',
        },
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#10b981',
          'mainSeriesProperties.candleStyle.downColor': '#ef4444',
          'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
          'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
          'paneProperties.background': theme === 'dark' ? '#0a0a0a' : '#ffffff',
          'paneProperties.vertGridProperties.color': theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          'paneProperties.horzGridProperties.color': theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          'scalesProperties.textColor': theme === 'dark' ? '#9ca3af' : '#6b7280',
        },
        loading_screen: { backgroundColor: theme === 'dark' ? '#0a0a0a' : '#ffffff', foregroundColor: '#3b82f6' },
        autosize: true,
        width: '100%',
        height: '100%',
      });
    };

    document.head.appendChild(script);

    return () => {
      try { document.head.removeChild(script); } catch(e) {}
    };
  }, [tvSymbol, tvInterval, theme]);

  const handleTimeframeChange = (tf: string) => {
    setTimeframe(tf);
    if (onTimeframeChange) onTimeframeChange(tf);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Minimal toolbar - just timeframes since TradingView has its own toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-200 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-1 pr-3 border-r border-gray-200 dark:border-white/10 hidden md:flex">
          <span className="font-bold text-gray-900 dark:text-white text-sm">{pairName}</span>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {Object.keys(TV_INTERVALS).map((tf) => (
            <button 
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                timeframe === tf 
                  ? 'bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20' 
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {/* Price display */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-gray-900 dark:text-white">
            ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}
          </span>
        </div>
      </div>
      {/* TradingView Widget */}
      <div ref={containerRef} className="flex-1 min-h-0" />
      {/* Position overlay info */}
      {activePosition && (
        <div className="absolute bottom-2 left-2 z-20 flex gap-2 text-[10px] font-bold">
          <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded backdrop-blur-sm">
            ENTRY ${activePosition.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          {activePosition.takeProfit && (
            <span className="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded backdrop-blur-sm">
              TP ${activePosition.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
          {activePosition.stopLoss && (
            <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded backdrop-blur-sm">
              SL ${activePosition.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
          <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded backdrop-blur-sm">
            LIQ ${activePosition.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
});
