import cron from "node-cron";
import pino from "pino";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { runBackupForAllTenants } from "../backups/service.js";
import { registerRecurringTask } from "./registry.js";
import { runSchedule } from "./runner.js";

const logger = pino({ name: "scheduler" });

/**
 * Called once at server startup. Re-registers every still-active recurring
 * schedule (the in-memory registry is empty on a fresh process), starts
 * the one-off due-date sweep, and wires up the nightly backup cron.
 */
export async function initScheduler(): Promise<void> {
  const recurring = await prisma.schedule.findMany({
    where: { cronExpression: { not: null }, status: { not: "CANCELLED" } },
  });

  for (const schedule of recurring) {
    registerRecurringTask(schedule.id, schedule.cronExpression!, () => runSchedule(schedule.id));
  }
  logger.info({ count: recurring.length }, "recurring schedules registered");

  // Fires every minute; picks up one-off (runAt) schedules whose time has come.
  cron.schedule("* * * * *", async () => {
    const due = await prisma.schedule.findMany({
      where: { runAt: { lte: new Date() }, status: "PENDING", cronExpression: null },
    });
    for (const schedule of due) {
      runSchedule(schedule.id).catch((err) => logger.error({ err, scheduleId: schedule.id }, "schedule run failed"));
    }
  });

  cron.schedule(env.BACKUP_CRON, () => {
    runBackupForAllTenants().catch((err) => logger.error({ err }, "nightly backup run failed"));
  });
  logger.info({ cron: env.BACKUP_CRON }, "backup cron registered");
}
