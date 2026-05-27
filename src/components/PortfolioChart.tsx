
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, Time, CrosshairMode } from 'lightweight-charts';

interface PortfolioChartProps {
  data: { time: string | number; value: number }[];
  theme: 'light' | 'dark';
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ data, theme }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    left: number;
    top: number;
    value: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Use the actual panel background color so lightweight-charts canvas blends in.
    // The panel uses --bg-base-2 which maps to #0b0d12 (dark) / #f3f1fa (light).
    const bgColor = theme === 'dark' ? '#0b0d12' : '#f0eef8';
    const colors = {
        background: bgColor,
        text: theme === 'dark' ? '#9ca3af' : '#50506a',
    };

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
        fontFamily: "'-apple-system', sans-serif",
      },
      width: chartContainerRef.current.clientWidth || 300,
      height: chartContainerRef.current.clientHeight || 200,
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      crosshair: {
          vertLine: { visible: true, labelVisible: false, style: 2, color: theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)' },
          horzLine: { visible: false, labelVisible: false },
          mode: CrosshairMode.Magnet,
      },
      handleScale: false,
      handleScroll: false,
    });

    const series = chart.addSeries(AreaSeries, {
        lineColor: 'oklch(0.68 0.22 295)',
        topColor: 'oklch(0.68 0.22 295 / 0.35)',
        bottomColor: 'oklch(0.68 0.22 295 / 0.0)',
        lineWidth: 2,
    });

    if (data && data.length > 0) {
        const chartData = data.map((d, i) => ({
            time: (Math.floor(Date.now() / 1000) - (data.length - i) * 86400) as Time, 
            value: d.value,
            customDate: d.time // Keep original string for tooltip
        }));
        series.setData(chartData);
        chart.timeScale().fitContent();

        // Subscribe to crosshair move
        chart.subscribeCrosshairMove((param) => {
            if (
                param.point === undefined ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > chartContainerRef.current!.clientWidth ||
                param.point.y < 0 ||
                param.point.y > chartContainerRef.current!.clientHeight
            ) {
                setTooltip(null);
            } else {
                const price = param.seriesData.get(series);
                if (price) {
                    const priceValue = (price as any).value;
                    // Find original date string if possible, else approximate
                    const index = chartData.findIndex(x => x.time === param.time);
                    const dateStr = index !== -1 ? chartData[index].customDate : new Date().toLocaleDateString();

                    setTooltip({
                        visible: true,
                        left: param.point.x,
                        top: 20, // Fixed top position
                        value: `$${priceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        date: String(dateStr)
                    });
                }
            }
        });
    }

    chartRef.current = chart;

    return () => {
        resizeObserver.disconnect();
        if (chartRef.current) {
            chart.remove();
            chartRef.current = null;
        }
    };
  }, [data, theme]);

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
