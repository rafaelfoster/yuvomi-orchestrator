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

const logger = pino({ name: "orchestrator", level: env.ORCHESTRATOR_LOG_LEVEL });

// WEBAUTHN_ORIGIN always allowed (it's the deployed admin console); extra
// origins (local dev servers, alternate hosts) come from
// CORS_ALLOWED_ORIGINS. Kept as a Set + origin callback, not a static
// string, because cors() only ever echoes back a single Access-Control-
// Allow-Origin value — it can't return "one of several" any other way.
const allowedOrigins = new Set(
  [env.WEBAUTHN_ORIGIN, ...env.CORS_ALLOWED_ORIGINS.split(",")].map((o) => o.trim()).filter(Boolean),
);

const app = express();
app.disable("x-powered-by");
app.use(
  pinoHttp({
    logger,
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      return "debug";
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, same-origin) — allow.
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error(`origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
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
