import { useMemo, useState } from "react";
import { arc, pie, type PieArcDatum } from "d3";
import { useMeasure } from "../../hooks/useMeasure";
import { ChartTooltip, type TooltipState } from "./ChartTooltip";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  centerLabel: string;
  centerValue: string;
}

export function DonutChart({ data, centerLabel, centerValue }: DonutChartProps) {
  const [containerRef, { width, height }] = useMeasure<HTMLDivElement>();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const visible = data.filter((d) => d.value > 0);
  const total = visible.reduce((sum, d) => sum + d.value, 0);

  const arcs = useMemo(() => {
    const generator = pie<DonutSlice>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.03);
    return generator(visible);
  }, [visible]);

  const size = Math.min(width, height);
  const radius = size / 2;
  const arcGen = useMemo(
    () =>
      arc<PieArcDatum<DonutSlice>>()
        .innerRadius(radius * 0.68)
        .outerRadius(radius * 0.92)
        .cornerRadius(4),
    [radius],
  );
  const arcGenActive = useMemo(
    () =>
      arc<PieArcDatum<DonutSlice>>()
        .innerRadius(radius * 0.66)
        .outerRadius(radius * 0.98)
        .cornerRadius(4),
    [radius],
  );

  function handleHover(event: React.MouseEvent, slice: PieArcDatum<DonutSlice>) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setActiveKey(slice.data.key);
    setTooltip({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      title: slice.data.label,
      lines: [
        { label: "Quantidade", value: String(slice.data.value), color: slice.data.color },
        { label: "Proporção", value: total > 0 ? `${Math.round((slice.data.value / total) * 100)}%` : "—" },
      ],
    });
  }

  function clearHover() {
    setActiveKey(null);
    setTooltip(null);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div ref={containerRef} className="relative min-h-[180px] flex-1">
        {size > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${centerLabel}: ${centerValue}`}>
            <g transform={`translate(${width / 2}, ${height / 2})`}>
              {visible.length === 0 && (
                <circle r={radius * 0.8} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={radius * 0.22} />
              )}
              {arcs.map((slice) => (
                <path
                  key={slice.data.key}
                  d={(activeKey === slice.data.key ? arcGenActive(slice) : arcGen(slice)) ?? undefined}
                  fill={slice.data.color}
                  opacity={activeKey && activeKey !== slice.data.key ? 0.35 : 0.9}
                  className="cursor-pointer transition-opacity duration-200"
                  onMouseMove={(e) => handleHover(e, slice)}
                  onMouseLeave={clearHover}
                />
              ))}
              <text textAnchor="middle" dy="-0.2em" className="fill-white font-display" fontSize={radius * 0.42} fontWeight={600}>
                {centerValue}
              </text>
              <text textAnchor="middle" dy="1.6em" className="fill-slate-500" fontSize={Math.max(radius * 0.11, 10)}>
                {centerLabel}
              </text>
            </g>
          </svg>
        )}
        <ChartTooltip tooltip={tooltip} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((slice) => (
          <span key={slice.key} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
            {slice.label}
            <span className="font-medium text-slate-200">{slice.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
