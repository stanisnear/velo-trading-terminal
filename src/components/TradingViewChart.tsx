
import React, { useEffect, useRef, useState, memo } from 'react';
import { Position } from '../utils/types';

const TV_SYMBOLS: Record<string, string> = {
  'BTC/USD': 'BINANCE:BTCUSDT', 'ETH/USD': 'BINANCE:ETHUSDT',
  'SOL/USD': 'BINANCE:SOLUSDT', 'AVAX/USD': 'BINANCE:AVAXUSDT',
  'LINK/USD': 'BINANCE:LINKUSDT', 'DOGE/USD': 'BINANCE:DOGEUSDT',
  'NEAR/USD': 'BINANCE:NEARUSDT', 'INJ/USD': 'BINANCE:INJUSDT',
  'RNDR/USD': 'BINANCE:RENDERUSDT', 'TIA/USD': 'BINANCE:TIAUSDT',
  'WIF/USD': 'BINANCE:WIFUSDT', 'JUP/USD': 'BYBIT:JUPUSDT',
  'BONK/USD': 'BINANCE:BONKUSDT', 'PEPE/USD': 'BINANCE:PEPEUSDT',
  'PYTH/USD': 'BINANCE:PYTHUSDT', 'SUI/USD': 'BINANCE:SUIUSDT',
  'WLFI/USD': 'BYBIT:WLFIUSDT',
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
  const widgetRef = useRef<any>(null);

  const tvSymbol = TV_SYMBOLS[pairName] || 'BINANCE:BTCUSDT';
  const tvInterval = TV_INTERVALS[timeframe] || '15';
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!containerRef.current) return;

    const createWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      
      const widgetDiv = document.createElement('div');
      widgetDiv.id = 'tv_' + Date.now();
      widgetDiv.style.width = '100%';
      widgetDiv.style.height = '100%';
      containerRef.current.appendChild(widgetDiv);

      try {
        widgetRef.current = new (window as any).TradingView.widget({
          container_id: widgetDiv.id,
          symbol: tvSymbol,
          interval: tvInterval,
          timezone: 'Etc/UTC',
          theme: isDark ? 'dark' : 'light',
          style: '1',
          locale: 'en',
          enable_publishing: false,
          allow_symbol_change: false,
          // Clean UI — hide what's not needed (Binance-style)
          hide_top_toolbar: false,
          hide_legend: false,
          hide_side_toolbar: false,
          save_image: false,
          withdateranges: false,
          details: false,
          hotlist: false,
          calendar: false,
          show_popup_button: false,
          popup_width: '1000',
          popup_height: '650',
          studies: [],
          disabled_features: [
            'header_symbol_search',
            'header_compare',
            'header_undo_redo',
            'header_screenshot',
            'header_saveload',
            'symbol_search_hot_key',
            'display_market_status',
            'compare_symbol',
            'border_around_the_chart',
            'remove_library_container_border',
            'go_to_date',
            'timeframes_toolbar',
          ],
          enabled_features: [
            'hide_left_toolbar_by_default',
            'side_toolbar_in_fullscreen_mode',
          ],
          overrides: {
            'mainSeriesProperties.candleStyle.upColor': '#10b981',
            'mainSeriesProperties.candleStyle.downColor': '#ef4444',
            'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
            'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
            'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            'paneProperties.background': isDark ? '#080808' : '#ffffff',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)',
            'paneProperties.horzGridProperties.color': isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)',
            'scalesProperties.textColor': isDark ? '#555' : '#999',
            'scalesProperties.backgroundColor': isDark ? '#080808' : '#ffffff',
            'scalesProperties.lineColor': isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)',
            'mainSeriesProperties.priceLineColor': '#3b82f6',
            'mainSeriesProperties.priceLineWidth': 1,
          },
          loading_screen: {
            backgroundColor: isDark ? '#080808' : '#ffffff',
            foregroundColor: '#3b82f6',
          },
          autosize: true,
        });
      } catch(e) {
        console.warn('TradingView widget error:', e);
      }
    };

    if (scriptLoadedRef.current && (window as any).TradingView) {
      createWidget();
    } else {
      const existing = document.querySelector('script[src*="tradingview.com/tv.js"]');
      if (existing) {
        scriptLoadedRef.current = true;
        createWidget();
      } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = () => { scriptLoadedRef.current = true; createWidget(); };
        document.head.appendChild(script);
      }
    }

    return () => { widgetRef.current = null; };
  }, [tvSymbol, tvInterval, isDark]);

  const handleTf = (tf: string) => {
    setTimeframe(tf);
    onTimeframeChange?.(tf);
  };

  return (
    <div className={`flex flex-col h-full relative ${isDark ? 'bg-[#080808]' : 'bg-white'}`}>
      {/* Timeframe bar */}
      <div className={`flex items-center gap-0.5 px-2 py-1 border-b shrink-0 ${isDark ? 'border-white/[0.04] bg-[#0a0a0a]' : 'border-gray-200 bg-gray-50'}`}>
        <span className={`font-bold text-xs mr-2 hidden md:block ${isDark ? 'text-white' : 'text-gray-900'}`}>{pairName}</span>
        {Object.keys(TV_INTERVALS).map(tf => (
          <button key={tf} onClick={() => handleTf(tf)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
              timeframe === tf 
                ? isDark ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-500/10 text-blue-600'
                : isDark ? 'text-gray-600 hover:text-gray-300' : 'text-gray-400 hover:text-gray-700'
            }`}>{tf}</button>
        ))}
      </div>
      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
      {/* Position pills */}
      {activePosition && (
        <div className="absolute bottom-1 left-12 z-20 flex gap-1 text-[9px] font-bold pointer-events-none">
          <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
            {activePosition.side} @ ${activePosition.entryPrice?.toLocaleString()}
          </span>
          {activePosition.takeProfit && (
            <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
              TP ${activePosition.takeProfit?.toLocaleString()}
            </span>
          )}
          {activePosition.stopLoss && (
            <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded backdrop-blur-sm">
              SL ${activePosition.stopLoss?.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
