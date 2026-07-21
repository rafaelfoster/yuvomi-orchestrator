import path from "node:path";
import { readdir, stat, unlink } from "node:fs/promises";
import { docker } from "../docker/client.js";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { recordAudit } from "../audit.js";
import type { Tenant } from "../db/generated/client/client.js";

/**
 * Runs `sqlite3 <db> ".backup '<dest>'"` inside the tenant container via
 * `docker exec` — a consistent, WAL-safe snapshot taken without stopping
 * the app. Assumes the Yuvomi image ships the `sqlite3` CLI; if it
 * doesn't, swap this for a `VACUUM INTO` call over the app's own DB
 * connection instead (would require a Yuvomi-side endpoint).
 */
export async function runBackupForTenant(tenant: Tenant): Promise<void> {
  if (!tenant.containerId) return;

  const log = await prisma.backupLog.create({ data: { tenantId: tenant.id, status: "RUNNING" } });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRelPath = `backups/backup-${timestamp}.sqlite`;
  const containerDbPath = `${env.TENANT_DATA_MOUNT_PATH}/${env.TENANT_DB_FILENAME}`;
  const containerBackupPath = `${env.TENANT_DATA_MOUNT_PATH}/${backupRelPath}`;

  try {
    const container = docker.getContainer(tenant.containerId);
    const exec = await container.exec({
      Cmd: [
        "sh",
        "-c",
        `mkdir -p "$(dirname '${containerBackupPath}')" && sqlite3 '${containerDbPath}' ".backup '${containerBackupPath}'"`,
      ],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const sink = { write: (chunk: Buffer) => chunks.push(chunk) };
      docker.modem.demuxStream(
        stream as unknown as NodeJS.ReadableStream,
        sink as unknown as NodeJS.WritableStream,
        sink as unknown as NodeJS.WritableStream,
      );
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const result = await exec.inspect();
    if (result.ExitCode !== 0) {
      throw new Error(`sqlite3 backup exited ${result.ExitCode}: ${Buffer.concat(chunks).toString("utf8")}`);
    }

    const hostBackupPath = path.join(tenant.dataPath, backupRelPath);
    const size = (await stat(hostBackupPath)).size;

    await prisma.backupLog.update({
      where: { id: log.id },
      data: { status: "SUCCESS", finishedAt: new Date(), filePath: hostBackupPath, sizeBytes: size },
    });

    await pruneOldBackups(tenant.dataPath);
  } catch (err) {
    await prisma.backupLog.update({
      where: { id: log.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: (err as Error).message },
    });
    await recordAudit({
      action: "backup.failed",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { error: (err as Error).message },
    });
  }
}

async function pruneOldBackups(dataPath: string): Promise<void> {
  const dir = path.join(dataPath, "backups");
  const entries = await readdir(dir).catch(() => [] as string[]);
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    const stats = await stat(filePath).catch(() => null);
    if (stats && stats.mtimeMs < cutoff) {
      await unlink(filePath).catch(() => undefined);
    }
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
