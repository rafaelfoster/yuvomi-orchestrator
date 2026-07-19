import { useId, useMemo, useState } from "react";
import { area, bisector, curveMonotoneX, extent, line, max, scaleLinear, scaleTime, timeFormat } from "d3";
import { useMeasure } from "../../hooks/useMeasure";
import { ChartTooltip, type TooltipState } from "./ChartTooltip";

export interface TimePoint {
  date: Date;
  value: number;
}

interface AreaChartProps {
  data: TimePoint[];
  color?: string;
  valueLabel: string;
  formatValue?: (value: number) => string;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 34 };
const dateBisector = bisector<TimePoint, Date>((d) => d.date).center;
const formatTick = timeFormat("%d/%m");

export function AreaChart({ data, color = "#34d399", valueLabel, formatValue = String }: AreaChartProps) {
  const [containerRef, { width, height }] = useMeasure<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const gradientId = useId();

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);

  const { xScale, yScale, areaPath, linePath } = useMemo(() => {
    const [minDate, maxDate] = extent(data, (d) => d.date);
    const x = scaleTime()
      .domain(minDate && maxDate ? [minDate, maxDate] : [new Date(), new Date()])
      .range([0, innerWidth]);
    const y = scaleLinear()
      .domain([0, Math.max(max(data, (d) => d.value) ?? 1, 1) * 1.15])
      .range([innerHeight, 0])
      .nice();
    const areaGen = area<TimePoint>()
      .x((d) => x(d.date))
      .y0(innerHeight)
      .y1((d) => y(d.value))
      .curve(curveMonotoneX);
    const lineGen = line<TimePoint>()
      .x((d) => x(d.date))
      .y((d) => y(d.value))
      .curve(curveMonotoneX);
    return { xScale: x, yScale: y, areaPath: areaGen(data), linePath: lineGen(data) };
  }, [data, innerWidth, innerHeight]);

  const yTicks = yScale.ticks(4);
  const xTicks = xScale.ticks(Math.max(Math.min(Math.floor(innerWidth / 90), 6), 2));

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    if (data.length === 0) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const px = event.clientX - bounds.left - MARGIN.left;
    const point = data[Math.min(Math.max(dateBisector(data, xScale.invert(px)), 0), data.length - 1)];
    const cx = xScale(point.date);
    const cy = yScale(point.value);
    setCursor({ x: cx, y: cy });
    setTooltip({
      x: cx + MARGIN.left,
      y: cy + MARGIN.top,
      title: point.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }),
      lines: [{ label: valueLabel, value: formatValue(point.value), color }],
    });
  }

  function clearHover() {
    setCursor(null);
    setTooltip(null);
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-[200px] w-full">
      {innerWidth > 0 && innerHeight > 0 && (
        <svg width={width} height={height} role="img" aria-label={valueLabel}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
            {yTicks.map((tick) => (
              <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                <line x2={innerWidth} stroke="rgba(255,255,255,0.05)" />
                <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} className="fill-slate-500">
                  {tick}
                </text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <text
                key={tick.getTime()}
                x={xScale(tick)}
                y={innerHeight + 16}
                textAnchor="middle"
                fontSize={10}
                className="fill-slate-500"
              >
                {formatTick(tick)}
              </text>
            ))}
            {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
            {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />}
            {cursor && (
              <g>
                <line x1={cursor.x} x2={cursor.x} y1={0} y2={innerHeight} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                <circle cx={cursor.x} cy={cursor.y} r={4.5} fill={color} stroke="#05070d" strokeWidth={2} />
              </g>
            )}
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={clearHover}
            />
          </g>
        </svg>
      )}
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}
