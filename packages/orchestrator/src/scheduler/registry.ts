import cron, { type ScheduledTask } from "node-cron";

// Maps Schedule.id -> its live node-cron task, so schedule CRUD can
// register/unregister recurring jobs without a process restart.
const tasks = new Map<string, ScheduledTask>();

export function registerRecurringTask(scheduleId: string, cronExpression: string, run: () => Promise<void>): void {
  unregisterTask(scheduleId);
  const task = cron.schedule(cronExpression, () => {
    run().catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`schedule ${scheduleId} failed`, err);
    });
  });
  tasks.set(scheduleId, task);
}

export function unregisterTask(scheduleId: string): void {
  tasks.get(scheduleId)?.stop();
  tasks.delete(scheduleId);
}
