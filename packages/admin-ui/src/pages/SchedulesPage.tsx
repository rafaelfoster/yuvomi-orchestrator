import { useEffect, useMemo, useState } from "react";
import { schedulesApi, tenantsApi, type Schedule, type Tenant } from "../api/client";
import { extractApiError } from "../hooks/useFleetData";
import { formatDateTime } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { IconClock, IconPlus } from "../components/icons";

export function SchedulesPage() {
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
      setError(extractApiError(err, "Falha ao carregar agendamentos"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tenantNames = useMemo(() => new Map(tenants.map((t) => [t.id, t.name])), [tenants]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">Agendamentos</h1>
          <p className="mt-1 text-sm text-slate-500">Atualizações e reinícios programados, recorrentes ou pontuais.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Novo agendamento
        </button>
      </header>

      {error && <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <LoadingRows count={4} className="h-14" />
      ) : schedules.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={<IconClock className="h-8 w-8" />}
            title="Nenhum agendamento criado"
            description="Programe atualizações de imagem ou reinícios para uma família ou toda a frota."
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <IconPlus className="h-4 w-4" />
                Novo agendamento
              </button>
            }
          />
        </div>
      ) : (
        <div className="glass-panel animate-fade-up overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.05] text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5 font-medium">Tipo</th>
                <th className="px-5 py-3.5 font-medium">Alvo</th>
                <th className="px-5 py-3.5 font-medium">Agenda</th>
                <th className="px-5 py-3.5 font-medium">Última execução</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.03]">
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-white">
                      {schedule.type === "UPDATE" ? "Atualizar imagem" : "Reiniciar"}
                    </span>
                    {schedule.targetImage && (
                      <span className="block max-w-[220px] truncate font-mono text-xs text-slate-600">{schedule.targetImage}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">
                    {schedule.tenantId ? tenantNames.get(schedule.tenantId) ?? schedule.tenantId : "Toda a frota"}
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
                          Executar agora
                        </button>
                        <button
                          onClick={() => schedulesApi.cancel(schedule.id).then(load)}
                          className="text-xs font-medium text-red-400 hover:underline"
                        >
                          Cancelar
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
  const [type, setType] = useState<"UPDATE" | "RESTART">("UPDATE");
  const [tenantId, setTenantId] = useState("");
  const [targetImage, setTargetImage] = useState("");
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
        targetImage: type === "UPDATE" ? targetImage : undefined,
        cronExpression: mode === "cron" ? cronExpression : undefined,
        runAt: mode === "once" ? new Date(runAt).toISOString() : undefined,
      });
      onCreated();
    } catch (err) {
      setError(extractApiError(err, "Falha ao criar agendamento"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo agendamento" subtitle="Tarefa programada de manutenção da frota">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as "UPDATE" | "RESTART")} className="glass-input">
            <option value="UPDATE">Atualizar imagem</option>
            <option value="RESTART">Reiniciar</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Alvo</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="glass-input">
            <option value="">Toda a frota</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>
        {type === "UPDATE" && (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Imagem alvo</label>
            <input
              required
              value={targetImage}
              onChange={(e) => setTargetImage(e.target.value)}
              placeholder="ghcr.io/ulsklyc/yuvomi:v1.4.2"
              className="glass-input font-mono !text-xs"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Modo</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as "cron" | "once")} className="glass-input">
            <option value="once">Uma vez</option>
            <option value="cron">Recorrente (cron)</option>
          </select>
        </div>
        {mode === "cron" ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Expressão cron</label>
            <input
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              className="glass-input font-mono !text-xs"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Data/hora</label>
            <input type="datetime-local" required value={runAt} onChange={(e) => setRunAt(e.target.value)} className="glass-input" />
          </div>
        )}
        {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Criando…" : "Criar agendamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
