import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { listBackupsForTenant } from "./service.js";

// Mounted at /api/tenants/:tenantId/backups
export const tenantBackupsRouter = Router({ mergeParams: true });
tenantBackupsRouter.use(requireAuth);

tenantBackupsRouter.get("/", async (req: AuthedRequest<{ tenantId: string }>, res) => {
  res.json(await listBackupsForTenant(req.params.tenantId));
});
