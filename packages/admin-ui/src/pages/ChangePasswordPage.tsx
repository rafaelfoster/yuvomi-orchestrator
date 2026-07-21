import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { extractApiError } from "../hooks/useFleetData";
import { IconShield } from "../components/icons";

const MIN_PASSWORD_LENGTH = 12;

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { admin, refresh, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("changePassword.lengthError", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("changePassword.mismatchError"));
      return;
    }
    setBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(extractApiError(err, t("changePassword.genericError")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 right-1/4 h-96 w-96 rounded-full bg-accent/10 blur-[120px]" />

      <div className="glass-panel relative w-full max-w-sm animate-fade-up !bg-ink-900/80 p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-ink-950">
            <IconShield className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-white">{t("changePassword.title")}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {t("changePassword.subtitle", { email: admin?.email ?? "" })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("changePassword.currentPassword")}</label>
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="glass-input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              {t("changePassword.newPassword", { count: MIN_PASSWORD_LENGTH })}
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="glass-input"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("changePassword.confirmPassword")}</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="glass-input"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
            {busy ? t("changePassword.saving") : t("changePassword.save")}
          </button>
          <button type="button" onClick={() => logout()} className="btn-ghost w-full justify-center">
            {t("changePassword.logout")}
          </button>
        </form>
      </div>
    </div>
  );
}
