import { Router } from "express";
import { authRouter } from "../auth/routes.js";
import { tenantsRouter } from "../tenants/routes.js";
import { tenantInvitesRouter, publicInvitesRouter } from "../invites/routes.js";
import { tenantBackupsRouter } from "../backups/routes.js";
import { schedulesRouter } from "../scheduler/routes.js";
import { releasesRouter } from "../releases/routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/invites", publicInvitesRouter);
apiRouter.use("/schedules", schedulesRouter);
apiRouter.use("/releases", releasesRouter);
apiRouter.use("/tenants/:tenantId/invites", tenantInvitesRouter);
apiRouter.use("/tenants/:tenantId/backups", tenantBackupsRouter);
apiRouter.use("/tenants", tenantsRouter);
