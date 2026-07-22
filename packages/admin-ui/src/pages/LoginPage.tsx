import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../api/client";
import { loginWithPasskey } from "../auth/webauthn";
import { useAuth } from "../auth/AuthContext";
import { extractApiError, getHttpStatus } from "../hooks/useFleetData";
import { useToast } from "../components/ui/ToastProvider";
import { IconBolt, IconShield } from "../components/icons";
import { TotpEnrollment } from "../components/TotpEnrollment";

type Step = "credentials" | "totp-verify" | "totp-setup";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState("");
  const [setupSecret, setSetupSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function afterLogin() {
    await refresh();
    navigate("/", { replace: true });
  }

  // 401 is a genuine "wrong credentials/code" — everything else (502 from
  // an unreachable orchestrator, a network error, a 500) is an
  // infrastructure problem the user shouldn't be told to double-check
  // their password for. Surface those as a toast with the real error
  // instead of a misleading "invalid credentials" message.
  function reportAuthError(err: unknown, invalidMessage: string) {
    if (getHttpStatus(err) === 401) {
      setError(invalidMessage);
    } else {
      setError(null);
      showToast(extractApiError(err, t("common.unexpectedError")));
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await authApi.login(email, password);
      setPendingId(result.pendingId);
      setStep(result.mfaSetupRequired ? "totp-setup" : "totp-verify");
      if (result.mfaSetupRequired) {
        setSetupSecret(await authApi.totpSetup(result.pendingId));
      }
    } catch (err) {
      reportAuthError(err, t("auth.invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTotpVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingId) return;
    setError(null);
    setBusy(true);
    try {
      await authApi.totpVerify(pendingId, totpToken);
      await afterLogin();
    } catch (err) {
      reportAuthError(err, t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTotpEnable(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingId) return;
    setError(null);
    setBusy(true);
    try {
      await authApi.totpEnable(pendingId, totpToken);
      await afterLogin();
    } catch (err) {
      reportAuthError(err, t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskey() {
    setError(null);
    setBusy(true);
    try {
      await loginWithPasskey(email);
      await afterLogin();
    } catch (err) {
      reportAuthError(err, t("auth.passkeyFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-violet-500/10 blur-[120px]" />

      <div className="glass-panel relative w-full max-w-sm animate-fade-up !bg-ink-900/80 p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-emerald-700 text-ink-950 shadow-glow">
            <IconBolt className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-white">Yuvomi Orchestrator</h1>
          <p className="mt-1 text-xs text-slate-500">{t("auth.tagline")}</p>
        </div>

        {step === "credentials" && (
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("auth.emailLabel")}</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("auth.passwordLabel")}</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input" />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? t("auth.signingIn") : t("auth.signIn")}
            </button>
            <button type="button" onClick={handlePasskey} disabled={busy || !email} className="btn-ghost w-full justify-center">
              <IconShield className="h-4 w-4" />
              {t("auth.signInWithPasskey")}
            </button>
          </form>
        )}

        {step === "totp-verify" && (
          <form onSubmit={handleTotpVerify} className="space-y-4">
            <p className="text-sm text-slate-400">{t("auth.totpPrompt")}</p>
            <input
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              value={totpToken}
              onChange={(e) => setTotpToken(e.target.value)}
              className="glass-input !py-3 text-center font-display !text-2xl tracking-[0.5em]"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? t("auth.verifying") : t("auth.verify")}
            </button>
          </form>
        )}

        {step === "totp-setup" && (
          <form onSubmit={handleTotpEnable} className="space-y-4">
            <p className="text-sm text-slate-400">{t("auth.totpSetupPrompt")}</p>
            {setupSecret && <TotpEnrollment otpauthUrl={setupSecret.otpauthUrl} secret={setupSecret.secret} />}
            <input
              inputMode="numeric"
              maxLength={6}
              required
              autoFocus
              value={totpToken}
              onChange={(e) => setTotpToken(e.target.value)}
              className="glass-input !py-3 text-center font-display !text-2xl tracking-[0.5em]"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? t("auth.enabling") : t("auth.enableAndSignIn")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
