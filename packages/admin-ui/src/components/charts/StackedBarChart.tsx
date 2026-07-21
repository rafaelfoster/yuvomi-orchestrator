import { useMemo, useState } from "react";
import { max, scaleBand, scaleLinear } from "d3";
import { useTranslation } from "react-i18next";
import { useMeasure } from "../../hooks/useMeasure";
import { ChartTooltip, type TooltipState } from "./ChartTooltip";

export interface StackedBarDatum {
  key: string;
  label: string;
  segments: Array<{ key: string; label: string; value: number; color: string }>;
}

interface StackedBarChartProps {
  data: StackedBarDatum[];
  formatValue?: (value: number) => string;
}

const MARGIN = { top: 12, right: 8, bottom: 24, left: 30 };

export function StackedBarChart({ data, formatValue = String }: StackedBarChartProps) {
  const { t } = useTranslation();
  const [containerRef, { width, height }] = useMeasure<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const totals = useMemo(
    () => data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)),
    [data],
  );

  const xScale = useMemo(
    () =>
      scaleBand()
        .domain(data.map((d) => d.key))
        .range([0, innerWidth])
        .paddingInner(0.35)
        .paddingOuter(0.1),
    [data, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, Math.max(max(totals) ?? 1, 1)])
        .range([innerHeight, 0])
        .nice(),
    [totals, innerHeight],
  );

  const labelEvery = Math.max(Math.ceil(data.length / Math.max(Math.floor(innerWidth / 60), 1)), 1);

  function handleHover(event: React.MouseEvent, datum: StackedBarDatum, total: number) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setActiveKey(datum.key);
    setTooltip({
      x: (xScale(datum.key) ?? 0) + xScale.bandwidth() / 2 + MARGIN.left,
      y: yScale(total) + MARGIN.top,
      title: datum.label,
      lines: datum.segments.map((s) => ({ label: s.label, value: formatValue(s.value), color: s.color })),
    });
  }

  function clearHover() {
    setActiveKey(null);
    setTooltip(null);
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-[200px] w-full">
      {innerWidth > 0 && innerHeight > 0 && (
        <svg width={width} height={height} role="img" aria-label={t("chart.barChart")}>
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {yScale.ticks(4).map((tick) => (
              <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                <line x2={innerWidth} stroke="rgba(255,255,255,0.05)" />
                <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} className="fill-slate-500">
                  {tick}
                </text>
              </g>
            ))}
            {data.map((datum, i) => {
              const x = xScale(datum.key) ?? 0;
              const bandwidth = xScale.bandwidth();
              const total = totals[i];
              let stackY = innerHeight;
              return (
                <g
                  key={datum.key}
                  opacity={activeKey && activeKey !== datum.key ? 0.4 : 1}
                  className="transition-opacity duration-200"
                  onMouseMove={(e) => handleHover(e, datum, total)}
                  onMouseLeave={clearHover}
                >
                  <rect x={x} y={0} width={bandwidth} height={innerHeight} fill="transparent" />
                  {total === 0 && (
                    <rect x={x} y={innerHeight - 2} width={bandwidth} height={2} rx={1} fill="rgba(255,255,255,0.06)" />
                  )}
                  {datum.segments.map((segment) => {
                    if (segment.value <= 0) return null;
                    const segmentHeight = innerHeight - yScale(segment.value);
                    stackY -= segmentHeight;
                    return (
                      <rect
                        key={segment.key}
                        x={x}
                        y={stackY}
                        width={bandwidth}
                        height={Math.max(segmentHeight - 1, 1)}
                        rx={2}
                        fill={segment.color}
                        opacity={0.9}
                      />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text
                      x={x + bandwidth / 2}
                      y={innerHeight + 16}
                      textAnchor="middle"
                      fontSize={10}
                      className="fill-slate-500"
                    >
                      {datum.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}
