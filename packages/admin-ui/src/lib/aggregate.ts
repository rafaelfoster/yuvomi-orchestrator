import type { TimePoint } from "../components/charts/AreaChart";
import type { StackedBarDatum } from "../components/charts/StackedBarChart";
import type { DonutSlice } from "../components/charts/DonutChart";
import type { BackupLog, Tenant } from "../api/client";
import type { FleetData, TenantBackups } from "../hooks/useFleetData";
import { statusMeta } from "./status";
import { formatDate } from "./format";

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Cumulative tenant count per day over the trailing window (always includes today). */
export function tenantGrowthSeries(tenants: Tenant[], days = 30): TimePoint[] {
  const today = startOfDay(new Date());
  const createdTimes = tenants.map((t) => new Date(t.createdAt).getTime()).sort((a, b) => a - b);
  const points: TimePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const endOfDayTime = day.getTime() + DAY_MS;
    let count = 0;
    for (const created of createdTimes) {
      if (created < endOfDayTime) count++;
      else break;
    }
    points.push({ date: day, value: count });
  }
  return points;
}

export function statusDistribution(tenants: Tenant[], translate: (key: string, fallback: string) => string): DonutSlice[] {
  const order = ["RUNNING", "PROVISIONING", "PAUSED", "UNHEALTHY", "STOPPED", "DELETING"];
  const counts = new Map<string, number>();
  for (const tenant of tenants) {
    counts.set(tenant.status, (counts.get(tenant.status) ?? 0) + 1);
  }
  return order
    .filter((status) => counts.has(status))
    .map((status) => {
      const meta = statusMeta(status);
      return { key: status, label: translate(`status.${status}`, meta.label), value: counts.get(status) ?? 0, color: meta.color };
    });
}

export function allBackups(backups: TenantBackups[]): Array<BackupLog & { tenantName: string; tenantId: string }> {
  return backups
    .flatMap((group) => group.backups.map((b) => ({ ...b, tenantName: group.tenantName, tenantId: group.tenantId })))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/** Backups per day (success vs failed) over the trailing window. */
export function backupsPerDay(
  backups: TenantBackups[],
  translate: (key: string, fallback: string) => string,
  days = 14,
): StackedBarDatum[] {
  const today = startOfDay(new Date());
  const flat = allBackups(backups);
  const result: StackedBarDatum[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const nextDay = day.getTime() + DAY_MS;
    let success = 0;
    let failed = 0;
    for (const backup of flat) {
      const time = new Date(backup.startedAt).getTime();
      if (time >= day.getTime() && time < nextDay) {
        if (backup.status === "SUCCESS") success++;
        else if (backup.status === "FAILED") failed++;
      }
    }
    result.push({
      key: day.toISOString(),
      label: formatDate(day.toISOString()),
      segments: [
        { key: "success", label: translate("status.SUCCESS", "Success"), value: success, color: "#34d399" },
        { key: "failed", label: translate("status.FAILED", "Failed"), value: failed, color: "#f87171" },
      ],
    });
  }
  return result;
}

export interface FleetKpis {
  total: number;
  running: number;
  healthy: number;
  monitored: number;
  healthRatio: number;
  backups24h: number;
  failed24h: number;
  totalBackupBytes: number;
  pendingSchedules: number;
}

export function fleetKpis(data: FleetData): FleetKpis {
  const running = data.tenants.filter((t) => t.status === "RUNNING");
  const monitored = running.filter((t) => t.container && t.container.health !== "none");
  const healthy = monitored.filter((t) => t.container?.health === "healthy");
  const cutoff = Date.now() - DAY_MS;
  const flat = allBackups(data.backups);
  const recent = flat.filter((b) => new Date(b.startedAt).getTime() >= cutoff);
  return {
    total: data.tenants.length,
    running: running.length,
    healthy: healthy.length,
    monitored: monitored.length,
    healthRatio: monitored.length > 0 ? healthy.length / monitored.length : running.length > 0 ? 1 : 0,
    backups24h: recent.filter((b) => b.status === "SUCCESS").length,
    failed24h: recent.filter((b) => b.status === "FAILED").length,
    totalBackupBytes: flat.reduce((sum, b) => sum + (b.sizeBytes ?? 0), 0),
    pendingSchedules: data.schedules.filter((s) => s.status === "PENDING").length,
  };
}

/** Daily counts for sparklines (last N days) from a list of ISO timestamps. */
export function dailyCounts(timestamps: string[], days = 14): number[] {
  const today = startOfDay(new Date());
  const counts = new Array<number>(days).fill(0);
  for (const iso of timestamps) {
    const diff = Math.floor((today.getTime() + DAY_MS - new Date(iso).getTime()) / DAY_MS);
    if (diff >= 0 && diff < days) counts[days - 1 - diff] += 1;
  }
  return counts;
}
