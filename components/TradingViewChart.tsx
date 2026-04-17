
import React, { useEffect, useRef, useState, memo } from 'react';
import { Position } from '../types';

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

const TV_INTERVALS: Record<string, string> = {
  '1m': '1', '5m': '5', '15m': '15', '1H': '60', '4H': '240', '1D': 'D',
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
  const scriptLoadedRef = useRef(false);

  const tvSymbol = TV_SYMBOLS[pairName] || 'BINANCE:BTCUSDT';
  const tvInterval = TV_INTERVALS[timeframe] || '15';

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const createWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      
      const widgetDiv = document.createElement('div');
      widgetDiv.id = 'tv_chart_' + Date.now();
      widgetDiv.style.width = '100%';
      widgetDiv.style.height = '100%';
      containerRef.current.appendChild(widgetDiv);

      try {
        new (window as any).TradingView.widget({
          container_id: widgetDiv.id,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: theme === 'dark' ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          enable_publishing: false,
          allow_symbol_change: false,
          hide_top_toolbar: false,
          hide_legend: false,
          save_image: true,
          withdateranges: true,
          hide_side_toolbar: false,
          details: false,
          hotlist: false,
          calendar: false,
          studies: ['STD;SMA'],
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
            'paneProperties.background': theme === 'dark' ? '#080808' : '#ffffff',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
            'paneProperties.horzGridProperties.color': theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)',
            'scalesProperties.textColor': theme === 'dark' ? '#666' : '#999',
            'scalesProperties.backgroundColor': theme === 'dark' ? '#080808' : '#ffffff',
            'scalesProperties.lineColor': theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
            'mainSeriesProperties.priceLineColor': '#3b82f6',
          },
          loading_screen: { backgroundColor: theme === 'dark' ? '#080808' : '#ffffff', foregroundColor: '#3b82f6' },
          autosize: true,
        });
      } catch(e) {
        console.warn('TradingView widget creation failed:', e);
      }
    };

    if (scriptLoadedRef.current && (window as any).TradingView) {
      createWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        scriptLoadedRef.current = true;
        createWidget();
      };
      document.head.appendChild(script);
    }
  }, [tvSymbol, tvInterval, theme]);

  const handleTf = (tf: string) => {
    setTimeframe(tf);
    onTimeframeChange?.(tf);
  };

  return (
    <div className="flex flex-col h-full relative bg-[#080808] dark:bg-[#080808] bg-white">
      {/* Compact timeframe bar that matches VELO style */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-white/[0.04] shrink-0 bg-white dark:bg-[#080808]">
        <span className="font-bold text-white text-xs mr-2 hidden md:block">{pairName}</span>
        {Object.keys(TV_INTERVALS).map(tf => (
          <button key={tf} onClick={() => handleTf(tf)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              timeframe === tf 
                ? 'bg-blue-500/15 text-blue-400' 
                : 'text-gray-600 hover:text-gray-300'
            }`}>{tf}</button>
        ))}
        <div className="ml-auto text-xs font-mono font-bold text-white">
          ${currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 }) || '—'}
        </div>
      </div>
      {/* TradingView Chart */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
      {/* Position info pills */}
      {activePosition && (
        <div className="absolute bottom-1 left-1 z-20 flex gap-1 text-[9px] font-bold pointer-events-none">
          <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
            {activePosition.side} @ ${activePosition.entryPrice.toLocaleString()}
          </span>
          {activePosition.takeProfit && (
            <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
              TP ${activePosition.takeProfit.toLocaleString()}
            </span>
          )}
          {activePosition.stopLoss && (
            <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
              SL ${activePosition.stopLoss.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
