
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, Time, CrosshairMode } from 'lightweight-charts';

interface PortfolioChartProps {
  data: { time: string | number; value: number }[];
  theme: 'light' | 'dark';
}

// Internal point shape used on the series. `customDate` carries the original
// human-readable label so the crosshair tooltip can show it.
type ChartPoint = { time: Time; value: number; customDate: string | number };

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data, theme }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  // Latest mapped points, read by the crosshair handler without re-subscribing.
  const pointsRef = useRef<ChartPoint[]>([]);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    left: number;
    top: number;
    value: string;
    date: string;
  } | null>(null);

  // ── Effect 1: create the chart exactly once per theme ────────────────────
  // WHY split this out: `data` is recomputed into a fresh array on every App
  // render, and marketPrices ticks several times per second. The previous
  // single-effect implementation listed `data` as a dependency, so the whole
  // chart was destroyed and recreated (createChart + ResizeObserver + crosshair
  // subscription) on every price tick — multiple full chart rebuilds per
  // second. On the Dashboard that pegged the main thread and froze the tab.
  // Now the chart is built once; data updates flow through Effect 2 below via
  // series.setData(), which is cheap and never tears anything down.
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const colors = {
      text: theme === 'dark' ? '#9ca3af' : '#50506a',
    };

    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!entries || entries.length === 0 || !entries[0].contentRect) return;
        if (chartRef.current) {
          const { width, height } = entries[0].contentRect;
          if (width > 0 && height > 0) {
            chartRef.current.applyOptions({ width, height });
          }
        }
      });
    });
    resizeObserver.observe(chartContainerRef.current);

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'rgba(0, 0, 0, 0)' },
        textColor: colors.text,
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      width: chartContainerRef.current.clientWidth || 300,
      height: chartContainerRef.current.clientHeight || 200,
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: { visible: false, borderVisible: false },
      rightPriceScale: { visible: false, borderVisible: false },
      crosshair: {
        vertLine: { visible: true, labelVisible: false, style: 2, color: theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)' },
        horzLine: { visible: false, labelVisible: false },
        mode: CrosshairMode.Magnet,
      },
      handleScale: false,
      handleScroll: false,
    });

    // lightweight-charts does not parse modern OKLCH color syntax — it expects
    // hex / rgb / rgba and throws "Failed to parse color" otherwise. We hardcode
    // the rgba equivalent of `oklch(0.68 0.22 295)` (Velo iris violet).
    const series = chart.addSeries(AreaSeries, {
      lineColor: 'rgb(140, 90, 255)',
      topColor: theme === 'dark' ? 'rgba(140, 90, 255, 0.38)' : 'rgba(120, 70, 240, 0.20)',
      bottomColor: theme === 'dark' ? 'rgba(120, 70, 240, 0.0)' : 'rgba(140, 90, 255, 0.0)',
      lineWidth: 2,
    });

    chart.subscribeCrosshairMove((param) => {
      const el = chartContainerRef.current;
      if (
        !el ||
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > el.clientWidth ||
        param.point.y < 0 ||
        param.point.y > el.clientHeight
      ) {
        setTooltip(null);
        return;
      }
      const price = param.seriesData.get(series);
      if (!price) return;
      const priceValue = (price as any).value;
      const pts = pointsRef.current;
      const idx = pts.findIndex((x) => x.time === param.time);
      const dateStr = idx !== -1 ? pts[idx].customDate : new Date().toLocaleDateString();
      setTooltip({
        visible: true,
        left: param.point.x,
        top: 20,
        value: `$${priceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        date: String(dateStr),
      });
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Seed the series with whatever data is present at creation time so the
    // chart isn't briefly empty before Effect 2 runs.
    if (data && data.length > 0) {
      const pts: ChartPoint[] = data.map((d, i) => ({
        time: (Math.floor(Date.now() / 1000) - (data.length - i) * 86400) as Time,
        value: d.value,
        customDate: d.time,
      }));
      pointsRef.current = pts;
      series.setData(pts);
      chart.timeScale().fitContent();
    }

    return () => {
      resizeObserver.disconnect();
      try { chart.remove(); } catch { /* already disposed */ }
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Effect 2: push data updates without rebuilding the chart ─────────────
  // Runs on every `data` change but only calls series.setData() — O(n) and
  // cheap, no DOM teardown. This is what makes frequent (sub-second) equity
  // updates safe on the Dashboard.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    if (!data || data.length === 0) {
      pointsRef.current = [];
      try { series.setData([]); } catch { /* ignore */ }
      return;
    }
    const pts: ChartPoint[] = data.map((d, i) => ({
      time: (Math.floor(Date.now() / 1000) - (data.length - i) * 86400) as Time,
      value: d.value,
      customDate: d.time,
    }));
    pointsRef.current = pts;
    try {
      series.setData(pts);
      chart.timeScale().fitContent();
    } catch { /* chart disposed mid-update */ }
  }, [data]);

  return (
    <div ref={chartContainerRef} className="w-full h-full relative cursor-crosshair">
      {tooltip && (
        <div
          style={{
            position: 'absolute', zIndex: 50, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)',
            padding: '6px 10px', borderRadius: 8, backdropFilter: 'blur(16px)',
            boxShadow: 'var(--glass-shadow)',
            left: Math.min(Math.max(tooltip.left - 60, 0), (chartContainerRef.current?.clientWidth || 300) - 120),
            top: tooltip.top,
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--fg)' }}>{tooltip.value}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)' }}>{tooltip.date}</div>
        </div>
      )}
    </div>
  );
};
