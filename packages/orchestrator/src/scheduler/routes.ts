import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { ScheduleError, cancelSchedule, createSchedule, listSchedules, runScheduleNow } from "./service.js";

export const schedulesRouter = Router();
schedulesRouter.use(requireAuth);

const createSchema = z
  .object({
    tenantId: z.string().optional(),
    type: z.enum(["UPDATE", "RESTART"]),
    targetImage: z.string().optional(),
    cronExpression: z.string().optional(),
    runAt: z.coerce.date().optional(),
  })
  .refine((data) => Boolean(data.cronExpression) !== Boolean(data.runAt), {
    message: "provide exactly one of cronExpression or runAt",
  });

schedulesRouter.get("/", async (_req, res) => {
  res.json(await listSchedules());
});

schedulesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const schedule = await createSchedule({ ...parsed.data, actorId: req.admin?.id });
    res.status(201).json(schedule);
  } catch (err) {
    if (err instanceof ScheduleError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

schedulesRouter.post("/:id/run", async (req, res) => {
  await runScheduleNow(req.params.id);
  res.json({ ok: true });
});

schedulesRouter.post("/:id/cancel", async (req: AuthedRequest, res) => {
  res.json(await cancelSchedule(req.params.id, req.admin?.id));
});
