import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export interface TenantSecretValues {
  dbEncryptionKey: string;
  sessionSecret: string;
}

export function generateTenantSecrets(): TenantSecretValues {
  return {
    dbEncryptionKey: generateSecret(32),
    sessionSecret: generateSecret(32),
  };
}

/**
 * Writes the tenant's secrets/env file to disk. Bind-mounted read-only into
 * the tenant container; secrets never pass through `docker create`'s Env
 * array, so they never show up in `docker inspect`.
 *
 * Mode 0644, not 0600: the shipped Yuvomi image's entrypoint drops from
 * root to a non-root `node` user before running the app (via `gosu`), and
 * that user is a different uid than whatever wrote this file (typically
 * root, from the orchestrator's own container) — 0600 would make the file
 * unreadable to the app, so dotenv silently skips it and the app falls
 * back to an unencrypted database with no session secret. The real access
 * control here is the tenant root directory (0700, root-owned, created
 * below) — nothing outside this host's root/orchestrator can reach the
 * file to read it regardless of its own mode.
 */
export async function writeTenantEnvFile(
  envFilePath: string,
  secrets: TenantSecretValues,
  extra: Record<string, string> = {},
): Promise<void> {
  await mkdir(path.dirname(envFilePath), { recursive: true, mode: 0o700 });

  const lines = [
    `DB_ENCRYPTION_KEY=${secrets.dbEncryptionKey}`,
    `SESSION_SECRET=${secrets.sessionSecret}`,
    ...Object.entries(extra).map(([key, value]) => `${key}=${value}`),
  ];

  await writeFile(envFilePath, lines.join("\n") + "\n", { mode: 0o644 });
  await chmod(envFilePath, 0o644);
}
