import { env } from "../config/env.js";

// Yuvomi's own env var names, confirmed against the shipped image's
// server/services/email.js (CONFIG_KEYS) — distinct from our own
// SMTP_* var names, and SMTP_SECURE differs in shape: ours is a boolean,
// Yuvomi's is one of 'ssl' | 'starttls' | 'none'.
function parseFrom(from: string): { address: string; name: string | null } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { address: match[2].trim(), name: name.length > 0 ? name : null };
  }
  return { address: from.trim(), name: null };
}

/**
 * Env vars to seed a newly-provisioned tenant with, so it defaults to
 * sending mail through the orchestrator's own SMTP relay rather than
 * requiring every family to configure their own. Returns an empty object
 * when the orchestrator itself has no SMTP host configured — Yuvomi's env
 * resolution already treats unset/empty vars as "not configured" and
 * falls back to its own per-instance settings UI, so admins can still
 * override or set up SMTP per tenant from inside Yuvomi afterward.
 */
export function inheritedSmtpEnv(): Record<string, string> {
  if (!env.SMTP_HOST) return {};

  const { address, name } = parseFrom(env.SMTP_FROM);
  const vars: Record<string, string> = {
    EMAIL_SMTP_HOST: env.SMTP_HOST,
    EMAIL_SMTP_PORT: String(env.SMTP_PORT),
    EMAIL_SMTP_SECURE: env.SMTP_SECURE ? "ssl" : "starttls",
    EMAIL_FROM_ADDRESS: address,
  };
  if (env.SMTP_USER) vars.EMAIL_SMTP_USER = env.SMTP_USER;
  if (env.SMTP_PASS) vars.EMAIL_SMTP_PASS = env.SMTP_PASS;
  if (name) vars.EMAIL_FROM_NAME = name;

  return vars;
}
