import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";

interface TotpEnrollmentProps {
  otpauthUrl: string;
  secret: string;
}

/** Groups the base32 secret in blocks of 4 for manual authenticator entry. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function TotpEnrollment({ otpauthUrl, secret }: TotpEnrollmentProps) {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(otpauthUrl, {
      width: 220,
      margin: 2,
      color: { dark: "#05070d", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (e.g. non-secure context) — secret is visible anyway
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={t("totpEnrollment.qrAlt")}
            width={180}
            height={180}
            className="rounded-xl bg-white p-1.5"
          />
        ) : qrError ? (
          <p className="text-xs text-red-400">{t("totpEnrollment.qrError")}</p>
        ) : (
          <div className="skeleton h-[180px] w-[180px]" />
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-ink-950/80 p-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-slate-600">
          {t("totpEnrollment.manualCodeHint")}
        </p>
        <div className="flex items-center justify-between gap-2">
          <code className="break-all font-mono text-xs tracking-wider text-accent-soft">{formatSecret(secret)}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            {copied ? t("totpEnrollment.copied") : t("totpEnrollment.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
