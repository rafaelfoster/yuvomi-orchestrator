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
 * Writes the tenant's secrets/env file to disk with 0600 permissions.
 * This file is bind-mounted read-only into the tenant container; secrets
 * never pass through `docker create`'s Env array, so they never show up
 * in `docker inspect`.
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

  await writeFile(envFilePath, lines.join("\n") + "\n", { mode: 0o600 });
  await chmod(envFilePath, 0o600);
}
