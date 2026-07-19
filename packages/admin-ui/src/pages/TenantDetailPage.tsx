import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  backupsApi,
  invitesApi,
  tenantsApi,
  type BackupLog,
  type ContainerState,
  type Invite,
  type Tenant,
} from "../api/client";
import { extractApiError } from "../hooks/useFleetData";
import { formatBytes, formatDateTime, timeAgo } from "../lib/format";
import { healthMeta } from "../lib/status";
import { AreaChart, type TimePoint } from "../components/charts/AreaChart";
import { Card } from "../components/ui/Card";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { IconArrowLeft, IconDatabase, IconMail, IconPause, IconPlay, IconTerminal, IconTrash } from "../components/icons";

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [container, setContainer] = useState<ContainerState | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const { tenant: t, container: c } = await tenantsApi.status(id);
    setTenant(t);
    setContainer(c);
    setInvites(await invitesApi.list(id));
    setBackups(await backupsApi.list(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const source = new EventSource(tenantsApi.logsUrl(id), { withCredentials: true } as EventSourceInit);
    source.onmessage = (event) => {
      const line = JSON.parse(event.data) as string;
      setLogLines((prev) => [...prev.slice(-499), line]);
    };
    return () => source.close();
  }, [id]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logLines]);

  const backupSizeSeries = useMemo<TimePoint[]>(
    () =>
      backups
        .filter((b) => b.sizeBytes != null)
        .map((b) => ({ date: new Date(b.startedAt), value: b.sizeBytes ?? 0 }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [backups],
  );

  if (!tenant) return <LoadingRows count={4} className="h-24" />;

  async function runAction(action: () => Promise<Tenant>) {
    setActionError(null);
    try {
      setTenant(await action());
    } catch (err) {
      setActionError(extractApiError(err, "Falha na operação"));
    }
  }

  async function handleDelete() {
    if (!id || !tenant) return;
    const wipeData = confirm("Apagar também os dados (irreversível)? OK = apagar dados, Cancelar = manter dados.");
    if (!confirm(`Remover o tenant ${tenant.name}?`)) return;
    try {
      await tenantsApi.remove(id, wipeData);
      navigate("/tenants");
    } catch (err) {
      setActionError(extractApiError(err, "Falha ao remover tenant"));
    }
  }

  const health = healthMeta(container?.health);

  return (
    <div className="space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-white">
        <IconArrowLeft className="h-3.5 w-3.5" />
        Todas as famílias
      </Link>

      <header className="glass-panel animate-fade-up flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-violet-500/20 font-display text-xl font-bold text-white ring-1 ring-white/10">
            {tenant.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-bold tracking-tight text-white">{tenant.name}</h1>
              <StatusBadge status={tenant.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {tenant.subdomain} · contato: {tenant.contactName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tenant.status === "RUNNING" && (
            <button onClick={() => runAction(() => tenantsApi.pause(tenant.id))} className="btn-ghost">
              <IconPause className="h-4 w-4" />
              Pausar
            </button>
          )}
          {tenant.status === "PAUSED" && (
            <button onClick={() => runAction(() => tenantsApi.resume(tenant.id))} className="btn-primary">
              <IconPlay className="h-4 w-4" />
              Retomar
            </button>
          )}
          <button onClick={handleDelete} className="btn-danger">
            <IconTrash className="h-4 w-4" />
            Remover
          </button>
        </div>
      </header>

      {actionError && <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{actionError}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard label="Imagem" value={`${tenant.image}:${tenant.imageTag}`} mono />
        <InfoCard label="Container" value={container?.status ?? "—"} />
        <InfoCard
          label="Saúde"
          value={health.label}
          accessory={<span className="h-2 w-2 rounded-full" style={{ backgroundColor: health.color }} />}
        />
        <InfoCard label="No ar desde" value={container?.startedAt ? timeAgo(container.startedAt) : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Evolução do banco" subtitle="Tamanho dos backups ao longo do tempo" bodyClassName="h-[240px]">
          {backupSizeSeries.length > 1 ? (
            <AreaChart data={backupSizeSeries} valueLabel="Tamanho" color="#8b5cf6" formatValue={formatBytes} />
          ) : (
            <EmptyState
              icon={<IconDatabase className="h-7 w-7" />}
              title="Dados insuficientes"
              description="O gráfico aparece após dois ou mais backups concluídos."
            />
          )}
        </Card>

        <Card title="Backups" subtitle={`${backups.length} registro(s)`} bodyClassName="max-h-[240px] overflow-y-auto !p-0">
          {backups.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900/95 text-left text-xs uppercase tracking-wider text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Início</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-t border-white/[0.04]">
                    <td className="px-5 py-2.5 text-slate-300">{formatDateTime(backup.startedAt)}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge status={backup.status} />
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-400">{formatBytes(backup.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-5">
              <EmptyState title="Nenhum backup registrado ainda" />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Logs em tempo real"
        subtitle="Stream do container via SSE"
        actions={<IconTerminal className="h-4 w-4 text-slate-600" />}
        bodyClassName="!p-0"
      >
        <div className="h-72 overflow-y-auto rounded-b-2xl bg-black/60 p-4 font-mono text-xs leading-relaxed text-slate-300">
          {logLines.length === 0 && <p className="text-slate-600">Aguardando saída do container…</p>}
          {logLines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ImageUpdateCard tenantId={tenant.id} currentImage={tenant.image} onUpdated={load} />
        <InvitesCard tenantId={tenant.id} invites={invites} onSent={load} />
      </div>
    </div>
  );
}

function InfoCard({ label, value, mono, accessory }: { label: string; value: string; mono?: boolean; accessory?: React.ReactNode }) {
  return (
    <div className="glass-panel animate-fade-up p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">{label}</p>
      <p className={`mt-1.5 flex items-center gap-2 text-sm text-slate-200 ${mono ? "break-all font-mono text-xs" : ""}`}>
        {accessory}
        {value}
      </p>
    </div>
  );
}

function ImageUpdateCard({ tenantId, currentImage, onUpdated }: { tenantId: string; currentImage: string; onUpdated: () => void }) {
  const [image, setImage] = useState(currentImage);
  const [imageTag, setImageTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await tenantsApi.updateImage(tenantId, image, imageTag);
      setImageTag("");
      onUpdated();
    } catch (err) {
      setError(extractApiError(err, "Falha ao atualizar imagem"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Atualização de imagem" subtitle="Troca cirúrgica da versão desta família">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Imagem</label>
          <input value={image} onChange={(e) => setImage(e.target.value)} className="glass-input font-mono !text-xs" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Tag</label>
          <input
            required
            value={imageTag}
            onChange={(e) => setImageTag(e.target.value)}
            placeholder="v1.4.2"
            className="glass-input font-mono !text-xs"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Atualizando…" : "Atualizar agora"}
        </button>
      </form>
    </Card>
  );
}

function InvitesCard({ tenantId, invites, onSent }: { tenantId: string; invites: Invite[]; onSent: () => void }) {
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invitesApi.create(tenantId, {
        channel,
        contactEmail: channel === "EMAIL" ? contact : undefined,
        contactPhone: channel === "WHATSAPP" ? contact : undefined,
      });
      setContact("");
      onSent();
    } catch (err) {
      setError(extractApiError(err, "Falha ao enviar convite"));
    } finally {
      setBusy(false);
    }
  }

  function inviteStatus(invite: Invite) {
    if (invite.usedAt) return { label: "ativado", className: "text-emerald-400" };
    if (new Date(invite.expiresAt) < new Date()) return { label: "expirado", className: "text-slate-600" };
    return { label: "pendente", className: "text-amber-400" };
  }

  return (
    <Card title="Convites de onboarding" subtitle="Primeiro acesso do administrador da família" actions={<IconMail className="h-4 w-4 text-slate-600" />}>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">Canal</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "WHATSAPP")} className="glass-input !w-36">
            <option value="EMAIL">E-mail</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{channel === "EMAIL" ? "E-mail" : "Telefone"}</label>
          <input required value={contact} onChange={(e) => setContact(e.target.value)} className="glass-input" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Enviando…" : "Enviar"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {invites.length > 0 && (
        <ul className="mt-5 divide-y divide-white/[0.04]">
          {invites.map((invite) => {
            const status = inviteStatus(invite);
            return (
              <li key={invite.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="truncate text-slate-300">
                  {invite.channel === "EMAIL" ? invite.contactEmail : invite.contactPhone}
                </span>
                <span className={`text-xs font-medium ${status.className}`}>{status.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
