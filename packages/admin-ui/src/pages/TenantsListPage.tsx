import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { tenantsApi } from "../api/client";
import { useFleetData, extractApiError } from "../hooks/useFleetData";
import { formatDateTime } from "../lib/format";
import { healthKey, healthMeta, STATUS_META } from "../lib/status";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState, LoadingRows } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { IconPlus, IconSearch, IconUsers } from "../components/icons";

const FILTERABLE_STATUSES = ["RUNNING", "PROVISIONING", "PAUSED", "UNHEALTHY", "STOPPED"] as const;

export function TenantsListPage() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useFleetData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const tenants = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return data.tenants.filter((tenant) => {
      if (statusFilter && tenant.status !== statusFilter) return false;
      if (!term) return true;
      return (
        tenant.name.toLowerCase().includes(term) ||
        tenant.subdomain.toLowerCase().includes(term) ||
        tenant.contactName.toLowerCase().includes(term)
      );
    });
  }, [data, query, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tenant of data?.tenants ?? []) {
      counts.set(tenant.status, (counts.get(tenant.status) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t("tenantsList.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("tenantsList.subtitle")}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          {t("tenantsList.newFamily")}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tenantsList.searchPlaceholder")}
            className="glass-input !pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERABLE_STATUSES.filter((status) => (statusCounts.get(status) ?? 0) > 0).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter((prev) => (prev === status ? null : status))}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                statusFilter === status
                  ? STATUS_META[status].badge
                  : "text-slate-500 ring-white/10 hover:text-slate-300"
              }`}
            >
              {t(`status.${status}`, STATUS_META[status].label)} · {statusCounts.get(status)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="glass-panel border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>}

      {loading && !data ? (
        <LoadingRows count={5} className="h-16" />
      ) : tenants.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={<IconUsers className="h-8 w-8" />}
            title={query || statusFilter ? t("tenantsList.noFamiliesFound") : t("tenantsList.noFamiliesYet")}
            description={query || statusFilter ? t("tenantsList.noFamiliesFoundDesc") : t("tenantsList.noFamiliesYetDesc")}
            action={
              !query && !statusFilter ? (
                <button onClick={() => setShowCreate(true)} className="btn-primary">
                  <IconPlus className="h-4 w-4" />
                  {t("tenantsList.newFamily")}
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="glass-panel animate-fade-up overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.05] text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableFamily")}</th>
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableContact")}</th>
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableImage")}</th>
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableHealth")}</th>
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableCreated")}</th>
                <th className="px-5 py-3.5 font-medium">{t("tenantsList.tableStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const health = healthMeta(tenant.container?.health);
                return (
                  <tr key={tenant.id} className="group border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.03]">
                    <td className="px-5 py-3.5">
                      <Link to={`/tenants/${tenant.id}`} className="block">
                        <span className="font-medium text-white transition-colors group-hover:text-accent-soft">{tenant.name}</span>
                        <span className="block text-xs text-slate-600">{tenant.subdomain}</span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">
                      {tenant.contactName}
                      {tenant.contactEmail && <span className="block text-xs text-slate-600">{tenant.contactEmail}</span>}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{tenant.imageTag}</td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: health.color }} />
                        {t(`health.${healthKey(tenant.container?.health)}`, health.label)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{formatDateTime(tenant.createdAt)}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={tenant.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTenantModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          reload();
        }}
      />
    </div>
  );
}

function CreateTenantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await tenantsApi.create({ name, subdomain, contactName, contactEmail: contactEmail || undefined });
      setName("");
      setSubdomain("");
      setContactName("");
      setContactEmail("");
      onCreated();
    } catch (err) {
      setError(extractApiError(err, t("tenantsList.createError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("tenantsList.createModalTitle")} subtitle={t("tenantsList.createModalSubtitle")}>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("tenantsList.fieldName")} value={name} onChange={setName} required autoFocus />
        <Field label={t("tenantsList.fieldSubdomain")} value={subdomain} onChange={setSubdomain} required placeholder="rafael" />
        <Field label={t("tenantsList.fieldContactName")} value={contactName} onChange={setContactName} required />
        <Field label={t("tenantsList.fieldContactEmail")} value={contactEmail} onChange={setContactEmail} type="email" />
        {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            {t("tenantsList.cancel")}
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? t("tenantsList.provisioning") : t("tenantsList.provision")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-400">{props.label}</label>
      <input
        type={props.type ?? "text"}
        required={props.required}
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="glass-input"
      />
    </div>
  );
}
