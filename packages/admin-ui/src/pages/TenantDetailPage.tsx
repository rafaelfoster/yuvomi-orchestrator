import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { LATEST_TAG, useReleaseTags } from "../hooks/useReleaseTags";
import { formatBytes, formatDateTime, timeAgo } from "../lib/format";
import { healthKey, healthMeta } from "../lib/status";
import { tenantUrl } from "../lib/domain";
import { AreaChart, type TimePoint } from "../components/charts/AreaChart";
import { Card } from "../components/ui/Card";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconExternalLink,
  IconKey,
  IconMail,
  IconPause,
  IconPlay,
  IconTerminal,
  IconTrash,
} from "../components/icons";

export function TenantDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [container, setContainer] = useState<ContainerState | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { tenant: loadedTenant, container: c } = await tenantsApi.status(id);
    setTenant(loadedTenant);
    setContainer(c);
    setInvites(await invitesApi.list(id));
    setBackups(await backupsApi.list(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Refreshed periodically so the container's real Docker state (which can
  // drift from the tenant's DB status — e.g. after an interrupted image
  // update) doesn't go stale while this page is open.
  useEffect(() => {
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
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

  const instanceUrl = tenant ? tenantUrl(tenant.subdomain) : null;

  const [logsCopied, setLogsCopied] = useState(false);
  async function handleCopyLogs() {
    try {
      await navigator.clipboard.writeText(logLines.join("\n"));
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — nothing to fall back to
    }
  }

  if (!tenant) return <LoadingRows count={4} className="h-24" />;

  async function runAction(action: () => Promise<Tenant>) {
    setActionError(null);
    setActionBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(extractApiError(err, t("tenantDetail.actionError")));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDelete() {
    if (!id || !tenant) return;
    const wipeData = confirm(t("tenantDetail.confirmWipe"));
    if (!confirm(t("tenantDetail.confirmRemove", { name: tenant.name }))) return;
    try {
      await tenantsApi.remove(id, wipeData);
      navigate("/tenants");
    } catch (err) {
      setActionError(extractApiError(err, t("tenantDetail.removeError")));
    }
  }

  const health = healthMeta(container?.health);

  return (
    <div className="space-y-6">
      <Link to="/tenants" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-white">
        <IconArrowLeft className="h-3.5 w-3.5" />
        {t("tenantDetail.back")}
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
              {tenant.subdomain} · {t("tenantDetail.contactLabel")}: {tenant.contactName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {instanceUrl && (
            <a href={instanceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
              <IconExternalLink className="h-4 w-4" />
              {t("tenantDetail.openInstance")}
            </a>
          )}
          {container?.running ? (
            <button onClick={() => runAction(() => tenantsApi.pause(tenant.id))} disabled={actionBusy} className="btn-ghost">
              <IconPause className="h-4 w-4" />
              {t("tenantDetail.stop")}
            </button>
          ) : (
            <button onClick={() => runAction(() => tenantsApi.resume(tenant.id))} disabled={actionBusy} className="btn-primary">
              <IconPlay className="h-4 w-4" />
              {container ? t("tenantDetail.start") : t("tenantDetail.startMissing")}
            </button>
          )}
          <button onClick={handleDelete} className="btn-danger">
            <IconTrash className="h-4 w-4" />
            {t("tenantDetail.remove")}
          </button>
        </div>
      </header>

      {actionError && <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{actionError}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard
          label={t("tenantDetail.infoImage")}
          value={container?.appVersion ? `v${container.appVersion}` : tenant.imageTag}
          mono
        />
        <InfoCard label={t("tenantDetail.infoContainer")} value={container?.status ?? t("tenantDetail.containerMissing")} />
        <InfoCard
          label={t("tenantDetail.infoHealth")}
          value={t(`health.${healthKey(container?.health)}`, health.label)}
          accessory={<span className="h-2 w-2 rounded-full" style={{ backgroundColor: health.color }} />}
        />
        <InfoCard label={t("tenantDetail.infoUptime")} value={container?.startedAt ? timeAgo(container.startedAt) : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("tenantDetail.dbGrowth")} subtitle={t("tenantDetail.dbGrowthSub")} bodyClassName="h-[240px]">
          {backupSizeSeries.length > 1 ? (
            <AreaChart data={backupSizeSeries} valueLabel={t("tenantDetail.dbGrowthValueLabel")} color="#8b5cf6" formatValue={formatBytes} />
          ) : (
            <EmptyState
              icon={<IconDatabase className="h-7 w-7" />}
              title={t("tenantDetail.insufficientData")}
              description={t("tenantDetail.insufficientDataDesc")}
            />
          )}
        </Card>

        <Card title={t("tenantDetail.backups")} subtitle={t("tenantDetail.backupsCount", { count: backups.length })} bodyClassName="max-h-[240px] overflow-y-auto !p-0">
          {backups.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-900/95 text-left text-xs uppercase tracking-wider text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-5 py-2.5 font-medium">{t("tenantDetail.backupStart")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("tenantDetail.backupStatus")}</th>
                  <th className="px-5 py-2.5 font-medium">{t("tenantDetail.backupSize")}</th>
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
              <EmptyState title={t("tenantDetail.noBackupsYet")} />
            </div>
          )}
        </Card>
      </div>

      <Card
        title={t("tenantDetail.liveLogs")}
        subtitle={t("tenantDetail.liveLogsSub")}
        actions={
          <>
            <button
              onClick={handleCopyLogs}
              disabled={logLines.length === 0}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-40"
            >
              {logsCopied ? <IconCheck className="h-3.5 w-3.5 text-accent" /> : <IconCopy className="h-3.5 w-3.5" />}
              {logsCopied ? t("tenantDetail.copied") : t("tenantDetail.copyLogs")}
            </button>
            <IconTerminal className="h-4 w-4 text-slate-600" />
          </>
        }
        bodyClassName="!p-0"
      >
        <div className="h-72 overflow-y-auto rounded-b-2xl bg-black/60 p-4 font-mono text-xs leading-relaxed text-slate-300">
          {logLines.length === 0 && <p className="text-slate-600">{t("tenantDetail.waitingLogs")}</p>}
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
        <div className="lg:col-span-2">
          <ResetPasswordCard tenantId={tenant.id} />
        </div>
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
  const { t } = useTranslation();
  const { releases } = useReleaseTags();
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
      setError(extractApiError(err, t("tenantDetail.imageUpdateError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("tenantDetail.imageUpdateTitle")} subtitle={t("tenantDetail.imageUpdateSub")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("tenantDetail.fieldImage")}</label>
          <input value={image} onChange={(e) => setImage(e.target.value)} className="glass-input font-mono !text-xs" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("tenantDetail.fieldTag")}</label>
          <select
            required
            value={imageTag}
            onChange={(e) => setImageTag(e.target.value)}
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t("tenantDetail.updating") : t("tenantDetail.updateNow")}
        </button>
      </form>
    </Card>
  );
}

function InvitesCard({ tenantId, invites, onSent }: { tenantId: string; invites: Invite[]; onSent: () => void }) {
  const { t } = useTranslation();
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
      setError(extractApiError(err, t("tenantDetail.inviteError")));
    } finally {
      setBusy(false);
    }
  }

  function inviteStatus(invite: Invite) {
    if (invite.usedAt) return { label: t("tenantDetail.inviteActivated"), className: "text-emerald-400" };
    if (new Date(invite.expiresAt) < new Date()) return { label: t("tenantDetail.inviteExpired"), className: "text-slate-600" };
    return { label: t("tenantDetail.invitePending"), className: "text-amber-400" };
  }

  return (
    <Card title={t("tenantDetail.invitesTitle")} subtitle={t("tenantDetail.invitesSub")} actions={<IconMail className="h-4 w-4 text-slate-600" />}>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("tenantDetail.channel")}</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "WHATSAPP")} className="glass-input !w-36">
            <option value="EMAIL">{t("tenantDetail.channelEmail")}</option>
            <option value="WHATSAPP">{t("tenantDetail.channelWhatsApp")}</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">
            {channel === "EMAIL" ? t("tenantDetail.channelEmail") : t("tenantDetail.phone")}
          </label>
          <input required value={contact} onChange={(e) => setContact(e.target.value)} className="glass-input" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t("tenantDetail.sending") : t("tenantDetail.send")}
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

function ResetPasswordCard({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(t("tenantDetail.resetConfirm", { username }))) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      await tenantsApi.resetAdminPassword(tenantId, username, newPassword);
      setSuccess(true);
      setNewPassword("");
    } catch (err) {
      setError(extractApiError(err, t("tenantDetail.resetError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={t("tenantDetail.resetPasswordTitle")}
      subtitle={t("tenantDetail.resetPasswordSub")}
      actions={<IconKey className="h-4 w-4 text-slate-600" />}
    >
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("tenantDetail.usernameLabel")}</label>
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            className="glass-input"
          />
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("tenantDetail.newPasswordLabel")}</label>
          <input
            required
            type="password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="glass-input"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? t("tenantDetail.resetting") : t("tenantDetail.reset")}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-400">{t("tenantDetail.resetSuccess")}</p>}
    </Card>
  );
}
