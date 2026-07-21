import path from "node:path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { recordAudit } from "../audit.js";
import { generateTenantSecrets, writeTenantEnvFile } from "./secrets.js";
import { inheritedSmtpEnv } from "./smtpDefaults.js";
import {
  createTenantContainer,
  removeTenantContainer,
  startTenantContainer,
  stopTenantContainer,
  updateTenantImage as dockerUpdateImage,
  type TenantContainerSpec,
} from "../docker/tenantContainer.js";
import { inspectTenantContainer } from "../docker/inspect.js";
import { removeTenantRoute, writeTenantRoute } from "../docker/traefikRoute.js";
import type { Tenant } from "../db/generated/client/client.js";
import type { TenantStatus } from "../db/enums.js";

export class TenantError extends Error {
  constructor(
    message: string,
    public code: "SUBDOMAIN_TAKEN" | "NOT_FOUND" | "INVALID_STATE",
  ) {
    super(message);
  }
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function sanitizeSubdomain(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!SUBDOMAIN_RE.test(value)) {
    throw new TenantError(`invalid subdomain: ${raw}`, "INVALID_STATE");
  }
  return value;
}

function paths(tenantId: string) {
  const root = path.join(env.TENANT_DATA_ROOT, tenantId);
  return {
    root,
    dataPath: path.join(root, "data"),
    envFilePath: path.join(root, ".env"),
  };
}

function toSpec(tenant: Tenant): TenantContainerSpec {
  const { dataPath, envFilePath } = paths(tenant.id);
  return {
    tenantId: tenant.id,
    containerName: tenant.containerName,
    subdomain: tenant.subdomain,
    image: tenant.image,
    imageTag: tenant.imageTag,
    dataPath,
    envFilePath,
    network: tenant.network,
  };
}

export interface ProvisionTenantInput {
  name: string;
  subdomain: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  image?: string;
  imageTag?: string;
  actorId?: string;
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<Tenant> {
  const subdomain = sanitizeSubdomain(input.subdomain);

  const existing = await prisma.tenant.findUnique({ where: { subdomain } });
  if (existing) throw new TenantError(`subdomain already taken: ${subdomain}`, "SUBDOMAIN_TAKEN");

  const image = input.image ?? env.TENANT_DEFAULT_IMAGE.split(":")[0];
  const imageTag = input.imageTag ?? env.TENANT_DEFAULT_IMAGE.split(":")[1] ?? "latest";
  const containerName = `yuvomi-tenant-${subdomain}`;

  // Generate the id up front so dataPath/envFilePath (both unique columns)
  // are correct on the very first insert — avoids a placeholder value that
  // would collide under concurrent provisioning.
  const tenantId = randomUUID();
  const { dataPath, envFilePath } = paths(tenantId);

  let tenant = await prisma.tenant.create({
    data: {
      id: tenantId,
      name: input.name,
      subdomain,
      containerName,
      image,
      imageTag,
      network: env.TENANT_NETWORK,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      status: "PROVISIONING",
      dataPath,
    },
  });

  const secrets = generateTenantSecrets();
  await prisma.tenantSecret.create({
    data: {
      tenantId: tenant.id,
      dbEncryptionKey: secrets.dbEncryptionKey,
      sessionSecret: secrets.sessionSecret,
    },
  });
  // DB_PATH set explicitly: unset, Yuvomi defaults to "<app-root>/yuvomi.db"
  // (i.e. inside /app, not the mounted volume) — root-owned and unwritable
  // by the non-root user its entrypoint drops to, which crashes with
  // SQLITE_CANTOPEN. Confirmed against the shipped image's server/db.js.
  const dbPath = `${env.TENANT_DATA_MOUNT_PATH}/${env.TENANT_DB_FILENAME}`;
  await writeTenantEnvFile(envFilePath, secrets, {
    NODE_ENV: "production",
    DB_PATH: dbPath,
    // Defaults the new family to the orchestrator's own SMTP relay; they
    // can still override/reconfigure it from inside Yuvomi's own settings
    // UI afterward — env only wins over Yuvomi's DB-stored config when set.
    ...inheritedSmtpEnv(),
  });

  try {
    const containerId = await createTenantContainer(toSpec(tenant));
    await writeTenantRoute({ tenantId: tenant.id, subdomain: tenant.subdomain, containerName: tenant.containerName });
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { containerId, status: "RUNNING" },
    });
  } catch (err) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "UNHEALTHY" } });
    throw err;
  }

  await recordAudit({
    actorId: input.actorId,
    action: "tenant.provision",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { subdomain, image, imageTag },
  });

  return tenant;
}

async function requireTenant(id: string): Promise<Tenant> {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw new TenantError(`tenant not found: ${id}`, "NOT_FOUND");
  return tenant;
}

export async function pauseTenant(id: string, actorId?: string): Promise<Tenant> {
  const tenant = await requireTenant(id);
  if (!tenant.containerId) throw new TenantError("tenant has no container", "INVALID_STATE");
  await stopTenantContainer(tenant.containerId);
  await removeTenantRoute(tenant.id);
  const updated = await prisma.tenant.update({ where: { id }, data: { status: "PAUSED" } });
  await recordAudit({ actorId, action: "tenant.pause", targetType: "Tenant", targetId: id });
  return updated;
}

export async function resumeTenant(id: string, actorId?: string): Promise<Tenant> {
  const tenant = await requireTenant(id);
  if (!tenant.containerId) throw new TenantError("tenant has no container", "INVALID_STATE");
  await startTenantContainer(tenant.containerId);
  await writeTenantRoute({ tenantId: tenant.id, subdomain: tenant.subdomain, containerName: tenant.containerName });
  const updated = await prisma.tenant.update({ where: { id }, data: { status: "RUNNING" } });
  await recordAudit({ actorId, action: "tenant.resume", targetType: "Tenant", targetId: id });
  return updated;
}

export async function deleteTenant(
  id: string,
  options: { wipeData: boolean; actorId?: string },
): Promise<void> {
  const tenant = await requireTenant(id);
  await prisma.tenant.update({ where: { id }, data: { status: "DELETING" } });
  await removeTenantRoute(tenant.id);

  if (tenant.containerId) {
    await stopTenantContainer(tenant.containerId);
    await removeTenantContainer(tenant.containerId);
  }

  if (options.wipeData) {
    const { root } = paths(tenant.id);
    await rm(root, { recursive: true, force: true });
  }

  await prisma.tenant.delete({ where: { id } }); // cascades secrets/invites/schedules/backupLogs

  await recordAudit({
    actorId: options.actorId,
    action: "tenant.delete",
    targetType: "Tenant",
    targetId: id,
    metadata: { wipedData: options.wipeData },
  });
}

export async function updateTenantImage(
  id: string,
  target: { image?: string; imageTag: string },
  actorId?: string,
): Promise<Tenant> {
  const tenant = await requireTenant(id);
  if (!tenant.containerId) throw new TenantError("tenant has no container", "INVALID_STATE");

  const nextTenant: Tenant = {
    ...tenant,
    image: target.image ?? tenant.image,
    imageTag: target.imageTag,
  };

  const containerId = await dockerUpdateImage(toSpec(nextTenant), tenant.containerId);

  const updated = await prisma.tenant.update({
    where: { id },
    data: { image: nextTenant.image, imageTag: nextTenant.imageTag, containerId, status: "RUNNING" },
  });

  await recordAudit({
    actorId,
    action: "tenant.update_image",
    targetType: "Tenant",
    targetId: id,
    metadata: { image: nextTenant.image, imageTag: nextTenant.imageTag },
  });

  return updated;
}

export async function refreshTenantStatus(id: string): Promise<Tenant> {
  const tenant = await requireTenant(id);
  if (!tenant.containerId) return tenant;

  const state = await inspectTenantContainer(tenant.containerId);
  let status: TenantStatus = tenant.status as TenantStatus;

  if (!state) {
    status = "UNHEALTHY";
  } else if (!state.running) {
    status = tenant.status === "PAUSED" ? "PAUSED" : "STOPPED";
  } else if (state.health === "unhealthy") {
    status = "UNHEALTHY";
  } else {
    status = "RUNNING";
  }

  if (status === tenant.status) return tenant;
  return prisma.tenant.update({ where: { id }, data: { status } });
}

export async function listTenants(): Promise<Tenant[]> {
  return prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getTenant(id: string): Promise<Tenant> {
  return requireTenant(id);
}
