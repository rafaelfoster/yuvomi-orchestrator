import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { pinoHttp } from "pino-http";
import pino from "pino";
import { env } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { initScheduler } from "./scheduler/cron.js";
import { ensureAdminBootstrap } from "./auth/bootstrap.js";

const logger = pino({ name: "orchestrator", level: env.NODE_ENV === "development" ? "debug" : "info" });

const app = express();
app.disable("x-powered-by");
app.use(pinoHttp({ logger }));
app.use(cors({ origin: env.WEBAUTHN_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api", apiRouter);

app.use(errorHandler(logger));

async function main() {
  await ensureAdminBootstrap(logger);
  await initScheduler();
  app.listen(env.ORCHESTRATOR_PORT, () => {
    logger.info({ port: env.ORCHESTRATOR_PORT }, "orchestrator listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "failed to start orchestrator");
  process.exit(1);
});
