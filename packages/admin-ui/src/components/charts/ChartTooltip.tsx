export interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: Array<{ label: string; value: string; color?: string }>;
}

export function ChartTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  if (!tooltip) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[9rem] -translate-x-1/2 rounded-xl border border-white/10 bg-ink-900/95 p-3 shadow-panel backdrop-blur-md"
      style={{ left: tooltip.x, top: Math.max(tooltip.y - 8, 0), transform: "translate(-50%, -100%)" }}
    >
      <p className="mb-1.5 font-display text-xs font-semibold text-white">{tooltip.title}</p>
      <div className="space-y-1">
        {tooltip.lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              {line.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />}
              {line.label}
            </span>
            <span className="font-medium text-slate-200">{line.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
