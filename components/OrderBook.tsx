
import React, { useMemo, useState } from 'react';

interface OrderBookProps {
  price: number;
  pair: string;
  rows?: number;
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair, rows = 20 }) => {
  const [grouping, setGrouping] = useState(0.01);

  const { asks, bids } = useMemo(() => {
    const safePrice = price || 0; 
    const askItems = [];
    const bidItems = [];
    
    // Dynamic spread based on price magnitude
    const spread = safePrice * 0.0002; 
    const step = grouping || 0.01;
    
    // Generate mock order book data
    const rowCount = rows; 
    for (let i = 0; i < rowCount; i++) { 
      const askPrice = safePrice + spread + (i * step);
      const askSize = Math.random() * 1000 + 100 + (i * 50);
      askItems.push({ price: askPrice, size: askSize });
      
      const bidPrice = safePrice - spread - (i * step);
      const bidSize = Math.random() * 1000 + 100 + (i * 50);
      bidItems.push({ price: bidPrice, size: bidSize });
    }
    return { asks: askItems.reverse(), bids: bidItems }; 
  }, [price, pair, grouping, rows]);

  const formatPrice = (val: number) => {
      if (val === 0) return "0.00";
      if (val < 0.0001) return val.toFixed(8);
      if (val < 0.01) return val.toFixed(6);
      if (val < 1) return val.toFixed(4);
      return val.toFixed(2);
  };

  // Auto-adjust grouping options based on price
  const isSmallPrice = price < 1;

  if (!price || price <= 0) {
      return (
          <div className="flex items-center justify-center h-full w-full bg-white/50 dark:bg-[#121212]/50">
              <div className="animate-pulse text-xs font-bold text-gray-400">Loading Orderbook...</div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full w-full text-[10px] font-mono select-none overflow-hidden bg-white/50 dark:bg-[#121212]/50">
      <div className="flex justify-between items-center mb-1 px-2 border-b border-gray-200 dark:border-white/5 py-2 shrink-0">
        <span className="text-gray-500 font-bold uppercase">Order Book</span>
        <select 
            value={grouping} 
            onChange={(e) => setGrouping(parseFloat(e.target.value))}
            className="bg-transparent text-gray-900 dark:text-gray-400 outline-none text-[10px] cursor-pointer hover:text-blue-500 font-bold"
        >
            {isSmallPrice && <option value={0.000001}>0.000001</option>}
            {isSmallPrice && <option value={0.0001}>0.0001</option>}
            <option value={0.01}>0.01</option>
            <option value={0.1}>0.1</option>
            <option value={1}>1.0</option>
        </select>
      </div>
      
      <div className="flex justify-between text-gray-400 mb-1 px-2 text-[9px] uppercase tracking-wide shrink-0 font-bold">
        <span>Price (USD)</span>
        <span>Size (USDT)</span>
      </div>
      
      {/* Container for Asks and Bids */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          
          {/* Asks (Red) - Sell Orders */}
          <div className="flex-1 flex flex-col justify-end overflow-hidden pb-1">
            <div className="space-y-[1px]">
                {asks.map((ask, i) => (
                <div key={`ask-${i}`} className="flex justify-between relative group cursor-pointer hover:bg-red-500/10 px-2 rounded-[2px] items-center h-4">
                    <span className="text-red-500 font-medium z-10">{formatPrice(ask.price)}</span>
                    <span className="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white z-10">{ask.size.toFixed(0)}</span>
                    <div className="absolute right-0 top-0 bottom-0 bg-red-500/5 dark:bg-red-500/10 transition-all duration-300" style={{ width: `${Math.min((ask.size/2000)*100, 100)}%` }}></div>
                </div>
                ))}
            </div>
          </div>

          {/* Current Spread/Mid Section */}
          <div className="h-px bg-gray-200 dark:bg-white/10 my-1 shrink-0 w-full"></div>

          {/* Bids (Green) - Buy Orders */}
          <div className="flex-1 overflow-hidden pt-1">
            <div className="space-y-[1px]">
                {bids.map((bid, i) => (
                <div key={`bid-${i}`} className="flex justify-between relative group cursor-pointer hover:bg-emerald-500/10 px-2 rounded-[2px] items-center h-4">
                    <span className="text-emerald-500 font-medium z-10">{formatPrice(bid.price)}</span>
                    <span className="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white z-10">{bid.size.toFixed(0)}</span>
                    <div className="absolute right-0 top-0 bottom-0 bg-emerald-500/5 dark:bg-emerald-500/10 transition-all duration-300" style={{ width: `${Math.min((bid.size/2000)*100, 100)}%` }}></div>
                </div>
                ))}
            </div>
          </div>
      </div>
    </div>
  );
};
