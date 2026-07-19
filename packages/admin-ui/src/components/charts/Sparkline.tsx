import { useId, useMemo } from "react";
import { area, curveMonotoneX, line, max, scaleLinear } from "d3";
import { useMeasure } from "../../hooks/useMeasure";

interface SparklineProps {
  data: number[];
  color?: string;
}

export function Sparkline({ data, color = "#34d399" }: SparklineProps) {
  const [containerRef, { width, height }] = useMeasure<HTMLDivElement>();
  const gradientId = useId();

  const { areaPath, linePath } = useMemo(() => {
    if (data.length < 2 || width === 0 || height === 0) return { areaPath: null, linePath: null };
    const x = scaleLinear().domain([0, data.length - 1]).range([0, width]);
    const y = scaleLinear()
      .domain([0, Math.max(max(data) ?? 1, 1)])
      .range([height - 2, 2]);
    const areaGen = area<number>()
      .x((_, i) => x(i))
      .y0(height)
      .y1((d) => y(d))
      .curve(curveMonotoneX);
    const lineGen = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX);
    return { areaPath: areaGen(data), linePath: lineGen(data) };
  }, [data, width, height]);

  return (
    <div ref={containerRef} className="h-10 w-full" aria-hidden>
      {linePath && (
        <svg width={width} height={height}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
          <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
