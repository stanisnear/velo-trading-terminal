import { pythPriceStream } from '../services/pythPriceService';
import { subscribeKlines } from '../services/priceService';
import { mergeLiveCandle, oracleCandle, localChartTime } from '../services/chartLive.mjs';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  createTextWatermark,
  createChart,
  type Time,
} from 'lightweight-charts';
import { RefreshCw } from 'lucide-react';
import { Position } from '../utils/types';

// The Trade chart uses Lightweight Charts with Velo's own data feed. Unlike
// TradingView's hosted widget, this keeps type, spacing, colors, and overlays
// inside the app's design system.
export const TV_INTERVALS_QUICK: Record<string, string> = {
  '1s': '1S',
  '1m': '1', '5m': '5', '15m': '15', '1H': '60', '4H': '240', '1D': 'D',
};

export const TV_INTERVALS: Record<string, string> = {
  '1s': '1S',
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1H': '60', '2H': '120', '4H': '240', '6H': '360', '12H': '720',
  '1D': 'D', '3D': '3D', '1W': 'W', '1M': 'M',
};

export type ChartStyleCode = '0' | '1' | '2' | '3' | '4' | '5' | '8' | '9' | '10';

export const CHART_STYLES: { label: string; code: ChartStyleCode; icon: string }[] = [
  { label: 'Candles',        code: '1', icon: '▮' },
  { label: 'Hollow candles', code: '9', icon: '□' },
  { label: 'Heikin Ashi',    code: '8', icon: '▦' },
  { label: 'Bars',           code: '0', icon: '▥' },
  { label: 'Line',           code: '2', icon: '╱' },
  { label: 'Area',           code: '3', icon: '△' },
];

// Only expose indicators that can be calculated from the oracle OHLC feed.
// Pyth candles do not contain exchange volume, so volume studies are omitted.
export const INDICATORS = [
  { id: 'MASimple@tv-basicstudies', label: 'Moving average', group: 'Trend' },
  { id: 'MAExp@tv-basicstudies', label: 'Exponential average', group: 'Trend' },
  { id: 'DoubleEMA@tv-basicstudies', label: 'Double EMA (DEMA)', group: 'Trend' },
  { id: 'TripleEMA@tv-basicstudies', label: 'Triple EMA (TEMA)', group: 'Trend' },
  { id: 'HullMA@tv-basicstudies', label: 'Hull moving average', group: 'Trend' },
  { id: 'IchimokuCloud@tv-basicstudies', label: 'Ichimoku cloud', group: 'Trend' },
  { id: 'PSAR@tv-basicstudies', label: 'Parabolic SAR', group: 'Trend' },
  { id: 'SuperTrend@tv-basicstudies', label: 'Supertrend', group: 'Trend' },
  { id: 'ATR@tv-basicstudies', label: 'Average true range (ATR)', group: 'Volatility' },
  { id: 'HistoricalVolatility@tv-basicstudies', label: 'Historical volatility', group: 'Volatility' },
  { id: 'KeltnerChannels@velo', label: 'Keltner channels', group: 'Volatility' },
  { id: 'DonchianChannels@velo', label: 'Donchian channels', group: 'Volatility' },
  { id: 'RSI@tv-basicstudies', label: 'Relative strength index (RSI)', group: 'Momentum' },
  { id: 'Stochastic@tv-basicstudies', label: 'Stochastic oscillator', group: 'Momentum' },
  { id: 'StochasticRSI@tv-basicstudies', label: 'Stochastic RSI', group: 'Momentum' },
  { id: 'MACD@tv-basicstudies', label: 'MACD', group: 'Momentum' },
  { id: 'MOM@tv-basicstudies', label: 'Momentum', group: 'Momentum' },
  { id: 'ROC@tv-basicstudies', label: 'Rate of change (ROC)', group: 'Momentum' },
  { id: 'CCI@tv-basicstudies', label: 'Commodity channel index', group: 'Momentum' },
  { id: 'WilliamsPctR@tv-basicstudies', label: 'Williams %R', group: 'Momentum' },
  { id: 'BB@tv-basicstudies', label: 'Bollinger bands', group: 'Volatility' },
];

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  source?: 'pyth' | 'exchange';
}

interface TradingViewChartProps {
  initialData?: Candle[];
  historyStatus?: 'loading' | 'ready' | 'unavailable';
  onRetryHistory?: () => void;
  onLoadOlderHistory?: (request: { pairId: string; timeframe: string; beforeTime: number; source: 'pyth' | 'exchange' }) => Promise<boolean>;
  theme: 'light' | 'dark';
  pairName: string;
  currentPrice: number;
  isLivePrice?: boolean;
  activePosition?: Position | null;
  onTimeframeChange?: (tf: string) => void;
  externalTimeframe?: string;
  externalChartStyle?: ChartStyleCode;
  externalIndicators?: string[];
  showEntryLine?: boolean;
  showTPLine?: boolean;
  showSLLine?: boolean;
  showLiqLine?: boolean;
  liqPrice?: number;
}

const TF_SECONDS: Record<string, number> = {
  '1s': 1,
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1H': 3600, '2H': 7200, '4H': 14400, '6H': 21600, '12H': 43200,
  '1D': 86400, '3D': 259200, '1W': 604800, '1M': 2592000,
};
const INITIAL_VISIBLE_CANDLES = 600;

const COLORS = {
  up: '#91b99f',
  upStrong: '#b4d5bf',
  down: '#c47b76',
  average: '#d3bc87',
  band: '#91a9b6',
};

function cleanCandles(data: Candle[] = []): Candle[] {
  const sorted = new Map<number, Candle>();
  for (const candle of data) {
    const rawTime = Number(candle.time);
    const time = Math.floor(rawTime > 1e12 ? rawTime / 1000 : rawTime);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    if (![time, open, high, low, close].every(Number.isFinite) || time <= 0 || close <= 0) continue;
    sorted.set(time, {
      time, open, close,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      volume: Number(candle.volume) || 0,
      source: candle.source,
    });
  }
  return [...sorted.values()].sort((a, b) => a.time - b.time);
}

function heikinAshi(data: Candle[]): Candle[] {
  let previousOpen = 0;
  let previousClose = 0;
  return data.map((candle, index) => {
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open = index === 0 ? (candle.open + candle.close) / 2 : (previousOpen + previousClose) / 2;
    previousOpen = open;
    previousClose = close;
    return { ...candle, open, close, high: Math.max(candle.high, open, close), low: Math.min(candle.low, open, close) };
  });
}

function toLineData(data: Candle[]) {
  return data.map(candle => ({ time: candle.time as Time, value: candle.close }));
}

function addSimpleAverage(data: Candle[], period: number, source: unknown) {
  return data.map((candle, index) => {
    const slice = data.slice(Math.max(0, index - period + 1), index + 1);
    return slice.length < period ? null : {
      time: candle.time as Time,
      value: slice.reduce((sum, item) => sum + candleSourceValue(item, source), 0) / period,
    };
  }).filter(Boolean) as { time: Time; value: number }[];
}

function addExponentialAverage(data: Candle[], period: number, source: unknown) {
  const multiplier = 2 / (period + 1);
  let value = 0;
  return data.map((candle, index) => {
    const input = candleSourceValue(candle, source);
    value = index === 0 ? input : input * multiplier + value * (1 - multiplier);
    return index < period - 1 ? null : { time: candle.time as Time, value };
  }).filter(Boolean) as { time: Time; value: number }[];
}

function emaValues(data: Candle[], period: number, source: unknown) {
  const multiplier = 2 / (period + 1);
  let value = 0;
  return data.map((candle, index) => {
    const input = candleSourceValue(candle, source);
    value = index === 0 ? input : input * multiplier + value * (1 - multiplier);
    return { time: candle.time as Time, value };
  });
}

function addDoubleExponentialAverage(data: Candle[], period: number, source: unknown) {
  const first = emaValues(data, period, source);
  const second = emaValues(first.map((point, index) => ({ ...data[index], close: point.value })), period, 'close');
  return data.slice(period * 2 - 2).map((candle, offset) => {
    const index = offset + period * 2 - 2;
    return { time: candle.time as Time, value: 2 * first[index].value - second[index].value };
  });
}

function addTripleExponentialAverage(data: Candle[], period: number, source: unknown) {
  const first = emaValues(data, period, source);
  const second = emaValues(first.map((point, index) => ({ ...data[index], close: point.value })), period, 'close');
  const third = emaValues(second.map((point, index) => ({ ...data[index], close: point.value })), period, 'close');
  return data.slice(period * 3 - 3).map((candle, offset) => {
    const index = offset + period * 3 - 3;
    return { time: candle.time as Time, value: 3 * first[index].value - 3 * second[index].value + third[index].value };
  });
}

function weightedAverage(values: number[]) {
  const weightTotal = values.length * (values.length + 1) / 2;
  return values.reduce((total, value, index) => total + value * (index + 1), 0) / weightTotal;
}

function addHullMovingAverage(data: Candle[], period: number, source: unknown) {
  const half = Math.max(1, Math.floor(period / 2));
  const root = Math.max(1, Math.floor(Math.sqrt(period)));
  const raw = data.map(candle => candleSourceValue(candle, source));
  const diff = raw.map((_, index) => {
    if (index < period - 1) return null;
    const full = weightedAverage(raw.slice(index - period + 1, index + 1));
    const halfValue = index < half - 1 ? full : weightedAverage(raw.slice(index - half + 1, index + 1));
    return 2 * halfValue - full;
  });
  return data.map((candle, index) => {
    if (index < period + root - 2) return null;
    const values = diff.slice(index - root + 1, index + 1);
    if (values.some(value => value === null)) return null;
    return { time: candle.time as Time, value: weightedAverage(values as number[]) };
  }).filter(Boolean) as { time: Time; value: number }[];
}

function addBollingerBands(data: Candle[], period: number, deviations: number, source: unknown) {
  const points = data.map((candle, index) => {
    const slice = data.slice(Math.max(0, index - period + 1), index + 1);
    if (slice.length < period) return null;
    const mean = slice.reduce((sum, item) => sum + candleSourceValue(item, source), 0) / period;
    const variance = slice.reduce((sum, item) => sum + (candleSourceValue(item, source) - mean) ** 2, 0) / period;
    const delta = Math.sqrt(variance) * deviations;
    return { time: candle.time as Time, upper: mean + delta, middle: mean, lower: mean - delta };
  }).filter(Boolean) as { time: Time; upper: number; middle: number; lower: number }[];
  return points;
}

function rollingMidpoint(data: Candle[], period: number) {
  return data.map((candle, index) => {
    if (index < period - 1) return null;
    const window = data.slice(index - period + 1, index + 1);
    return { time: candle.time as Time, value: (Math.max(...window.map(item => item.high)) + Math.min(...window.map(item => item.low))) / 2 };
  }).filter(Boolean) as { time: Time; value: number }[];
}

function addIchimoku(data: Candle[], conversion: number, base: number, span: number, displacement: number, fallbackStep: number) {
  const tenkan = rollingMidpoint(data, conversion);
  const kijun = rollingMidpoint(data, base);
  const spanB = rollingMidpoint(data, span);
  const step = data.length > 1 ? data[data.length - 1].time - data[data.length - 2].time : fallbackStep;
  const valueAt = (points: { time: Time; value: number }[], index: number) => points.find(point => Number(point.time) === data[index].time)?.value;
  const tenkanByTime = new Map(tenkan.map(point => [Number(point.time), point.value]));
  const kijunByTime = new Map(kijun.map(point => [Number(point.time), point.value]));
  const spanBByTime = new Map(spanB.map(point => [Number(point.time), point.value]));
  const conversionLine = data.flatMap((candle, index) => {
    const value = valueAt(tenkan, index);
    return value === undefined ? [] : [{ time: candle.time as Time, value }];
  });
  const baseLine = data.flatMap((candle, index) => {
    const value = kijunByTime.get(candle.time);
    return value === undefined ? [] : [{ time: candle.time as Time, value }];
  });
  const leadingA = data.flatMap((candle, index) => {
    const a = tenkanByTime.get(candle.time);
    const b = kijunByTime.get(candle.time);
    return a === undefined || b === undefined ? [] : [{ time: (candle.time + displacement * step) as Time, value: (a + b) / 2 }];
  });
  const leadingB = data.flatMap(candle => {
    const value = spanBByTime.get(candle.time);
    return value === undefined ? [] : [{ time: (candle.time + displacement * step) as Time, value }];
  });
  const lagging = data.flatMap((candle, index) => index < displacement ? [] : [{ time: data[index - displacement].time as Time, value: candle.close }]);
  return { conversionLine, baseLine, leadingA, leadingB, lagging };
}

function addParabolicSar(data: Candle[], start: number, increment: number, maximum: number) {
  if (data.length < 2) return [];
  let rising = data[1].close >= data[0].close;
  let sar = rising ? data[0].low : data[0].high;
  let extreme = rising ? data[0].high : data[0].low;
  let acceleration = start;
  const points: { time: Time; value: number }[] = [];
  for (let index = 1; index < data.length; index++) {
    const previousSar = sar;
    sar = previousSar + acceleration * (extreme - previousSar);
    if (rising) {
      sar = Math.min(sar, data[index - 1].low, data[Math.max(0, index - 2)].low);
      if (data[index].low < sar) {
        rising = false; sar = extreme; extreme = data[index].low; acceleration = start;
      } else if (data[index].high > extreme) {
        extreme = data[index].high; acceleration = Math.min(maximum, acceleration + increment);
      }
    } else {
      sar = Math.max(sar, data[index - 1].high, data[Math.max(0, index - 2)].high);
      if (data[index].high > sar) {
        rising = true; sar = extreme; extreme = data[index].high; acceleration = start;
      } else if (data[index].low < extreme) {
        extreme = data[index].low; acceleration = Math.min(maximum, acceleration + increment);
      }
    }
    points.push({ time: data[index].time as Time, value: sar });
  }
  return points;
}

function addSuperTrend(data: Candle[], period: number, factor: number) {
  const atr = addAverageTrueRange(data, period);
  const atrByTime = new Map(atr.map(point => [Number(point.time), point.value]));
  let finalUpper: number | null = null;
  let finalLower: number | null = null;
  let previousClose: number | null = null;
  let direction = 1;
  const points: { time: Time; value: number }[] = [];
  for (const candle of data) {
    const range = atrByTime.get(candle.time);
    if (range === undefined) continue;
    const midpoint = (candle.high + candle.low) / 2;
    const basicUpper = midpoint + factor * range;
    const basicLower = midpoint - factor * range;
    if (finalUpper === null || finalLower === null || previousClose === null) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      direction = candle.close >= midpoint ? 1 : -1;
    } else {
      finalUpper = basicUpper < finalUpper || previousClose > finalUpper ? basicUpper : finalUpper;
      finalLower = basicLower > finalLower || previousClose < finalLower ? basicLower : finalLower;
      if (direction > 0 && candle.close < finalLower) direction = -1;
      else if (direction < 0 && candle.close > finalUpper) direction = 1;
    }
    points.push({ time: candle.time as Time, value: direction > 0 ? finalLower : finalUpper });
    previousClose = candle.close;
  }
  return points;
}

function addKeltnerChannels(data: Candle[], period: number, factor: number, source: unknown) {
  const center = emaValues(data, period, source);
  const atr = addAverageTrueRange(data, period);
  const atrByTime = new Map(atr.map(point => [Number(point.time), point.value]));
  return center.flatMap(point => {
    const range = atrByTime.get(Number(point.time));
    return range === undefined ? [] : [{ time: point.time, upper: point.value + range * factor, middle: point.value, lower: point.value - range * factor }];
  });
}

function addDonchianChannels(data: Candle[], period: number) {
  return data.flatMap((candle, index) => {
    if (index < period - 1) return [];
    const window = data.slice(index - period + 1, index + 1);
    const upper = Math.max(...window.map(item => item.high));
    const lower = Math.min(...window.map(item => item.low));
    return [{ time: candle.time as Time, upper, middle: (upper + lower) / 2, lower }];
  });
}

function candleSourceValue(candle: Candle, source: unknown) {
  switch (source) {
    case 'open': return candle.open;
    case 'high': return candle.high;
    case 'low': return candle.low;
    case 'hl2': return (candle.high + candle.low) / 2;
    case 'hlc3': return (candle.high + candle.low + candle.close) / 3;
    default: return candle.close;
  }
}

function addRelativeStrengthIndex(data: Candle[], period: number, source: unknown) {
  if (data.length <= period) return [];
  const values = data.map(candle => candleSourceValue(candle, source));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  const points: { time: Time; value: number }[] = [];
  const rsi = () => averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  points.push({ time: data[period].time as Time, value: rsi() });
  for (let i = period + 1; i < data.length; i++) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    points.push({ time: data[i].time as Time, value: rsi() });
  }
  return points;
}

function addStochastic(data: Candle[], period: number, smoothK: number, smoothD: number) {
  const rawK = data.map((candle, index) => {
    if (index < period - 1) return null;
    const window = data.slice(index - period + 1, index + 1);
    const high = Math.max(...window.map(item => item.high));
    const low = Math.min(...window.map(item => item.low));
    return { time: candle.time as Time, value: high === low ? 50 : ((candle.close - low) / (high - low)) * 100 };
  });
  const k = rawK.map((point, index) => {
    if (!point || index < smoothK - 1) return null;
    const window = rawK.slice(index - smoothK + 1, index + 1);
    if (window.some(value => !value)) return null;
    return { time: point.time, value: window.reduce((sum, value) => sum + value!.value, 0) / smoothK };
  });
  const d = k.map((point, index) => {
    if (!point || index < smoothD - 1) return null;
    const window = k.slice(index - smoothD + 1, index + 1);
    if (window.some(value => !value)) return null;
    return { time: point.time, value: window.reduce((sum, value) => sum + value!.value, 0) / smoothD };
  });
  return {
    k: k.filter(Boolean) as { time: Time; value: number }[],
    d: d.filter(Boolean) as { time: Time; value: number }[],
  };
}

function smoothPoints(points: { time: Time; value: number }[], period: number) {
  return points.flatMap((point, index) => {
    if (index < period - 1) return [];
    const window = points.slice(index - period + 1, index + 1);
    return [{ time: point.time, value: window.reduce((sum, item) => sum + item.value, 0) / period }];
  });
}

function addStochasticRsi(data: Candle[], rsiPeriod: number, stochPeriod: number, smoothK: number, smoothD: number, source: unknown) {
  const rsi = addRelativeStrengthIndex(data, rsiPeriod, source);
  const raw = rsi.flatMap((point, index) => {
    if (index < stochPeriod - 1) return [];
    const window = rsi.slice(index - stochPeriod + 1, index + 1);
    const min = Math.min(...window.map(value => value.value));
    const max = Math.max(...window.map(value => value.value));
    return [{ time: point.time, value: max === min ? 50 : ((point.value - min) / (max - min)) * 100 }];
  });
  const k = smoothPoints(raw, smoothK);
  return { k, d: smoothPoints(k, smoothD) };
}

function addMomentum(data: Candle[], period: number, source: unknown, percent: boolean) {
  return data.flatMap((candle, index) => {
    if (index < period) return [];
    const current = candleSourceValue(candle, source);
    const previous = candleSourceValue(data[index - period], source);
    return [{ time: candle.time as Time, value: percent && previous !== 0 ? ((current - previous) / previous) * 100 : current - previous }];
  });
}

function addCommodityChannelIndex(data: Candle[], period: number) {
  const typical = data.map(candle => (candle.high + candle.low + candle.close) / 3);
  return data.flatMap((candle, index) => {
    if (index < period - 1) return [];
    const values = typical.slice(index - period + 1, index + 1);
    const mean = values.reduce((sum, value) => sum + value, 0) / period;
    const meanDeviation = values.reduce((sum, value) => sum + Math.abs(value - mean), 0) / period;
    return [{ time: candle.time as Time, value: meanDeviation === 0 ? 0 : (typical[index] - mean) / (0.015 * meanDeviation) }];
  });
}

function addWilliamsPercentR(data: Candle[], period: number) {
  return data.flatMap((candle, index) => {
    if (index < period - 1) return [];
    const window = data.slice(index - period + 1, index + 1);
    const high = Math.max(...window.map(item => item.high));
    const low = Math.min(...window.map(item => item.low));
    return [{ time: candle.time as Time, value: high === low ? -50 : ((high - candle.close) / (high - low)) * -100 }];
  });
}

function addHistoricalVolatility(data: Candle[], period: number, timeframeSeconds: number) {
  if (data.length <= period) return [];
  const returns = data.map((candle, index) => index === 0 ? 0 : Math.log(candle.close / data[index - 1].close));
  const barsPerYear = (365 * 24 * 60 * 60) / timeframeSeconds;
  return data.flatMap((candle, index) => {
    if (index < period) return [];
    const window = returns.slice(index - period + 1, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    return [{ time: candle.time as Time, value: Math.sqrt(variance * barsPerYear) * 100 }];
  });
}

function addAverageTrueRange(data: Candle[], period: number) {
  if (data.length < period) return [];
  const ranges = data.map((candle, index) => index === 0
    ? candle.high - candle.low
    : Math.max(candle.high - candle.low, Math.abs(candle.high - data[index - 1].close), Math.abs(candle.low - data[index - 1].close)));
  let average = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const points = [{ time: data[period - 1].time as Time, value: average }];
  for (let index = period; index < data.length; index++) {
    average = ((average * (period - 1)) + ranges[index]) / period;
    points.push({ time: data[index].time as Time, value: average });
  }
  return points;
}

function addMacd(data: Candle[], fastPeriod: number, slowPeriod: number, signalPeriod: number, source: unknown) {
  if (fastPeriod >= slowPeriod || data.length < slowPeriod + signalPeriod - 1) {
    return { macd: [], signal: [], histogram: [] };
  }
  const prices = data.map(candle => candleSourceValue(candle, source));
  const fastMultiplier = 2 / (fastPeriod + 1);
  const slowMultiplier = 2 / (slowPeriod + 1);
  let fast = prices[0];
  let slow = prices[0];
  const values: { time: Time; value: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i > 0) {
      fast = prices[i] * fastMultiplier + fast * (1 - fastMultiplier);
      slow = prices[i] * slowMultiplier + slow * (1 - slowMultiplier);
    }
    if (i >= slowPeriod - 1) values.push({ time: data[i].time as Time, value: fast - slow });
  }
  const signalMultiplier = 2 / (signalPeriod + 1);
  let signalValue = values[0]?.value ?? 0;
  const signal: { time: Time; value: number }[] = [];
  const histogram: { time: Time; value: number }[] = [];
  values.forEach((point, index) => {
    signalValue = index === 0 ? point.value : point.value * signalMultiplier + signalValue * (1 - signalMultiplier);
    if (index >= signalPeriod - 1) {
      signal.push({ time: point.time, value: signalValue });
      histogram.push({ time: point.time, value: point.value - signalValue });
    }
  });
  return { macd: values.slice(signalPeriod - 1), signal, histogram };
}

function indicatorSettings(entries: string[], id: string, defaults: Record<string, number | string>) {
  const entry = entries.find(value => value.split('|', 1)[0] === id);
  if (!entry) return null;
  try {
    const parsed = JSON.parse(entry.slice(id.length + 1));
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : defaults;
  } catch {
    return defaults;
  }
}

function safePeriod(value: unknown, fallback: number) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(500, Math.max(1, number)) : fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function translucentColor(hex: string, alpha: number) {
  const value = hex.slice(1);
  const channels = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${channels[0]},${channels[1]},${channels[2]},${alpha})`;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = memo(({
  theme,
  pairName,
  currentPrice,
  isLivePrice = false,
  activePosition,
  initialData = [],
  historyStatus = 'loading',
  onRetryHistory,
  onLoadOlderHistory,
  externalTimeframe = '15m',
  externalChartStyle = '1',
  externalIndicators = [],
  showEntryLine = true,
  showTPLine = true,
  showSLLine = true,
  showLiqLine = true,
  liqPrice,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const watermarkRef = useRef<any>(null);
  const indicatorSeriesRef = useRef<any[]>([]);
  const indicatorRefreshRef = useRef<(data: Candle[]) => void>(() => {});
  const riskLinesRef = useRef<any[]>([]);
  const candlesRef = useRef<Candle[]>([]);
  const loadOlderHistoryRef = useRef(onLoadOlderHistory);
  const loadingOlderRef = useRef(false);
  const canLoadOlderRef = useRef(true);
  const lastOlderCursorRef = useRef<number | null>(null);
  const chartDataRef = useRef<{ key: string; firstTime: number; length: number } | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const liveCandleRef = useRef<Candle | null>(null);
  const pricePrecisionRef = useRef<number | null>(null);
  const indicatorKey = useMemo(() => [...externalIndicators].sort().join('|'), [externalIndicators]);
  const isDark = theme === 'dark';
  // Canvas colors mirror the surrounding --bg-2 and --fg-muted surfaces.
  const background = isDark ? '#171a19' : '#dfe8e0';
  const foreground = isDark ? '#b0b8b3' : '#516257';
  const grid = isDark ? 'rgba(240,243,241,0.06)' : 'rgba(38,69,47,0.07)';
  const crosshair = isDark ? 'rgba(208,215,211,0.30)' : 'rgba(81,98,87,0.30)';
  const crosshairLabel = isDark ? '#303634' : '#d5e1d7';
  const candleUp = isDark ? COLORS.up : '#638a6d';
  const candleUpStrong = isDark ? COLORS.upStrong : '#52765f';
  const candleDown = isDark ? COLORS.down : '#b96863';
  const averageColor = isDark ? COLORS.average : '#8a6c3d';
  const bandColor = isDark ? COLORS.band : '#607f8c';
  const timeframeSeconds = TF_SECONDS[externalTimeframe] ?? 900;
  const historySource = initialData[0]?.source === 'exchange' ? 'Exchange candles' : 'Oracle candles';

  loadOlderHistoryRef.current = onLoadOlderHistory;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const chartFont = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'ui-monospace, SFMono-Regular, monospace';

    const chart = createChart(element, {
      width: element.clientWidth || 600,
      height: element.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: background },
        textColor: foreground,
        fontFamily: chartFont,
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Solid },
        horzLines: { color: grid, style: LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: grid,
        minimumWidth: 76,
        scaleMargins: { top: 0.08, bottom: 0.12 },
      },
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: externalTimeframe === '1s',
        rightOffset: 4,
        minBarSpacing: 2,
        tickMarkFormatter: (time, tickMarkType, locale) => {
          const date = typeof time === 'number'
            ? new Date(time * 1000)
            : typeof time === 'string'
              ? new Date(`${time}T00:00:00Z`)
              : new Date(Date.UTC(time.year, time.month - 1, time.day));
          const year = date.getUTCFullYear();
          if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100) return '';
          const format: Intl.DateTimeFormatOptions = tickMarkType === TickMarkType.Year
            ? { year: 'numeric' }
            : tickMarkType === TickMarkType.Month
              ? { month: 'short' }
              : tickMarkType === TickMarkType.DayOfMonth
                ? { day: '2-digit' }
                : tickMarkType === TickMarkType.TimeWithSeconds
                  ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
                  : { hour: '2-digit', minute: '2-digit' };
          return localChartTime(time, format, locale);
        },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: crosshair, style: LineStyle.Dashed, labelBackgroundColor: crosshairLabel },
        horzLine: { color: crosshair, style: LineStyle.Dashed, labelBackgroundColor: crosshairLabel },
      },
      localization: {
        locale: navigator.language,
        timeFormatter: time => {
          const date = typeof time === 'number'
            ? new Date(time * 1000)
            : typeof time === 'string'
              ? new Date(`${time}T00:00:00Z`)
              : new Date(Date.UTC(time.year, time.month - 1, time.day));
          const year = date.getUTCFullYear();
          if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100) return '';
          return localChartTime(time, {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', ...(externalTimeframe === '1s' ? { second: '2-digit' } : {}),
          });
        },
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    });

    const seriesOptions = {
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: candleUpStrong,
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1 as const,
      priceFormat: { type: 'price' as const, precision: currentPrice < 1 ? 6 : currentPrice < 100 ? 4 : 2, minMove: currentPrice < 1 ? 0.000001 : currentPrice < 100 ? 0.0001 : 0.01 },
    };
    const candleOptions = {
      upColor: candleUp,
      downColor: candleDown,
      borderUpColor: candleUp,
      borderDownColor: candleDown,
      wickUpColor: candleUp,
      wickDownColor: candleDown,
    };
    let series: any;
    switch (externalChartStyle) {
      case '0':
        series = chart.addSeries(BarSeries, { ...seriesOptions, upColor: candleUp, downColor: candleDown });
        break;
      case '2':
        series = chart.addSeries(LineSeries, { color: candleUpStrong, lineWidth: 2, crosshairMarkerRadius: 3, ...seriesOptions });
        break;
      case '3':
        series = chart.addSeries(AreaSeries, {
          lineColor: candleUpStrong,
          topColor: isDark ? 'rgba(145,185,159,0.12)' : 'rgba(82,118,95,0.10)',
          bottomColor: isDark ? 'rgba(145,185,159,0.015)' : 'rgba(82,118,95,0.015)',
          lineWidth: 2,
          ...seriesOptions,
        });
        break;
      case '9':
        series = chart.addSeries(CandlestickSeries, {
          ...seriesOptions,
          ...candleOptions,
          upColor: background,
          borderUpColor: candleUpStrong,
          wickUpColor: candleUpStrong,
        });
        break;
      default:
        series = chart.addSeries(CandlestickSeries, { ...seriesOptions, ...candleOptions });
    }

    chartRef.current = chart;
    seriesRef.current = series;
    watermarkRef.current = createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'bottom',
      lines: [{
        text: 'Velo',
        color: isDark ? 'rgba(208,215,211,0.08)' : 'rgba(82,118,95,0.09)',
        fontSize: 50,
        fontStyle: 'italic',
        fontFamily: 'Fraunces, Georgia, serif',
      }],
    });
    pricePrecisionRef.current = currentPrice < 1 ? 6 : currentPrice < 100 ? 4 : 2;
    const resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        requestAnimationFrame(() => chart.applyOptions({ width: rect.width, height: rect.height }));
      }
    });
    resizeObserver.observe(element);

    const timeScale = chart.timeScale();
    const onVisibleRangeChange = (range: { from: number; to: number } | null) => {
      const history = chartDataRef.current;
      const loadOlder = loadOlderHistoryRef.current;
      if (!range || !history || history.length < 100 || range.from > 24 || !loadOlder || !canLoadOlderRef.current || loadingOlderRef.current) return;
      if (lastOlderCursorRef.current === history.firstTime) return;
      lastOlderCursorRef.current = history.firstTime;
      loadingOlderRef.current = true;
      setIsLoadingOlder(true);
      const source = candlesRef.current[0]?.source === 'exchange' ? 'exchange' : 'pyth';
      loadOlder({ pairId: pairName, timeframe: externalTimeframe, beforeTime: history.firstTime, source })
        .then(hasMore => { if (!hasMore) canLoadOlderRef.current = false; })
        .catch(() => { lastOlderCursorRef.current = null; })
        .finally(() => {
          loadingOlderRef.current = false;
          setIsLoadingOlder(false);
        });
    };
    timeScale.subscribeVisibleLogicalRangeChange(onVisibleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange);
      resizeObserver.disconnect();
      watermarkRef.current?.detach();
      watermarkRef.current = null;
      indicatorSeriesRef.current = [];
      riskLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [externalChartStyle, externalTimeframe, pairName]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: background }, textColor: foreground },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid },
      crosshair: {
        vertLine: { color: crosshair, labelBackgroundColor: crosshairLabel },
        horzLine: { color: crosshair, labelBackgroundColor: crosshairLabel },
      },
    });
    const priceColor = candleUpStrong;
    series.applyOptions({ priceLineColor: priceColor });
    if (externalChartStyle === '2') series.applyOptions({ color: priceColor });
    if (externalChartStyle === '3') series.applyOptions({ lineColor: priceColor, topColor: isDark ? 'rgba(145,185,159,0.12)' : 'rgba(82,118,95,0.10)', bottomColor: isDark ? 'rgba(145,185,159,0.015)' : 'rgba(82,118,95,0.015)' });
    if (externalChartStyle === '0') series.applyOptions({ upColor: candleUp, downColor: candleDown });
    if (externalChartStyle !== '0' && externalChartStyle !== '2' && externalChartStyle !== '3') {
      series.applyOptions({
        upColor: externalChartStyle === '9' ? background : candleUp,
        downColor: candleDown,
        borderUpColor: externalChartStyle === '9' ? priceColor : candleUp,
        wickUpColor: externalChartStyle === '9' ? priceColor : candleUp,
        borderDownColor: candleDown,
        wickDownColor: candleDown,
      });
    }
    watermarkRef.current?.applyOptions({
      lines: [{
        text: 'Velo',
        color: isDark ? 'rgba(208,215,211,0.08)' : 'rgba(82,118,95,0.09)',
        fontSize: 50,
        fontStyle: 'italic',
        fontFamily: 'Fraunces, Georgia, serif',
      }],
    });
  }, [background, crosshair, crosshairLabel, externalChartStyle, foreground, grid, isDark]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    let source = cleanCandles(initialData);
    const dataKey = `${pairName}::${externalTimeframe}`;
    const previousData = chartDataRef.current;
    const sameDataKey = previousData?.key === dataKey;
    if (sameDataKey && source.length && source[0].source === candlesRef.current[0]?.source) {
      const historyEnd = source.at(-1)!.time;
      const liveTail = candlesRef.current.filter(candle => candle.time >= historyEnd);
      source = [...new Map([...source, ...liveTail].map(candle => [candle.time, candle])).values()];
    }
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    const isPrepend = !!(sameDataKey && source.length > previousData.length && source[0]?.time < previousData.firstTime);
    const addedBars = isPrepend && previousData ? source.findIndex(candle => candle.time >= previousData.firstTime) : 0;
    if (!sameDataKey) {
      canLoadOlderRef.current = true;
      lastOlderCursorRef.current = null;
    }
    const rendered = externalChartStyle === '8' ? heikinAshi(source) : source;
    candlesRef.current = source;
    chartDataRef.current = source.length ? { key: dataKey, firstTime: source[0].time, length: source.length } : { key: dataKey, firstTime: 0, length: 0 };
    liveCandleRef.current = null;
    indicatorRefreshRef.current = () => {};

    if (externalChartStyle === '2' || externalChartStyle === '3') {
      series.setData(toLineData(rendered));
    } else {
      series.setData(rendered.map(c => ({ ...c, time: c.time as Time })));
    }
    if (source.length) {
      if (isPrepend && visibleRange && addedBars > 0) {
        chart.timeScale().setVisibleLogicalRange({ from: visibleRange.from + addedBars, to: visibleRange.to + addedBars });
      } else if (!sameDataKey || !visibleRange) {
        const visibleBars = Math.min(INITIAL_VISIBLE_CANDLES, source.length);
        chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, source.length - visibleBars), to: source.length + 4 });
      } else {
        chart.timeScale().setVisibleLogicalRange(visibleRange);
      }
    }
  }, [externalChartStyle, externalTimeframe, initialData, pairName]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const source = candlesRef.current;
    for (const oldSeries of indicatorSeriesRef.current) {
      try { chart.removeSeries(oldSeries); } catch { /* chart may be replacing its series */ }
    }
    indicatorSeriesRef.current = [];
    while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
    const liveRefreshers: ((data: Candle[]) => void)[] = [];
    const chartHeight = containerRef.current?.clientHeight || 360;
    const oscillatorIds = new Set(['RSI@tv-basicstudies', 'Stochastic@tv-basicstudies', 'StochasticRSI@tv-basicstudies', 'ATR@tv-basicstudies', 'MACD@tv-basicstudies', 'MOM@tv-basicstudies', 'ROC@tv-basicstudies', 'CCI@tv-basicstudies', 'WilliamsPctR@tv-basicstudies', 'HistoricalVolatility@tv-basicstudies']);
    const oscillatorCount = Math.max(1, externalIndicators.filter(entry => oscillatorIds.has(entry.split('|', 1)[0])).length);
    const oscillatorHeight = Math.max(48, Math.min(88, Math.floor(chartHeight * 0.46 / oscillatorCount)));
    const addIndicator = (color: string, title: string, data: { time: Time; value: number }[], lineWidth: 1 | 2 = 1, liveData?: (candles: Candle[]) => { time: Time; value: number }[]) => {
      const overlay = chart.addSeries(LineSeries, {
        color,
        title,
        lineWidth,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        priceFormat: { type: 'price', precision: currentPrice < 1 ? 6 : currentPrice < 100 ? 4 : 2, minMove: currentPrice < 1 ? 0.000001 : currentPrice < 100 ? 0.0001 : 0.01 },
      });
      overlay.setData(data);
      indicatorSeriesRef.current.push(overlay);
      if (liveData) liveRefreshers.push(candles => overlay.setData(liveData(candles)));
    };
    const addOscillatorPane = () => {
      const pane = chart.addPane();
      pane.setHeight(oscillatorHeight);
      return pane.paneIndex();
    };
    const addOscillatorLine = (paneIndex: number, color: string, title: string, data: { time: Time; value: number }[], liveData?: (candles: Candle[]) => { time: Time; value: number }[], range?: [number, number]) => {
      const oscillator = chart.addSeries(LineSeries, {
        color,
        title,
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        ...(range ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: range[0], maxValue: range[1] } }) } : {}),
      }, paneIndex);
      oscillator.setData(data);
      indicatorSeriesRef.current.push(oscillator);
      if (liveData) liveRefreshers.push(candles => oscillator.setData(liveData(candles)));
      return oscillator;
    };

    const sma = indicatorSettings(externalIndicators, 'MASimple@tv-basicstudies', { length: 20, color: averageColor });
    if (sma) {
      const period = safePeriod(sma.length, 20);
      addIndicator(safeColor(sma.color, averageColor), `SMA ${period}`, addSimpleAverage(source, period, sma.source), 1, candles => addSimpleAverage(candles, period, sma.source));
    }
    const ema = indicatorSettings(externalIndicators, 'MAExp@tv-basicstudies', { length: 21, color: candleUpStrong });
    if (ema) {
      const period = safePeriod(ema.length, 21);
      addIndicator(safeColor(ema.color, candleUpStrong), `EMA ${period}`, addExponentialAverage(source, period, ema.source), 1, candles => addExponentialAverage(candles, period, ema.source));
    }
    const dema = indicatorSettings(externalIndicators, 'DoubleEMA@tv-basicstudies', { length: 21, color: candleUpStrong });
    if (dema) {
      const period = safePeriod(dema.length, 21);
      addIndicator(safeColor(dema.color, candleUpStrong), `DEMA ${period}`, addDoubleExponentialAverage(source, period, dema.source), 1, candles => addDoubleExponentialAverage(candles, period, dema.source));
    }
    const tema = indicatorSettings(externalIndicators, 'TripleEMA@tv-basicstudies', { length: 21, color: averageColor });
    if (tema) {
      const period = safePeriod(tema.length, 21);
      addIndicator(safeColor(tema.color, averageColor), `TEMA ${period}`, addTripleExponentialAverage(source, period, tema.source), 1, candles => addTripleExponentialAverage(candles, period, tema.source));
    }
    const hull = indicatorSettings(externalIndicators, 'HullMA@tv-basicstudies', { length: 9, color: bandColor });
    if (hull) {
      const period = safePeriod(hull.length, 9);
      addIndicator(safeColor(hull.color, bandColor), `HMA ${period}`, addHullMovingAverage(source, period, hull.source), 2, candles => addHullMovingAverage(candles, period, hull.source));
    }
    const bollinger = indicatorSettings(externalIndicators, 'BB@tv-basicstudies', { length: 20, mult: 2, color: bandColor });
    if (bollinger) {
      const period = safePeriod(bollinger.length, 20);
      const deviations = Math.min(5, Math.max(0.1, Number(bollinger.mult) || 2));
      const color = safeColor(bollinger.color, bandColor);
      const bands = addBollingerBands(source, period, deviations, bollinger.source);
      addIndicator(color, `BB ${period} upper`, bands.map(p => ({ time: p.time, value: p.upper })), 1, candles => addBollingerBands(candles, period, deviations, bollinger.source).map(p => ({ time: p.time, value: p.upper })));
      addIndicator(translucentColor(color, 0.58), `BB ${period} basis`, bands.map(p => ({ time: p.time, value: p.middle })), 1, candles => addBollingerBands(candles, period, deviations, bollinger.source).map(p => ({ time: p.time, value: p.middle })));
      addIndicator(color, `BB ${period} lower`, bands.map(p => ({ time: p.time, value: p.lower })), 1, candles => addBollingerBands(candles, period, deviations, bollinger.source).map(p => ({ time: p.time, value: p.lower })));
    }
    const ichimoku = indicatorSettings(externalIndicators, 'IchimokuCloud@tv-basicstudies', { conversionPeriod: 9, basePeriod: 26, laggingSpan2Period: 52, displacement: 26 });
    if (ichimoku) {
      const conversion = safePeriod(ichimoku.conversionPeriod, 9);
      const base = safePeriod(ichimoku.basePeriod, 26);
      const span = safePeriod(ichimoku.laggingSpan2Period, 52);
      const displacement = safePeriod(ichimoku.displacement, 26);
      const values = addIchimoku(source, conversion, base, span, displacement, timeframeSeconds);
      addIndicator(isDark ? '#86b9cf' : '#497b8e', 'Tenkan-sen', values.conversionLine, 1, candles => addIchimoku(candles, conversion, base, span, displacement, timeframeSeconds).conversionLine);
      addIndicator(isDark ? '#d6b77f' : '#967239', 'Kijun-sen', values.baseLine, 1, candles => addIchimoku(candles, conversion, base, span, displacement, timeframeSeconds).baseLine);
      addIndicator(isDark ? '#91b99f' : '#52765f', 'Senkou span A', values.leadingA, 1, candles => addIchimoku(candles, conversion, base, span, displacement, timeframeSeconds).leadingA);
      addIndicator(isDark ? '#c47b76' : '#b96863', 'Senkou span B', values.leadingB, 1, candles => addIchimoku(candles, conversion, base, span, displacement, timeframeSeconds).leadingB);
      addIndicator(isDark ? '#b4d5bf' : '#638a6d', 'Chikou span', values.lagging, 1, candles => addIchimoku(candles, conversion, base, span, displacement, timeframeSeconds).lagging);
    }
    const psar = indicatorSettings(externalIndicators, 'PSAR@tv-basicstudies', { start: 0.02, increment: 0.02, maximum: 0.2, color: isDark ? COLORS.average : '#967239' });
    if (psar) {
      const start = Math.min(1, Math.max(0.001, Number(psar.start) || 0.02));
      const increment = Math.min(1, Math.max(0.001, Number(psar.increment) || 0.02));
      const maximum = Math.max(start, Math.min(1, Number(psar.maximum) || 0.2));
      addIndicator(safeColor(psar.color, isDark ? COLORS.average : '#967239'), 'Parabolic SAR', addParabolicSar(source, start, increment, maximum), 1, candles => addParabolicSar(candles, start, increment, maximum));
    }
    const supertrend = indicatorSettings(externalIndicators, 'SuperTrend@tv-basicstudies', { period: 10, factor: 3, color: isDark ? COLORS.upStrong : '#52765f' });
    if (supertrend) {
      const period = safePeriod(supertrend.period, 10);
      const factor = Math.min(10, Math.max(0.1, Number(supertrend.factor) || 3));
      addIndicator(safeColor(supertrend.color, isDark ? COLORS.upStrong : '#52765f'), `Supertrend ${period}`, addSuperTrend(source, period, factor), 2, candles => addSuperTrend(candles, period, factor));
    }
    const keltner = indicatorSettings(externalIndicators, 'KeltnerChannels@velo', { length: 20, mult: 2, source: 'close', color: bandColor });
    if (keltner) {
      const period = safePeriod(keltner.length, 20);
      const factor = Math.min(10, Math.max(0.1, Number(keltner.mult) || 2));
      const color = safeColor(keltner.color, bandColor);
      const values = addKeltnerChannels(source, period, factor, keltner.source);
      const live = (candles: Candle[]) => addKeltnerChannels(candles, period, factor, keltner.source);
      addIndicator(color, `KC ${period} upper`, values.map(p => ({ time: p.time, value: p.upper })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.upper })));
      addIndicator(translucentColor(color, 0.58), `KC ${period} basis`, values.map(p => ({ time: p.time, value: p.middle })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.middle })));
      addIndicator(color, `KC ${period} lower`, values.map(p => ({ time: p.time, value: p.lower })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.lower })));
    }
    const donchian = indicatorSettings(externalIndicators, 'DonchianChannels@velo', { length: 20, color: bandColor });
    if (donchian) {
      const period = safePeriod(donchian.length, 20);
      const color = safeColor(donchian.color, bandColor);
      const values = addDonchianChannels(source, period);
      const live = (candles: Candle[]) => addDonchianChannels(candles, period);
      addIndicator(color, `Donchian ${period} high`, values.map(p => ({ time: p.time, value: p.upper })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.upper })));
      addIndicator(translucentColor(color, 0.58), `Donchian ${period} mid`, values.map(p => ({ time: p.time, value: p.middle })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.middle })));
      addIndicator(color, `Donchian ${period} low`, values.map(p => ({ time: p.time, value: p.lower })), 1, candles => live(candles).map(p => ({ time: p.time, value: p.lower })));
    }
    const rsi = indicatorSettings(externalIndicators, 'RSI@tv-basicstudies', { length: 14, overbought: 70, oversold: 30, color: isDark ? COLORS.upStrong : '#52765f' });
    if (rsi) {
      const period = safePeriod(rsi.length, 14);
      const points = addRelativeStrengthIndex(source, period, rsi.source);
      if (points.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(rsi.color, isDark ? COLORS.upStrong : '#52765f');
        const rsiSeries = chart.addSeries(LineSeries, {
          color,
          title: `RSI ${period}`,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, paneIndex);
        rsiSeries.setData(points);
        liveRefreshers.push(candles => rsiSeries.setData(addRelativeStrengthIndex(candles, period, rsi.source)));
        const guideColor = translucentColor(color, 0.5);
        rsiSeries.createPriceLine({ price: Math.min(100, Math.max(0, Number(rsi.overbought) || 70)), color: guideColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        rsiSeries.createPriceLine({ price: Math.min(100, Math.max(0, Number(rsi.oversold) || 30)), color: guideColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        indicatorSeriesRef.current.push(rsiSeries);
      }
    }
    const stochastic = indicatorSettings(externalIndicators, 'Stochastic@tv-basicstudies', { length: 14, smoothK: 3, smoothD: 3, overbought: 80, oversold: 20, color: isDark ? COLORS.upStrong : '#52765f' });
    if (stochastic) {
      const period = safePeriod(stochastic.length, 14);
      const kSmoothing = safePeriod(stochastic.smoothK, 3);
      const dSmoothing = safePeriod(stochastic.smoothD, 3);
      const values = addStochastic(source, period, kSmoothing, dSmoothing);
      if (values.k.length && values.d.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(stochastic.color, isDark ? COLORS.upStrong : '#52765f');
        const kSeries = chart.addSeries(LineSeries, {
          color,
          title: `%K ${period}`,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, paneIndex);
        kSeries.setData(values.k);
        liveRefreshers.push(candles => kSeries.setData(addStochastic(candles, period, kSmoothing, dSmoothing).k));
        const dSeries = chart.addSeries(LineSeries, {
          color: isDark ? '#d3bc87' : '#8a6c3d',
          title: `%D ${dSmoothing}`,
          lineWidth: 1,
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, paneIndex);
        dSeries.setData(values.d);
        liveRefreshers.push(candles => dSeries.setData(addStochastic(candles, period, kSmoothing, dSmoothing).d));
        const guideColor = translucentColor(color, 0.5);
        for (const price of [stochastic.overbought, stochastic.oversold]) {
          kSeries.createPriceLine({ price: Math.min(100, Math.max(0, Number(price) || 0)), color: guideColor, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        }
        indicatorSeriesRef.current.push(kSeries, dSeries);
      }
    }
    const stochasticRsi = indicatorSettings(externalIndicators, 'StochasticRSI@tv-basicstudies', { lengthRSI: 14, lengthStoch: 14, smoothK: 3, smoothD: 3, overbought: 80, oversold: 20, color: isDark ? COLORS.upStrong : '#52765f' });
    if (stochasticRsi) {
      const rsiPeriod = safePeriod(stochasticRsi.lengthRSI, 14);
      const stochPeriod = safePeriod(stochasticRsi.lengthStoch, 14);
      const smoothK = safePeriod(stochasticRsi.smoothK, 3);
      const smoothD = safePeriod(stochasticRsi.smoothD, 3);
      const values = addStochasticRsi(source, rsiPeriod, stochPeriod, smoothK, smoothD, stochasticRsi.source);
      if (values.k.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(stochasticRsi.color, isDark ? COLORS.upStrong : '#52765f');
        const live = (candles: Candle[]) => addStochasticRsi(candles, rsiPeriod, stochPeriod, smoothK, smoothD, stochasticRsi.source);
        const kLine = addOscillatorLine(paneIndex, color, `Stoch RSI %K`, values.k, candles => live(candles).k, [0, 100]);
        addOscillatorLine(paneIndex, isDark ? COLORS.average : '#967239', `Stoch RSI %D`, values.d, candles => live(candles).d, [0, 100]);
        for (const level of [stochasticRsi.overbought, stochasticRsi.oversold]) {
          const numericLevel = Number(level);
          kLine.createPriceLine({ price: Math.min(100, Math.max(0, Number.isFinite(numericLevel) ? numericLevel : 50)), color: translucentColor(color, 0.45), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        }
      }
    }
    const atrSettings = indicatorSettings(externalIndicators, 'ATR@tv-basicstudies', { length: 14, color: isDark ? COLORS.average : '#8a6c3d' });
    if (atrSettings) {
      const period = safePeriod(atrSettings.length, 14);
      const points = addAverageTrueRange(source, period);
      if (points.length) {
        const paneIndex = addOscillatorPane();
        const atrSeries = chart.addSeries(LineSeries, {
          color: safeColor(atrSettings.color, isDark ? COLORS.average : '#8a6c3d'),
          title: `ATR ${period}`,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: true,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: currentPrice < 1 ? 6 : currentPrice < 100 ? 4 : 2, minMove: currentPrice < 1 ? 0.000001 : currentPrice < 100 ? 0.0001 : 0.01 },
        }, paneIndex);
        atrSeries.setData(points);
        indicatorSeriesRef.current.push(atrSeries);
        liveRefreshers.push(candles => atrSeries.setData(addAverageTrueRange(candles, period)));
      }
    }
    const macdSettings = indicatorSettings(externalIndicators, 'MACD@tv-basicstudies', { fastLength: 12, slowLength: 26, signalLength: 9, color: isDark ? COLORS.upStrong : '#52765f' });
    if (macdSettings) {
      const fast = safePeriod(macdSettings.fastLength, 12);
      const slow = Math.max(fast + 1, safePeriod(macdSettings.slowLength, 26));
      const signalPeriod = safePeriod(macdSettings.signalLength, 9);
      const values = addMacd(source, fast, slow, signalPeriod, macdSettings.source);
      if (values.histogram.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(macdSettings.color, isDark ? COLORS.upStrong : '#52765f');
        const histogram = chart.addSeries(HistogramSeries, {
          title: 'MACD histogram',
          base: 0,
          lastValueVisible: false,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        }, paneIndex);
        const histogramData = (candles: Candle[]) => addMacd(candles, fast, slow, signalPeriod, macdSettings.source).histogram.map(point => ({ ...point, color: point.value >= 0 ? candleUp : candleDown }));
        histogram.setData(histogramData(source));
        indicatorSeriesRef.current.push(histogram);
        liveRefreshers.push(candles => histogram.setData(histogramData(candles)));
        addOscillatorLine(paneIndex, color, 'MACD', values.macd, candles => addMacd(candles, fast, slow, signalPeriod, macdSettings.source).macd);
        addOscillatorLine(paneIndex, isDark ? '#d3bc87' : '#8a6c3d', 'Signal', values.signal, candles => addMacd(candles, fast, slow, signalPeriod, macdSettings.source).signal);
      }
    }
    const momentum = indicatorSettings(externalIndicators, 'MOM@tv-basicstudies', { length: 10, color: isDark ? COLORS.upStrong : '#52765f' });
    if (momentum) {
      const period = safePeriod(momentum.length, 10);
      const values = addMomentum(source, period, momentum.source, false);
      if (values.length) {
        const paneIndex = addOscillatorPane();
        addOscillatorLine(paneIndex, safeColor(momentum.color, isDark ? COLORS.upStrong : '#52765f'), `Momentum ${period}`, values, candles => addMomentum(candles, period, momentum.source, false));
      }
    }
    const roc = indicatorSettings(externalIndicators, 'ROC@tv-basicstudies', { length: 9, color: isDark ? COLORS.average : '#967239' });
    if (roc) {
      const period = safePeriod(roc.length, 9);
      const values = addMomentum(source, period, roc.source, true);
      if (values.length) {
        const paneIndex = addOscillatorPane();
        addOscillatorLine(paneIndex, safeColor(roc.color, isDark ? COLORS.average : '#967239'), `ROC ${period}`, values, candles => addMomentum(candles, period, roc.source, true));
      }
    }
    const cci = indicatorSettings(externalIndicators, 'CCI@tv-basicstudies', { length: 20, color: isDark ? COLORS.upStrong : '#52765f' });
    if (cci) {
      const period = safePeriod(cci.length, 20);
      const values = addCommodityChannelIndex(source, period);
      if (values.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(cci.color, isDark ? COLORS.upStrong : '#52765f');
        const line = addOscillatorLine(paneIndex, color, `CCI ${period}`, values, candles => addCommodityChannelIndex(candles, period));
        for (const level of [-100, 100]) line.createPriceLine({ price: level, color: translucentColor(color, 0.45), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
      }
    }
    const williams = indicatorSettings(externalIndicators, 'WilliamsPctR@tv-basicstudies', { length: 14, overbought: -20, oversold: -80, color: isDark ? COLORS.average : '#967239' });
    if (williams) {
      const period = safePeriod(williams.length, 14);
      const values = addWilliamsPercentR(source, period);
      if (values.length) {
        const paneIndex = addOscillatorPane();
        const color = safeColor(williams.color, isDark ? COLORS.average : '#967239');
        const line = addOscillatorLine(paneIndex, color, `Williams %R ${period}`, values, candles => addWilliamsPercentR(candles, period), [-100, 0]);
        for (const level of [williams.overbought, williams.oversold]) {
          const numericLevel = Number(level);
          line.createPriceLine({ price: Math.min(0, Math.max(-100, Number.isFinite(numericLevel) ? numericLevel : -50)), color: translucentColor(color, 0.45), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' });
        }
      }
    }
    const historicalVolatility = indicatorSettings(externalIndicators, 'HistoricalVolatility@tv-basicstudies', { length: 20, color: isDark ? COLORS.band : '#497b8e' });
    if (historicalVolatility) {
      const period = safePeriod(historicalVolatility.length, 20);
      const values = addHistoricalVolatility(source, period, timeframeSeconds);
      if (values.length) {
        const paneIndex = addOscillatorPane();
        addOscillatorLine(paneIndex, safeColor(historicalVolatility.color, isDark ? COLORS.band : '#497b8e'), `Volatility ${period}`, values, candles => addHistoricalVolatility(candles, period, timeframeSeconds));
      }
    }
    indicatorRefreshRef.current = data => liveRefreshers.forEach(refresh => refresh(data));
  }, [averageColor, bandColor, candleDown, candleUp, candleUpStrong, externalChartStyle, externalIndicators, externalTimeframe, initialData, indicatorKey, isDark, pairName]);

  // Price-axis formatting also applies to read-only exchange candles.
  useEffect(() => {
    const series = seriesRef.current;
    const referencePrice = currentPrice > 0 ? currentPrice : initialData.at(-1)?.close;
    if (!series || !referencePrice || !Number.isFinite(referencePrice)) return;
    const precision = referencePrice < 1 ? 6 : referencePrice < 100 ? 4 : 2;
    if (pricePrecisionRef.current !== precision) {
      series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } });
      pricePrecisionRef.current = precision;
    }
  }, [currentPrice, initialData, externalChartStyle, externalTimeframe, pairName]);

  // Keep the chart on its original source; exchange candles never use oracle marks.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !initialData.length) return;
    const update = (candle: Candle) => {
      const rows = candlesRef.current;
      const next = mergeLiveCandle(rows, candle);
      if (next === rows) return;
      candlesRef.current = next;
      liveCandleRef.current = candle;
      indicatorRefreshRef.current(next);
      if (externalChartStyle === '2' || externalChartStyle === '3') series.update({ time: candle.time as Time, value: candle.close });
      else if (externalChartStyle === '8') series.update(heikinAshi(next).at(-1)!);
      else series.update({ ...candle, time: candle.time as Time });
    };
    if (initialData[0].source === 'exchange') return subscribeKlines(pairName, externalTimeframe, candle => update({ ...candle, source: 'exchange' }));
    const onPrice = (prices: Record<string, number>) => {
      const meta = pythPriceStream.getMeta(pairName);
      if (!meta || Math.abs(Date.now() / 1000 - meta.publishTime) > 30) return;
      // Calendar bars retain UTC boundaries while labels use the viewer's timezone.
      let seconds = timeframeSeconds;
      let published = meta.publishTime;
      if (externalTimeframe === '1M' || externalTimeframe === '1W') {
        const date = new Date(published * 1000);
        if (externalTimeframe === '1M') date.setUTCDate(1);
        else date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
        date.setUTCHours(0, 0, 0, 0); published = date.getTime() / 1000; seconds = 1;
      }
      const candle = oracleCandle(candlesRef.current, prices[pairName], published, seconds);
      if (candle) update({ ...candle, source: 'pyth' });
    };
    return pythPriceStream.subscribe(onPrice);
  }, [externalChartStyle, timeframeSeconds, pairName, initialData, externalTimeframe]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const lines: any[] = [];
    const normalizePair = (value: string) => value.replace(/[^A-Z]/gi, '').replace(/USD[TC]?$/i, '').toUpperCase();
    if (activePosition?.pair && normalizePair(activePosition.pair) === normalizePair(pairName)) {
      const addRiskLine = (price: number, title: string, color: string) => {
        if (!Number.isFinite(price) || price <= 0) return;
        lines.push(series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        }));
      };
      if (showEntryLine) addRiskLine(Number(activePosition.entryPrice), 'Entry', candleUpStrong);
      if (showTPLine) addRiskLine(Number(activePosition.takeProfit), 'TP', '#77c995');
      if (showSLLine) addRiskLine(Number(activePosition.stopLoss), 'SL', '#df7774');
      if (showLiqLine) addRiskLine(Number(activePosition.liquidationPrice || liqPrice), 'Liq', '#d6a56e');
    }
    riskLinesRef.current = lines;
    return () => {
      for (const line of lines) {
        try { series.removePriceLine(line); } catch { /* series may be disposed */ }
      }
    };
  }, [activePosition, candleUpStrong, externalChartStyle, isDark, liqPrice, pairName, showEntryLine, showLiqLine, showSLLine, showTPLine, theme]);

  return (
    <div style={{ height: '100%', minHeight: 0, position: 'relative', background, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {initialData.length > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 7, border: `1px solid ${isDark ? 'rgba(224,238,228,0.12)' : 'rgba(44,75,53,0.12)'}`, background: isDark ? 'rgba(10,14,12,0.82)' : 'rgba(237,242,238,0.92)', color: foreground, font: '600 9px/1 var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', pointerEvents: 'none' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLivePrice ? candleUp : foreground, opacity: isLivePrice ? 1 : 0.65 }} />
          {historySource}{isLivePrice && initialData[0]?.source === 'pyth' ? ' · mark updates when fresh' : ''}
        </div>
      )}
      {isLoadingOlder && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', top: 10, right: 12, zIndex: 2, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 999, border: `1px solid ${isDark ? 'rgba(224,238,228,0.12)' : 'rgba(44,75,53,0.16)'}`, background: isDark ? 'rgba(10,14,12,0.86)' : 'rgba(221,232,223,0.94)', color: foreground, font: '600 9px/1 var(--font-mono)', letterSpacing: '0.06em', pointerEvents: 'none' }}>
          <span className="chart-history-spinner"><RefreshCw size={11} /></span> Loading older candles
        </div>
      )}
      {!initialData.length && (
        <div className="chart-history-state" aria-live="polite">
          {historyStatus === 'loading' ? (
            <>
              <span className="chart-history-spinner"><RefreshCw size={14} /></span>
              <span>Loading historical candles</span>
            </>
          ) : (
            <>
              <span>Market history is temporarily unavailable</span>
              <button className="chart-history-retry" type="button" onClick={onRetryHistory}>
                <RefreshCw size={13} /> Retry
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});
