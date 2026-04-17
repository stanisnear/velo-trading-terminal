
import React, { useMemo, useState, useEffect } from 'react';

interface OrderBookProps {
  price: number;
  pair: string;
  rows?: number;
}

function getGroupingOptions(price: number) {
  if (price >= 10000) return [1, 5, 10, 50, 100];
  if (price >= 1000) return [0.1, 0.5, 1, 5, 10];
  if (price >= 100) return [0.01, 0.1, 0.5, 1, 5];
  if (price >= 10) return [0.01, 0.05, 0.1, 0.5, 1];
  if (price >= 1) return [0.001, 0.01, 0.05, 0.1];
  if (price >= 0.01) return [0.0001, 0.001, 0.01];
  if (price >= 0.0001) return [0.000001, 0.00001, 0.0001];
  return [0.00000001, 0.0000001, 0.000001];
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export const OrderBook: React.FC<OrderBookProps> = ({ price, pair, rows = 16 }) => {
  const [grouping, setGrouping] = useState(0.01);

  useEffect(() => {
    const options = getGroupingOptions(price);
    setGrouping(options[0]);
  }, [pair]);

  const groupingOptions = useMemo(() => getGroupingOptions(price), [price]);

  const { asks, bids, spread } = useMemo(() => {
    if (!price || price <= 0) return { asks: [] as any[], bids: [] as any[], spread: 0 };
    
    const step = grouping;
    const askItems: { price: number; size: number; total: number }[] = [];
    const bidItems: { price: number; size: number; total: number }[] = [];
    const midRounded = Math.ceil(price / step) * step;
    
    let cumAsk = 0, cumBid = 0;
    const seed = Math.floor(price * 100);
    
    for (let i = 0; i < rows; i++) {
      const distFactor = 1 + i * 0.3;
      const askSize = (200 + seededRandom(seed + i * 7 + 1) * 2000) * distFactor;
      const bidSize = (200 + seededRandom(seed + i * 7 + 3) * 2000) * distFactor;
      cumAsk += askSize;
      cumBid += bidSize;
      
      askItems.push({ price: midRounded + (i + 1) * step, size: askSize, total: cumAsk });
      bidItems.push({ price: midRounded - (i + 1) * step, size: bidSize, total: cumBid });
    }
    
    const spreadVal = askItems.length > 0 && bidItems.length > 0 ? askItems[0].price - bidItems[0].price : step;
    return { asks: askItems.reverse(), bids: bidItems, spread: spreadVal };
  }, [price, pair, grouping, rows]);

  const maxTotal = useMemo(() => {
    if (asks.length === 0 && bids.length === 0) return 1;
    return Math.max(asks[0]?.total || 0, bids[bids.length - 1]?.total || 0);
  }, [asks, bids]);

  const formatPrice = (val: number) => {
    if (grouping >= 1) return val.toFixed(0);
    if (grouping >= 0.1) return val.toFixed(1);
    if (grouping >= 0.01) return val.toFixed(2);
    if (grouping >= 0.001) return val.toFixed(3);
    if (grouping >= 0.0001) return val.toFixed(4);
    if (grouping >= 0.00001) return val.toFixed(5);
    if (grouping >= 0.000001) return val.toFixed(6);
    return val.toFixed(8);
  };

  const formatSize = (val: number) => {
    if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toFixed(0);
  };

  const spreadPct = price > 0 ? ((spread / price) * 100).toFixed(3) : '0';

  if (!price || price <= 0) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-white/50 dark:bg-[#121212]/50">
        <div className="animate-pulse text-xs font-bold text-gray-400">Loading Orderbook...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full text-[10px] font-mono select-none overflow-hidden bg-white/50 dark:bg-[#121212]/50">
      <div className="flex justify-between items-center px-3 border-b border-gray-200 dark:border-white/5 py-2 shrink-0">
        <span className="text-gray-500 font-bold uppercase tracking-wider text-[9px]">Order Book</span>
        <select value={grouping} onChange={(e) => setGrouping(parseFloat(e.target.value))}
          className="bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-gray-300 outline-none text-[10px] cursor-pointer font-bold rounded px-2 py-1 border border-gray-200 dark:border-white/10">
          {groupingOptions.map(g => (<option key={g} value={g}>{g}</option>))}
        </select>
      </div>
      
      <div className="flex justify-between text-gray-400 px-3 py-1 text-[9px] uppercase tracking-wider shrink-0 font-bold">
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="flex-1 text-right">Total</span>
      </div>
      
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-1 flex flex-col justify-end overflow-hidden">
          {asks.map((ask, i) => (
            <div key={`ask-${i}`} className="flex justify-between relative group cursor-pointer hover:bg-red-500/10 px-3 items-center h-[18px]">
              <div className="absolute right-0 top-0 bottom-0 bg-red-500/[0.07] transition-all duration-300" style={{ width: `${(ask.total / maxTotal) * 100}%` }} />
              <span className="text-red-500 font-medium z-10 flex-1">{formatPrice(ask.price)}</span>
              <span className="text-gray-500 dark:text-gray-400 z-10 flex-1 text-right">{formatSize(ask.size)}</span>
              <span className="text-gray-600 dark:text-gray-500 z-10 flex-1 text-right text-[9px]">{formatSize(ask.total)}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-1.5 border-y border-gray-200 dark:border-white/5 shrink-0 flex justify-between items-center">
          <span className="text-sm font-black text-gray-900 dark:text-white">${formatPrice(price)}</span>
          <span className="text-[9px] text-gray-400">Spread: {formatPrice(spread)} ({spreadPct}%)</span>
        </div>

        <div className="flex-1 overflow-hidden">
          {bids.map((bid, i) => (
            <div key={`bid-${i}`} className="flex justify-between relative group cursor-pointer hover:bg-emerald-500/10 px-3 items-center h-[18px]">
              <div className="absolute right-0 top-0 bottom-0 bg-emerald-500/[0.07] transition-all duration-300" style={{ width: `${(bid.total / maxTotal) * 100}%` }} />
              <span className="text-emerald-500 font-medium z-10 flex-1">{formatPrice(bid.price)}</span>
              <span className="text-gray-500 dark:text-gray-400 z-10 flex-1 text-right">{formatSize(bid.size)}</span>
              <span className="text-gray-600 dark:text-gray-500 z-10 flex-1 text-right text-[9px]">{formatSize(bid.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
