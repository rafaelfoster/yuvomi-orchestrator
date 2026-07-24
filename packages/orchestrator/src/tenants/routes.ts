import { Router } from "express";
import { z } from "zod";
import {
  TenantError,
  deleteTenant,
  getTenant,
  listTenants,
  pauseTenant,
  provisionTenant,
  refreshTenantStatus,
  resumeTenant,
  updateTenantImage,
} from "./service.js";
import { PasswordResetError, resetTenantAdminPassword } from "./passwordReset.js";
import { getTenantAppVersion, inspectTenantContainer } from "../docker/inspect.js";
import { streamTenantLogs } from "../docker/logs.js";
import { requireAuth } from "../middleware/requireAuth.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

export const tenantsRouter = Router();
tenantsRouter.use(requireAuth);

export function handleTenantError(err: unknown, res: import("express").Response): boolean {
  if (err instanceof TenantError) {
    const status =
      err.code === "NOT_FOUND" || err.code === "IMAGE_TAG_NOT_FOUND" ? 404 : err.code === "SUBDOMAIN_TAKEN" ? 409 : 400;
    res.status(status).json({ error: err.message, code: err.code });
    return true;
  }
  return false;
}

const provisionSchema = z.object({
  name: z.string().min(1),
  subdomain: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  image: z.string().optional(),
  imageTag: z.string().optional(),
});

tenantsRouter.get("/", async (_req, res) => {
  res.json(await listTenants());
});

tenantsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const tenant = await provisionTenant({ ...parsed.data, actorId: req.admin?.id });
    res.status(201).json(tenant);
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

tenantsRouter.get("/:id", async (req, res) => {
  try {
    res.json(await getTenant(req.params.id));
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

tenantsRouter.get("/:id/status", async (req, res) => {
  try {
    const tenant = await refreshTenantStatus(req.params.id);
    if (!tenant.containerId) return res.json({ tenant, container: null });

    const state = await inspectTenantContainer(tenant.containerId);
    const appVersion = state?.running ? await getTenantAppVersion(tenant.containerId, state.startedAt) : null;
    res.json({ tenant, container: state ? { ...state, appVersion } : null });
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

tenantsRouter.post("/:id/pause", async (req: AuthedRequest, res) => {
  try {
    res.json(await pauseTenant(req.params.id, req.admin?.id));
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

tenantsRouter.post("/:id/resume", async (req: AuthedRequest, res) => {
  try {
    res.json(await resumeTenant(req.params.id, req.admin?.id));
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

tenantsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const wipeData = req.query.wipeData === "true";
  try {
    await deleteTenant(req.params.id, { wipeData, actorId: req.admin?.id });
    res.status(204).send();
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

const updateImageSchema = z.object({
  image: z.string().optional(),
  imageTag: z.string().min(1),
});

tenantsRouter.post("/:id/image", async (req: AuthedRequest, res) => {
  const parsed = updateImageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    res.json(await updateTenantImage(req.params.id, parsed.data, req.admin?.id));
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});

const resetPasswordSchema = z.object({
  username: z.string().min(1),
  newPassword: z.string().min(8),
});

tenantsRouter.post("/:id/reset-admin-password", async (req: AuthedRequest, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const tenant = await getTenant(req.params.id);
    await resetTenantAdminPassword(tenant, parsed.data.username, parsed.data.newPassword, req.admin?.id);
    res.json({ ok: true });
  } catch (err) {
    if (handleTenantError(err, res)) return;
    if (err instanceof PasswordResetError) {
      return res.status(err.code === "USER_NOT_FOUND" ? 404 : 502).json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

tenantsRouter.get("/:id/logs", async (req, res) => {
  try {
    const tenant = await getTenant(req.params.id);
    if (!tenant.containerId) return res.status(409).json({ error: "tenant has no container" });
    await streamTenantLogs(tenant.containerId, res);
  } catch (err) {
    if (!handleTenantError(err, res)) throw err;
  }
});
