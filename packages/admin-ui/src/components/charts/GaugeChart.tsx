import { useId } from "react";
import { arc } from "d3";
import { useMeasure } from "../../hooks/useMeasure";

interface GaugeChartProps {
  /** 0..1 */
  value: number;
  label: string;
  detail?: string;
}

const START_ANGLE = -Math.PI * 0.75;
const END_ANGLE = Math.PI * 0.75;

function gaugeColor(value: number): string {
  if (value >= 0.85) return "#34d399";
  if (value >= 0.5) return "#fbbf24";
  return "#f87171";
}

export function GaugeChart({ value, label, detail }: GaugeChartProps) {
  const [containerRef, { width, height }] = useMeasure<HTMLDivElement>();
  const gradientId = useId();
  const clamped = Math.min(Math.max(value, 0), 1);
  const color = gaugeColor(clamped);

  const size = Math.min(width, height * 1.4);
  const radius = size / 2;

  const track = arc()({
    innerRadius: radius * 0.72,
    outerRadius: radius * 0.92,
    startAngle: START_ANGLE,
    endAngle: END_ANGLE,
  });
  const fill = arc().cornerRadius(6)({
    innerRadius: radius * 0.72,
    outerRadius: radius * 0.92,
    startAngle: START_ANGLE,
    endAngle: START_ANGLE + (END_ANGLE - START_ANGLE) * clamped,
  });

  return (
    <div ref={containerRef} className="relative flex h-full min-h-[170px] w-full items-center justify-center">
      {size > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label}: ${Math.round(clamped * 100)}%`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <g transform={`translate(${width / 2}, ${height / 2 + radius * 0.12})`}>
            {track && <path d={track} fill="rgba(255,255,255,0.06)" />}
            {fill && clamped > 0 && <path d={fill} fill={`url(#${gradientId})`} />}
            <text textAnchor="middle" dy="-0.1em" className="fill-white font-display" fontSize={radius * 0.4} fontWeight={600}>
              {Math.round(clamped * 100)}%
            </text>
            <text textAnchor="middle" dy="1.5em" className="fill-slate-500" fontSize={Math.max(radius * 0.11, 10)}>
              {label}
            </text>
            {detail && (
              <text textAnchor="middle" dy="3.1em" className="fill-slate-600" fontSize={Math.max(radius * 0.1, 9)}>
                {detail}
              </text>
            )}
          </g>
        </svg>
      )}
    </div>
  );
}
