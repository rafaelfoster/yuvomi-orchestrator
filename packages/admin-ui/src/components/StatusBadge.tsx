import { useTranslation } from "react-i18next";
import { statusMeta } from "../lib/status";

const LIVE_STATUSES = new Set(["RUNNING", "PROVISIONING", "DELETING"]);

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badge}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${LIVE_STATUSES.has(status) ? "animate-pulse-dot" : ""}`}
        style={{ backgroundColor: meta.color }}
      />
      {t(`status.${status}`, meta.label)}
    </span>
  );
}
