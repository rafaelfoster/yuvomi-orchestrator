import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFleetData } from "../hooks/useFleetData";
import {
  allBackups,
  backupsPerDay,
  dailyCounts,
  fleetKpis,
  statusDistribution,
  tenantGrowthSeries,
} from "../lib/aggregate";
import { formatBytes, timeAgo } from "../lib/format";
import { healthMeta, statusMeta } from "../lib/status";
import { AreaChart } from "../components/charts/AreaChart";
import { DonutChart } from "../components/charts/DonutChart";
import { GaugeChart } from "../components/charts/GaugeChart";
import { Sparkline } from "../components/charts/Sparkline";
import { StackedBarChart } from "../components/charts/StackedBarChart";
import { Card } from "../components/ui/Card";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { IconClock, IconDatabase, IconRefresh, IconShield, IconUsers } from "../components/icons";

export function DashboardPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useFleetData();

  const kpis = useMemo(() => (data ? fleetKpis(data) : null), [data]);
  const growth = useMemo(() => (data ? tenantGrowthSeries(data.tenants) : []), [data]);
  const distribution = useMemo(() => (data ? statusDistribution(data.tenants, t) : []), [data, t]);
  const backupBars = useMemo(() => (data ? backupsPerDay(data.backups, t) : []), [data, t]);
  const recentBackups = useMemo(() => (data ? allBackups(data.backups).slice(0, 6) : []), [data]);
  const tenantSpark = useMemo(
    () => (data ? dailyCounts(data.tenants.map((t) => t.createdAt), 30) : []),
    [data],
  );
  const backupSpark = useMemo(
    () => (data ? dailyCounts(allBackups(data.backups).map((b) => b.startedAt)) : []),
    [data],
  );
  const pendingSchedules = useMemo(
    () => (data ? data.schedules.filter((s) => s.status === "PENDING").slice(0, 5) : []),
    [data],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
        </div>
        <button onClick={() => reload()} className="btn-ghost" disabled={loading}>
          <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("dashboard.refresh")}
        </button>
      </header>

      {error && (
        <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {loading && !data ? (
        <LoadingRows count={4} className="h-28" />
      ) : data && kpis ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={<IconUsers className="h-4 w-4" />}
              label={t("dashboard.kpiFamilies")}
              value={String(kpis.total)}
              hint={t("dashboard.kpiFamiliesHint", { count: kpis.running })}
              spark={tenantSpark}
              color="#34d399"
            />
            <KpiCard
              icon={<IconShield className="h-4 w-4" />}
              label={t("dashboard.kpiHealth")}
              value={kpis.monitored > 0 ? `${kpis.healthy}/${kpis.monitored}` : "—"}
              hint={t("dashboard.kpiHealthHint")}
              spark={[]}
              color="#22d3ee"
            />
            <KpiCard
              icon={<IconDatabase className="h-4 w-4" />}
              label={t("dashboard.kpiBackups")}
              value={String(kpis.backups24h)}
              hint={
                kpis.failed24h > 0
                  ? t("dashboard.kpiBackupsFail", { count: kpis.failed24h })
                  : t("dashboard.kpiBackupsAccrued", { size: formatBytes(kpis.totalBackupBytes) })
              }
              hintTone={kpis.failed24h > 0 ? "danger" : "muted"}
              spark={backupSpark}
              color="#8b5cf6"
            />
            <KpiCard
              icon={<IconClock className="h-4 w-4" />}
              label={t("dashboard.kpiSchedules")}
              value={String(kpis.pendingSchedules)}
              hint={t("dashboard.kpiSchedulesHint")}
              spark={[]}
              color="#fbbf24"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              title={t("dashboard.statusDistribution")}
              subtitle={t("dashboard.statusDistributionSub")}
              className="lg:col-span-1"
              bodyClassName="h-[260px]"
            >
              {distribution.length > 0 ? (
                <DonutChart data={distribution} centerValue={String(kpis.total)} centerLabel={t("dashboard.kpiFamilies")} />
              ) : (
                <EmptyState title={t("dashboard.noFamiliesTitle")} description={t("dashboard.noFamiliesDesc")} />
              )}
            </Card>
            <Card
              title={t("dashboard.growth")}
              subtitle={t("dashboard.growthSub")}
              className="lg:col-span-1"
              bodyClassName="h-[260px]"
            >
              <AreaChart data={growth} valueLabel={t("dashboard.growthValueLabel")} />
            </Card>
            <Card title={t("dashboard.health")} subtitle={t("dashboard.healthSub")} className="lg:col-span-1" bodyClassName="h-[260px]">
              <GaugeChart
                value={kpis.healthRatio}
                label={t("dashboard.kpiHealth").toLowerCase()}
                detail={
                  kpis.monitored > 0
                    ? t("dashboard.healthyOf", { healthy: kpis.healthy, monitored: kpis.monitored })
                    : t("dashboard.noHealthchecks")
                }
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card title={t("dashboard.backupActivity")} subtitle={t("dashboard.backupActivitySub")} className="lg:col-span-3" bodyClassName="h-[260px]">
              <StackedBarChart data={backupBars} />
            </Card>
            <Card title={t("dashboard.instances")} subtitle={t("dashboard.instancesSub")} className="lg:col-span-2" bodyClassName="max-h-[260px] overflow-y-auto">
              {data.tenants.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.tenants.map((tenant) => {
                    const health = healthMeta(tenant.container?.health);
                    return (
                      <li key={tenant.id}>
                        <Link
                          to={`/tenants/${tenant.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]"
                        >
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${tenant.status === "RUNNING" ? "animate-pulse-dot" : ""}`}
                              style={{ backgroundColor: tenant.status === "RUNNING" ? health.color : statusMeta(tenant.status).color }}
                            />
                            <span className="truncate text-sm font-medium text-slate-200">{tenant.name}</span>
                            <span className="truncate text-xs text-slate-600">{tenant.subdomain}</span>
                          </span>
                          <StatusBadge status={tenant.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title={t("dashboard.noInstances")} />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title={t("dashboard.recentBackups")} subtitle={t("dashboard.recentBackupsSub")}>
              {recentBackups.length > 0 ? (
                <ul className="divide-y divide-white/[0.04]">
                  {recentBackups.map((backup) => (
                    <li key={backup.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link to={`/tenants/${backup.tenantId}`} className="text-sm font-medium text-slate-200 hover:text-accent-soft">
                          {backup.tenantName}
                        </Link>
                        <p className="text-xs text-slate-600">
                          {timeAgo(backup.startedAt)} · {formatBytes(backup.sizeBytes)}
                        </p>
                      </div>
                      <StatusBadge status={backup.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={t("dashboard.noBackupsTitle")} description={t("dashboard.noBackupsDesc")} />
              )}
            </Card>
            <Card
              title={t("dashboard.upcomingSchedules")}
              subtitle={t("dashboard.upcomingSchedulesSub")}
              actions={
                <Link to="/schedules" className="text-xs font-medium text-accent-soft hover:underline">
                  {t("dashboard.viewAll")}
                </Link>
              }
            >
              {pendingSchedules.length > 0 ? (
                <ul className="divide-y divide-white/[0.04]">
                  {pendingSchedules.map((schedule) => (
                    <li key={schedule.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200">
                          {schedule.type === "UPDATE" ? t("dashboard.imageUpdate") : t("dashboard.restart")}
                          <span className="ml-2 text-xs font-normal text-slate-600">
                            {schedule.tenantId ? t("dashboard.oneFamily") : t("dashboard.allInstances")}
                          </span>
                        </p>
                        <p className="text-xs text-slate-600">
                          {schedule.cronExpression ? `cron: ${schedule.cronExpression}` : timeAgo(schedule.runAt)}
                        </p>
                      </div>
                      <StatusBadge status={schedule.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title={t("dashboard.noSchedulesTitle")} description={t("dashboard.noSchedulesDesc")} />
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  hintTone = "muted",
  spark,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  hintTone?: "muted" | "danger";
  spark: number[];
  color: string;
}) {
  return (
    <div className="glass-panel group animate-fade-up p-5 transition-all hover:border-white/[0.12]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10" style={{ color }}>
            {icon}
          </span>
          {label}
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className={`mt-1 text-xs ${hintTone === "danger" ? "text-red-400" : "text-slate-500"}`}>{hint}</p>
      {spark.length > 1 && (
        <div className="mt-2 opacity-70 transition-opacity group-hover:opacity-100">
          <Sparkline data={spark} color={color} />
        </div>
      )}
    </div>
  );
}
