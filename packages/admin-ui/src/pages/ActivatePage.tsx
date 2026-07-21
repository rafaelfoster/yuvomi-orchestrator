import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { invitesApi } from "../api/client";

export function ActivatePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [inviteInfo, setInviteInfo] = useState<{ tenantName: string; subdomain: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError(t("activate.invalidLink"));
      return;
    }
    invitesApi
      .inspect(token)
      .then(setInviteInfo)
      .catch(() => setLoadError(t("activate.invalidInvite")));
  }, [token, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invitesApi.activate(token, { name, email, password });
      setDone(true);
    } catch {
      setError(t("activate.activateError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="mb-2 text-xl font-semibold">{t("activate.title")}</h1>

        {loadError && <p className="text-sm text-red-400">{loadError}</p>}

        {inviteInfo && !done && (
          <>
            <p className="mb-6 text-sm text-slate-400">
              {t("activate.familyLabel")} <strong>{inviteInfo.tenantName}</strong> — {inviteInfo.subdomain}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label={t("activate.fieldName")} value={name} onChange={setName} required />
              <Field label={t("activate.fieldEmail")} type="email" value={email} onChange={setEmail} required />
              <Field label={t("activate.fieldPassword")} type="password" value={password} onChange={setPassword} required minLength={10} />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                {t("activate.activate")}
              </button>
            </form>
          </>
        )}

        {done && <p className="text-sm text-emerald-400">{t("activate.success")}</p>}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  minLength?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-slate-400">{props.label}</label>
      <input
        type={props.type ?? "text"}
        required={props.required}
        minLength={props.minLength}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
      />
    </div>
  );
}
