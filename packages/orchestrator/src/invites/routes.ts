import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  InviteError,
  activateInvite,
  createInvite,
  inspectInvite,
  listInvitesForTenant,
} from "./service.js";

function handleInviteError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof InviteError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "INVALID_STATE" ? 400 : 410;
    res.status(status).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

// Mounted at /api/tenants/:tenantId/invites — requires an authenticated admin.
export const tenantInvitesRouter = Router({ mergeParams: true });
tenantInvitesRouter.use(requireAuth);

const createInviteSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
});

tenantInvitesRouter.get("/", async (req: AuthedRequest<{ tenantId: string }>, res) => {
  res.json(await listInvitesForTenant(req.params.tenantId));
});

tenantInvitesRouter.post("/", async (req: AuthedRequest<{ tenantId: string }>, res) => {
  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const invite = await createInvite({
      tenantId: req.params.tenantId,
      ...parsed.data,
      actorId: req.admin?.id,
    });
    res.status(201).json(invite);
  } catch (err) {
    if (!handleInviteError(err, res)) throw err;
  }
});

// Mounted at /api/invites — public, token-gated (the activation flow).
export const publicInvitesRouter = Router();

publicInvitesRouter.get("/:token", async (req, res) => {
  try {
    res.json(await inspectInvite(req.params.token));
  } catch (err) {
    if (!handleInviteError(err, res)) throw err;
  }
});

const activateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10),
});

publicInvitesRouter.post("/:token/activate", async (req, res) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await activateInvite({ token: req.params.token, ...parsed.data });
    res.json({ ok: true });
  } catch (err) {
    if (!handleInviteError(err, res)) throw err;
  }
});
