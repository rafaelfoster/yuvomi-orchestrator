import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { LANGUAGES } from "../i18n/languages";
import { Modal } from "./ui/Modal";

interface UserSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function UserSettingsModal({ open, onClose }: UserSettingsModalProps) {
  const { t, i18n } = useTranslation();
  const { admin } = useAuth();
  const current = i18n.resolvedLanguage ?? i18n.language;

  return (
    <Modal open={open} onClose={onClose} title={t("userSettings.title")} subtitle={admin?.email}>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-400">{t("layout.language")}</label>
          <select
            value={current}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="glass-input w-full cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 text-xs text-slate-500">
          <p>
            <span className="text-slate-400">{t("userSettings.email")}:</span> {admin?.email}
          </p>
          <p>
            <span className="text-slate-400">{t("userSettings.role")}:</span>{" "}
            {admin?.isSuperAdmin ? t("layout.superAdmin") : t("layout.admin")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
