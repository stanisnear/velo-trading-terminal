
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

    const colors = {
        background: 'transparent',
        text: theme === 'dark' ? '#9ca3af' : '#4b5563',
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
        lineColor: '#3b82f6',
        topColor: 'rgba(59, 130, 246, 0.4)',
        bottomColor: 'rgba(59, 130, 246, 0.0)',
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
                className="absolute z-50 pointer-events-none flex flex-col items-center bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-white/10 p-2 rounded-lg shadow-xl"
                style={{ left: Math.min(Math.max(tooltip.left - 60, 0), (chartContainerRef.current?.clientWidth || 300) - 120), top: tooltip.top }}
            >
                <div className="text-gray-900 dark:text-white font-black text-sm">{tooltip.value}</div>
                <div className="text-gray-500 text-[10px] font-bold">{tooltip.date}</div>
            </div>
        )}
    </div>
  );
};
