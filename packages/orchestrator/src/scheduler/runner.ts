import { prisma } from "../db/client.js";
import { recordAudit } from "../audit.js";
import { updateTenantImage } from "../tenants/service.js";
import { startTenantContainer, stopTenantContainer } from "../docker/tenantContainer.js";
import type { Schedule, Tenant } from "../db/generated/client/client.js";

export function splitImageRef(ref: string): { image: string; imageTag: string } {
  const lastSlash = ref.lastIndexOf("/");
  const lastColon = ref.lastIndexOf(":");
  if (lastColon > lastSlash) {
    return { image: ref.slice(0, lastColon), imageTag: ref.slice(lastColon + 1) };
  }
  return { image: ref, imageTag: "latest" };
}

async function applyToTenant(schedule: Schedule, tenant: Tenant): Promise<void> {
  if (schedule.type === "UPDATE") {
    if (!schedule.targetImage) throw new Error("schedule missing targetImage");
    await updateTenantImage(tenant.id, splitImageRef(schedule.targetImage));
  } else if (schedule.type === "RESTART") {
    if (!tenant.containerId) throw new Error("tenant has no container");
    await stopTenantContainer(tenant.containerId);
    await startTenantContainer(tenant.containerId);
  }
}

export async function runSchedule(scheduleId: string): Promise<void> {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.status === "CANCELLED") return;

  await prisma.schedule.update({ where: { id: scheduleId }, data: { status: "RUNNING" } });

  const tenants = schedule.tenantId
    ? await prisma.tenant.findMany({ where: { id: schedule.tenantId } })
    : await prisma.tenant.findMany({ where: { status: { in: ["RUNNING", "PAUSED"] } } });

  const errors: string[] = [];
  for (const tenant of tenants) {
    try {
      await applyToTenant(schedule, tenant);
    } catch (err) {
      errors.push(`${tenant.subdomain}: ${(err as Error).message}`);
      await recordAudit({
        action: "schedule.tenant_failed",
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: { scheduleId: schedule.id, error: (err as Error).message },
      });
    }
  }

  const isOneOff = !schedule.cronExpression;
  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      status: errors.length > 0 ? "FAILED" : isOneOff ? "SUCCESS" : "PENDING",
      lastRunAt: new Date(),
      lastError: errors.length > 0 ? errors.join("; ") : null,
    },
  });

  await recordAudit({
    action: "schedule.run",
    targetType: "Schedule",
    targetId: schedule.id,
    metadata: { tenantCount: tenants.length, errorCount: errors.length },
  });
}
