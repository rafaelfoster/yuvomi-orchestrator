import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { schedulesApi, tenantsApi, type Schedule, type Tenant } from "../api/client";
import { extractApiError } from "../hooks/useFleetData";
import { LATEST_TAG, useReleaseTags } from "../hooks/useReleaseTags";
import { formatDateTime } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { IconClock, IconPlus } from "../components/icons";

export function SchedulesPage() {
  const { t } = useTranslation();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setError(null);
    try {
      const [scheduleList, tenantList] = await Promise.all([schedulesApi.list(), tenantsApi.list()]);
      setSchedules(scheduleList);
      setTenants(tenantList);
    } catch (err) {
      setError(extractApiError(err, t("schedules.loadError")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tenantNames = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant.name])), [tenants]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t("schedules.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("schedules.subtitle")}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          {t("schedules.newSchedule")}
        </button>
      </header>

      {error && <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <LoadingRows count={4} className="h-14" />
      ) : schedules.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={<IconClock className="h-8 w-8" />}
            title={t("schedules.noSchedulesTitle")}
            description={t("schedules.noSchedulesDesc")}
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <IconPlus className="h-4 w-4" />
                {t("schedules.newSchedule")}
              </button>
            }
          />
        </div>
      ) : (
        <div className="glass-panel animate-fade-up overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.05] text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5 font-medium">{t("schedules.tableType")}</th>
                <th className="px-5 py-3.5 font-medium">{t("schedules.tableTarget")}</th>
                <th className="px-5 py-3.5 font-medium">{t("schedules.tableSchedule")}</th>
                <th className="px-5 py-3.5 font-medium">{t("schedules.tableLastRun")}</th>
                <th className="px-5 py-3.5 font-medium">{t("schedules.tableStatus")}</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-white">
                      {schedule.type === "UPDATE" ? t("schedules.updateImage") : t("schedules.restart")}
                    </span>
                    {schedule.targetImage && (
                      <span className="block max-w-[220px] truncate font-mono text-xs text-slate-600">{schedule.targetImage}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {schedule.tenantId ? tenantNames.get(schedule.tenantId) ?? schedule.tenantId : t("schedules.allInstances")}
                  </td>
                  <td className="px-5 py-3.5">
                    {schedule.cronExpression ? (
                      <span className="rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-cyan-300 ring-1 ring-inset ring-white/10">
                        {schedule.cronExpression}
                      </span>
                    ) : (
                      <span className="text-slate-400">{formatDateTime(schedule.runAt)}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">
                    {formatDateTime(schedule.lastRunAt)}
                    {schedule.lastError && <span className="block max-w-[200px] truncate text-red-400">{schedule.lastError}</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={schedule.status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {schedule.status === "PENDING" && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => schedulesApi.runNow(schedule.id).then(load)}
                          className="text-xs font-medium text-accent-soft hover:underline"
                        >
                          {t("schedules.runNow")}
                        </button>
                        <button
                          onClick={() => schedulesApi.cancel(schedule.id).then(load)}
                          className="text-xs font-medium text-red-400 hover:underline"
                        >
                          {t("schedules.cancelSchedule")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateScheduleModal
        open={showCreate}
        tenants={tenants}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          load();
        }}
      />
    </div>
  );
}

function CreateScheduleModal({
  open,
  tenants,
  onClose,
  onCreated,
}: {
  open: boolean;
  tenants: Tenant[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const { releases } = useReleaseTags();
  const [type, setType] = useState<"UPDATE" | "RESTART">("UPDATE");
  const [tenantId, setTenantId] = useState("");
  const [targetImageRepo, setTargetImageRepo] = useState("ghcr.io/ulsklyc/yuvomi");
  const [targetImageTag, setTargetImageTag] = useState("");
  const [mode, setMode] = useState<"cron" | "once">("once");
  const [cronExpression, setCronExpression] = useState("0 4 * * *");
  const [runAt, setRunAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await schedulesApi.create({
        tenantId: tenantId || undefined,
        type,
        targetImage: type === "UPDATE" ? `${targetImageRepo}:${targetImageTag}` : undefined,
        cronExpression: mode === "cron" ? cronExpression : undefined,
        runAt: mode === "once" ? new Date(runAt).toISOString() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(extractApiError(err, t("schedules.createError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("schedules.modalTitle")} subtitle={t("schedules.modalSubtitle")}>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldType")}</label>
          <select value={type} onChange={(e) => setType(e.target.value as "UPDATE" | "RESTART")} className="glass-input">
            <option value="UPDATE">{t("schedules.updateImage")}</option>
            <option value="RESTART">{t("schedules.restart")}</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldTarget")}</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="glass-input">
            <option value="">{t("schedules.allInstances")}</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
        {type === "UPDATE" && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldTargetImage")}</label>
              <input
                required
                value={targetImageRepo}
                onChange={(e) => setTargetImageRepo(e.target.value)}
                placeholder="ghcr.io/ulsklyc/yuvomi"
                className="glass-input font-mono !text-xs"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldTargetImageTag")}</label>
              <select
                required
                value={targetImageTag}
                onChange={(e) => setTargetImageTag(e.target.value)}
                className="glass-input font-mono !text-xs"
              >
                <option value="" disabled>
                  {t("tenantDetail.fieldTagPlaceholder")}
                </option>
                <option value={LATEST_TAG}>{LATEST_TAG}</option>
                {releases.map((release) => (
                  <option key={release.tag} value={release.tag}>
                    {release.tag}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldMode")}</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as "cron" | "once")} className="glass-input">
            <option value="once">{t("schedules.modeOnce")}</option>
            <option value="cron">{t("schedules.modeCron")}</option>
          </select>
        </div>
        {mode === "cron" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldCron")}</label>
            <input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="glass-input font-mono !text-xs"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("schedules.fieldDateTime")}</label>
            <input type="datetime-local" required value={runAt} onChange={(e) => setRunAt(e.target.value)} className="glass-input" />
          </div>
        )}
        {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t("schedules.cancel")}
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? t("schedules.creating") : t("schedules.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
