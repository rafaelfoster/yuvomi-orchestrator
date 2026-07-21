import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getCachedReleases } from "./service.js";

export const releasesRouter = Router();
releasesRouter.use(requireAuth);

releasesRouter.get("/", async (_req, res) => {
  res.json(await getCachedReleases());
});
