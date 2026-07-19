import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { invitesApi } from "../api/client";

export function ActivatePage() {
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
      setLoadError("Link de convite inválido.");
      return;
    }
    invitesApi
      .inspect(token)
      .then(setInviteInfo)
      .catch(() => setLoadError("Convite inválido, expirado ou já utilizado."));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invitesApi.activate(token, { name, email, password });
      setDone(true);
    } catch {
      setError("Falha ao ativar acesso. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/60 p-8">
        <h1 className="mb-2 text-xl font-semibold">Ativar acesso Yuvomi</h1>

        {loadError && <p className="text-sm text-red-400">{loadError}</p>}

        {inviteInfo && !done && (
          <>
            <p className="mb-6 text-sm text-slate-400">
              Família <strong>{inviteInfo.tenantName}</strong> — {inviteInfo.subdomain}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Seu nome" value={name} onChange={setName} required />
              <Field label="E-mail" type="email" value={email} onChange={setEmail} required />
              <Field label="Senha" type="password" value={password} onChange={setPassword} required minLength={10} />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
              >
                Ativar acesso
              </button>
            </form>
          </>
        )}

        {done && <p className="text-sm text-emerald-400">Acesso ativado! Você já pode entrar no seu Yuvomi.</p>}
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
