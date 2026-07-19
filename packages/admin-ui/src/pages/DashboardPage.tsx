import { useMemo } from "react";
import { Link } from "react-router-dom";
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
  const { data, loading, error, reload } = useFleetData();

  const kpis = useMemo(() => (data ? fleetKpis(data) : null), [data]);
  const growth = useMemo(() => (data ? tenantGrowthSeries(data.tenants) : []), [data]);
  const distribution = useMemo(() => (data ? statusDistribution(data.tenants) : []), [data]);
  const backupBars = useMemo(() => (data ? backupsPerDay(data.backups) : []), [data]);
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">Visão geral</h1>
          <p className="mt-1 text-sm text-slate-500">
            Panorama da frota de instâncias Yuvomi — atualizado a cada 30 segundos.
          </p>
        </div>
        <button onClick={() => reload()} className="btn-ghost" disabled={loading}>
          <IconRefresh className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
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
              label="Famílias"
              value={String(kpis.total)}
              hint={`${kpis.running} ativas agora`}
              spark={tenantSpark}
              color="#34d399"
            />
            <KpiCard
              icon={<IconShield className="h-4 w-4" />}
              label="Saúde da frota"
              value={kpis.monitored > 0 ? `${kpis.healthy}/${kpis.monitored}` : "—"}
              hint="containers saudáveis"
              spark={[]}
              color="#22d3ee"
            />
            <KpiCard
              icon={<IconDatabase className="h-4 w-4" />}
              label="Backups (24h)"
              value={String(kpis.backups24h)}
              hint={kpis.failed24h > 0 ? `${kpis.failed24h} falha(s)` : `${formatBytes(kpis.totalBackupBytes)} acumulados`}
              hintTone={kpis.failed24h > 0 ? "danger" : "muted"}
              spark={backupSpark}
              color="#8b5cf6"
            />
            <KpiCard
              icon={<IconClock className="h-4 w-4" />}
              label="Agendamentos"
              value={String(kpis.pendingSchedules)}
              hint="pendentes de execução"
              spark={[]}
              color="#fbbf24"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Distribuição de status" subtitle="Estado atual das famílias" className="lg:col-span-1" bodyClassName="h-[260px]">
              {distribution.length > 0 ? (
                <DonutChart data={distribution} centerValue={String(kpis.total)} centerLabel="famílias" />
              ) : (
                <EmptyState title="Nenhuma família ainda" description="Provisione a primeira família para ver o panorama." />
              )}
            </Card>
            <Card title="Crescimento" subtitle="Famílias acumuladas — últimos 30 dias" className="lg:col-span-1" bodyClassName="h-[260px]">
              <AreaChart data={growth} valueLabel="Famílias" />
            </Card>
            <Card title="Saúde" subtitle="Containers com healthcheck saudável" className="lg:col-span-1" bodyClassName="h-[260px]">
              <GaugeChart
                value={kpis.healthRatio}
                label="frota saudável"
                detail={kpis.monitored > 0 ? `${kpis.healthy} de ${kpis.monitored} monitorados` : "sem healthchecks ativos"}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card title="Atividade de backups" subtitle="Últimos 14 dias" className="lg:col-span-3" bodyClassName="h-[260px]">
              <StackedBarChart data={backupBars} />
            </Card>
            <Card title="Frota" subtitle="Saúde por família" className="lg:col-span-2" bodyClassName="max-h-[260px] overflow-y-auto">
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
                <EmptyState title="Frota vazia" />
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Backups recentes" subtitle="Últimas execuções em toda a frota">
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
                <EmptyState title="Nenhum backup registrado" description="Backups aparecem aqui assim que forem executados." />
              )}
            </Card>
            <Card
              title="Próximos agendamentos"
              subtitle="Tarefas pendentes"
              actions={
                <Link to="/schedules" className="text-xs font-medium text-accent-soft hover:underline">
                  Ver todos
                </Link>
              }
            >
              {pendingSchedules.length > 0 ? (
                <ul className="divide-y divide-white/[0.04]">
                  {pendingSchedules.map((schedule) => (
                    <li key={schedule.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200">
                          {schedule.type === "UPDATE" ? "Atualização de imagem" : "Reinício"}
                          <span className="ml-2 text-xs font-normal text-slate-600">
                            {schedule.tenantId ? "1 família" : "toda a frota"}
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
                <EmptyState title="Nada agendado" description="Crie agendamentos de atualização ou reinício." />
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
