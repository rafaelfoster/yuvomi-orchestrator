import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import type { Tenant } from "../db/generated/client/client.js";

// Matches Yuvomi's own backup-file naming (BACKUP_FILE_PREFIX /
// LEGACY_FILE_PREFIX in its backup-scheduler.js) — "yuvomi-backup-*.db" for
// current builds, "oikos-backup-*.db" from before its rebrand.
const BACKUP_FILE_RE = /^(yuvomi|oikos)-backup-.*\.db$/;

// Recomputed rather than read from tenant.backupPath (the DB column): that
// column is written once at provisioning and never updated on image/env
// refresh, so it can go stale relative to TENANT_BACKUP_ROOT after a config
// change — this always reflects the actual current bind-mount source.
function tenantBackupDir(tenant: Tenant): string {
  return path.join(env.TENANT_BACKUP_ROOT, tenant.id);
}

/**
 * Orchestrator does not create tenant backups itself. Yuvomi's own
 * internal scheduler already does (BACKUP_DIR, see
 * tenants/service.ts's tenantRuntimeEnv) using its own already-unlocked DB
 * connection — the only thing that can produce a valid SQLCipher-encrypted
 * copy. A `docker exec sqlite3 ...` approach (the original design here)
 * cannot work at all: the shipped image doesn't ship the `sqlite3` CLI,
 * and even if it did, a plain CLI `.backup` can't handle an
 * SQLCipher-encrypted database without the key loaded via a SQLCipher
 * PRAGMA, which only the app's own connection has.
 *
 * So this just reconciles the admin UI's view with whatever Yuvomi has
 * already written to the shared TENANT_BACKUP_ROOT/<tenantId> directory:
 * log any new file since the last check, and drop BackupLog rows whose
 * file Yuvomi's own rotation (BACKUP_KEEP) has since deleted.
 */
export async function runBackupForTenant(tenant: Tenant): Promise<void> {
  const dir = tenantBackupDir(tenant);
  const entries = await readdir(dir).catch(() => [] as string[]);
  const backupFiles = entries.filter((name) => BACKUP_FILE_RE.test(name));

  const existingRows = await prisma.backupLog.findMany({ where: { tenantId: tenant.id } });
  const loggedPaths = new Set(existingRows.map((row) => row.filePath));

  for (const name of backupFiles) {
    const filePath = path.join(dir, name);
    if (loggedPaths.has(filePath)) continue;

    const stats = await stat(filePath).catch(() => null);
    if (!stats) continue;

    await prisma.backupLog.create({
      data: {
        tenantId: tenant.id,
        status: "SUCCESS",
        startedAt: stats.mtime,
        finishedAt: stats.mtime,
        filePath,
        sizeBytes: stats.size,
      },
    });
  }

  await reconcileDeletedBackups(existingRows);
}

async function reconcileDeletedBackups(rows: { id: string; filePath: string | null }[]): Promise<void> {
  for (const row of rows) {
    if (!row.filePath) continue;
    const exists = await stat(row.filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) await prisma.backupLog.delete({ where: { id: row.id } }).catch(() => undefined);
  }
}

export async function runBackupForAllTenants(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ where: { status: "RUNNING" } });
  for (const tenant of tenants) {
    await runBackupForTenant(tenant);
  }
}

export async function listBackupsForTenant(tenantId: string) {
  return prisma.backupLog.findMany({ where: { tenantId }, orderBy: { startedAt: "desc" } });
}
