/*
  Warnings:

  - Added the required column `backupPath` to the `Tenant` table without a default value. This is not possible if the table is not empty.

  Existing rows are backfilled by deriving backupPath from dataPath
  (".../<tenantId>/data" -> ".../<tenantId>/backups"), which stays unique
  since dataPath already is. This column is never read back out of the DB
  by application code (src/tenants/service.ts always recomputes the real,
  live backup mount path from TENANT_BACKUP_ROOT + tenant id) — it only
  needs to satisfy NOT NULL/UNIQUE here, not describe an actual directory.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONING',
    "containerId" TEXT,
    "containerName" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "imageTag" TEXT NOT NULL,
    "dataPath" TEXT NOT NULL,
    "backupPath" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Tenant" ("contactEmail", "contactName", "contactPhone", "containerId", "containerName", "createdAt", "dataPath", "backupPath", "deletedAt", "id", "image", "imageTag", "name", "network", "status", "subdomain", "updatedAt") SELECT "contactEmail", "contactName", "contactPhone", "containerId", "containerName", "createdAt", "dataPath", (substr("dataPath", 1, length("dataPath") - 4) || 'backups'), "deletedAt", "id", "image", "imageTag", "name", "network", "status", "subdomain", "updatedAt" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");
CREATE UNIQUE INDEX "Tenant_containerName_key" ON "Tenant"("containerName");
CREATE UNIQUE INDEX "Tenant_dataPath_key" ON "Tenant"("dataPath");
CREATE UNIQUE INDEX "Tenant_backupPath_key" ON "Tenant"("backupPath");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
