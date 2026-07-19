export interface StatusMeta {
  label: string;
  color: string;
  badge: string;
}

/** Canonical visual identity per status — shared by badges, charts and legends. */
export const STATUS_META: Record<string, StatusMeta> = {
  RUNNING: { label: "Ativa", color: "#34d399", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  PROVISIONING: { label: "Provisionando", color: "#fbbf24", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  PAUSED: { label: "Pausada", color: "#94a3b8", badge: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
  UNHEALTHY: { label: "Instável", color: "#f87171", badge: "bg-red-500/15 text-red-300 ring-red-500/30" },
  STOPPED: { label: "Parada", color: "#64748b", badge: "bg-slate-600/20 text-slate-400 ring-slate-600/30" },
  DELETING: { label: "Removendo", color: "#fb7185", badge: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  PENDING: { label: "Pendente", color: "#fbbf24", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  SUCCESS: { label: "Sucesso", color: "#34d399", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  FAILED: { label: "Falhou", color: "#f87171", badge: "bg-red-500/15 text-red-300 ring-red-500/30" },
  CANCELLED: { label: "Cancelado", color: "#64748b", badge: "bg-slate-600/20 text-slate-400 ring-slate-600/30" },
};

export const FALLBACK_STATUS: StatusMeta = {
  label: "Desconhecido",
  color: "#64748b",
  badge: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { ...FALLBACK_STATUS, label: status };
}

export const HEALTH_META: Record<string, StatusMeta> = {
  healthy: { label: "Saudável", color: "#34d399", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  starting: { label: "Iniciando", color: "#fbbf24", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  unhealthy: { label: "Instável", color: "#f87171", badge: "bg-red-500/15 text-red-300 ring-red-500/30" },
  none: { label: "Sem healthcheck", color: "#64748b", badge: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
};

export function healthMeta(health: string | null | undefined): StatusMeta {
  if (!health) return { ...FALLBACK_STATUS, label: "—" };
  return HEALTH_META[health] ?? { ...FALLBACK_STATUS, label: health };
}
