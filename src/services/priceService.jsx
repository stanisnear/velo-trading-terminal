import { useState, useEffect, useRef, useCallback } from "react";
import { PAIRS, GECKO_IDS, FALLBACK_PRICES } from "../utils/constants.jsx";
import { genCandles } from "../utils/helpers.jsx";

// ─── PRICE FEED HOOK ───────────────────────────────────────────────────
// Fetches real prices from CoinGecko every 15s with micro-simulation between
export function usePriceFeed() {
  const [prices, setPrices] = useState({ ...FALLBACK_PRICES });
  const [changes24h, setChanges24h] = useState({});
  const [status, setStatus] = useState("connecting"); // "live" | "simulated" | "connecting"
  const [sparklines, setSparklines] = useState({});
  const [candles, setCandles] = useState({});
  const lastFetch = useRef(0);
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  // Initialize candles + sparklines from fallback
  useEffect(() => {
    const c = {}, s = {};
    for (const [id, p] of Object.entries(FALLBACK_PRICES)) {
      c[id] = genCandles(p, 200);
      s[id] = Array.from({ length: 30 }, (_, i) => p * (0.985 + Math.random() * 0.03));
    }
    setCandles(c);
    setSparklines(s);
  }, []);

  // Fetch from CoinGecko
  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const newPrices = {};
      const newChanges = {};

      for (const pair of PAIRS) {
        const d = data[pair.geckoId];
        if (d?.usd) {
          newPrices[pair.id] = d.usd;
          if (d.usd_24h_change != null) newChanges[pair.id] = d.usd_24h_change;
        }
      }

      if (Object.keys(newPrices).length > 0) {
        setPrices(prev => ({ ...prev, ...newPrices }));
        setChanges24h(prev => ({ ...prev, ...newChanges }));
        setStatus("live");
        lastFetch.current = Date.now();

        // Update candles with real price
        setCandles(prev => {
          const updated = { ...prev };
          for (const [id, p] of Object.entries(newPrices)) {
            if (!updated[id] || updated[id].length < 10) {
              updated[id] = genCandles(p, 200);
            } else {
              // Update last candle close to real price
              const arr = [...updated[id]];
              const last = { ...arr[arr.length - 1] };
              last.close = p;
              last.high = Math.max(last.high, p);
              last.low = Math.min(last.low, p);
              arr[arr.length - 1] = last;
              updated[id] = arr;
            }
          }
          return updated;
        });
      }
    } catch (e) {
      console.warn("CoinGecko fetch failed:", e.message);
      if (status === "connecting") setStatus("simulated");
    }
  }, [status]);

  // Initial fetch + polling every 15s
  useEffect(() => {
    fetchPrices();
    const iv = setInterval(fetchPrices, 15000);
    return () => clearInterval(iv);
  }, [fetchPrices]);

  // Micro-simulation between API calls (every 800ms)
  useEffect(() => {
    const iv = setInterval(() => {
      setPrices(prev => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const v = next[id] * 0.00025;
          next[id] += (Math.random() - 0.5) * v;
          if (next[id] < 0) next[id] = Math.abs(next[id]);
        }
        return next;
      });

      // Update last candle
      setCandles(prev => {
        const updated = { ...prev };
        for (const id of Object.keys(updated)) {
          if (updated[id] && updated[id].length > 0) {
            const arr = [...updated[id]];
            const last = { ...arr[arr.length - 1] };
            const cp = pricesRef.current[id] || last.close;
            last.close = cp;
            last.high = Math.max(last.high, cp);
            last.low = Math.min(last.low, cp);
            last.volume += Math.random() * 500;
            arr[arr.length - 1] = last;

            // Every ~60 ticks, push a new candle
            const now = Math.floor(Date.now() / 1000);
            if (now - last.time > 900) {
              arr.push({ time: now, open: cp, high: cp, low: cp, close: cp, volume: 1000 + Math.random() * 5000 });
              if (arr.length > 300) arr.shift();
            }
            updated[id] = arr;
          }
        }
        return updated;
      });

      // Update sparklines
      setSparklines(prev => {
        const updated = { ...prev };
        for (const id of Object.keys(pricesRef.current)) {
          if (updated[id]) {
            updated[id] = [...updated[id].slice(1), pricesRef.current[id]];
          } else {
            updated[id] = [pricesRef.current[id]];
          }
        }
        return updated;
      });
    }, 800);
    return () => clearInterval(iv);
  }, []);

  return { prices, changes24h, status, sparklines, candles, setCandles };
}
