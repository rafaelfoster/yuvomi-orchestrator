import cron from "node-cron";
import { prisma } from "../db/client.js";
import { recordAudit } from "../audit.js";
import { registerRecurringTask, unregisterTask } from "./registry.js";
import { runSchedule } from "./runner.js";
import type { Schedule } from "@prisma/client";
import type { ScheduleType } from "../db/enums.js";

export class ScheduleError extends Error {}

export interface CreateScheduleInput {
  tenantId?: string;
  type: ScheduleType;
  targetImage?: string;
  cronExpression?: string;
  runAt?: Date;
  actorId?: string;
}

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  if (!input.cronExpression && !input.runAt) {
    throw new ScheduleError("provide either cronExpression or runAt");
  }
  if (input.cronExpression && input.runAt) {
    throw new ScheduleError("provide cronExpression or runAt, not both");
  }
  if (input.cronExpression && !cron.validate(input.cronExpression)) {
    throw new ScheduleError(`invalid cron expression: ${input.cronExpression}`);
  }
  if (input.type === "UPDATE" && !input.targetImage) {
    throw new ScheduleError("targetImage required for UPDATE schedules");
  }

  const schedule = await prisma.schedule.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      targetImage: input.targetImage,
      cronExpression: input.cronExpression,
      runAt: input.runAt,
      status: "PENDING",
    },
  });

  if (schedule.cronExpression) {
    registerRecurringTask(schedule.id, schedule.cronExpression, () => runSchedule(schedule.id));
  }

  await recordAudit({
    actorId: input.actorId,
    action: "schedule.create",
    targetType: "Schedule",
    targetId: schedule.id,
    metadata: { tenantId: input.tenantId, type: input.type },
  });

  return schedule;
}

export async function cancelSchedule(id: string, actorId?: string): Promise<Schedule> {
  unregisterTask(id);
  const schedule = await prisma.schedule.update({ where: { id }, data: { status: "CANCELLED" } });
  await recordAudit({ actorId, action: "schedule.cancel", targetType: "Schedule", targetId: id });
  return schedule;
}

export async function runScheduleNow(id: string): Promise<void> {
  await runSchedule(id);
}

export async function listSchedules(): Promise<Schedule[]> {
  return prisma.schedule.findMany({ orderBy: { createdAt: "desc" } });
}
