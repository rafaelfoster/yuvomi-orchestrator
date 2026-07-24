import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(configDir, "../../../..", ".env") });
loadDotenv({ path: path.resolve(configDir, "../..", ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  ORCHESTRATOR_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ORCHESTRATOR_PORT: z.coerce.number().default(4000),
  ORCHESTRATOR_DB_URL: z.string().min(1),
  ORCHESTRATOR_SESSION_SECRET: z.string().min(32, "session secret must be >=32 chars"),
  ORCHESTRATOR_COOKIE_DOMAIN: z.string().min(1),

  // E-mail of the auto-bootstrapped first super-admin. Its password is
  // generated at first startup and printed to the container logs until
  // changed — see src/auth/bootstrap.ts.
  ADMIN_DEFAULT_EMAIL: z.string().email().default("admin@example.com"),

  ROOT_DOMAIN: z.string().min(1),

  DOCKER_SOCKET_PROXY_HOST: z.string().min(1),
  DOCKER_SOCKET_PROXY_PORT: z.coerce.number().default(2375),

  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().min(1),
  WEBAUTHN_ORIGIN: z.string().url(),

  // Comma-separated list of origins allowed to call the API with
  // credentials (browser CORS), e.g. "https://admin.example.com,
  // http://localhost:5173". Distinct from WEBAUTHN_ORIGIN on purpose:
  // WebAuthn has exactly one RP origin, but CORS commonly needs several
  // (prod admin host + local dev servers). Falls back to WEBAUTHN_ORIGIN
  // alone when unset so existing deployments keep working unchanged.
  CORS_ALLOWED_ORIGINS: z.string().optional().default(""),

  TENANT_DATA_ROOT: z.string().min(1),
  TENANT_DEFAULT_IMAGE: z.string().min(1),
  TENANT_NETWORK: z.string().min(1),
  TENANT_APP_PORT: z.coerce.number().default(3000),
  // Path inside the tenant container where the per-tenant secrets file is
  // mounted read-only. Assumes Yuvomi loads env vars via dotenv from its
  // working directory (no source changes required).
  TENANT_ENV_MOUNT_PATH: z.string().default("/app/.env"),
  // Confirmed against the shipped image's /entrypoint.sh: it runs as root
  // just long enough to `chown -R node:node /data /backups /app/modules`,
  // then execs the app via `gosu node` — so the app itself always runs as
  // the non-root `node` user. /data is the one path that entrypoint chowns
  // for us; anywhere else (e.g. the old /app/data default) stays root-owned
  // and the app can't write to it, which is why unset/wrong values here
  // produce SQLITE_CANTOPEN rather than a permissions error at our layer.
  TENANT_DATA_MOUNT_PATH: z.string().default("/data"),
  // Host root dir containing one backups subfolder per tenant (mirrors
  // TENANT_DATA_ROOT), bind-mounted per-tenant into TENANT_BACKUP_MOUNT_PATH.
  // Same Docker-outside-of-Docker path-parity requirement as TENANT_DATA_ROOT:
  // the orchestrator's own container must bind-mount this at the identical
  // host path (see docker-compose.yml) for the hand-off to tenant containers
  // to resolve.
  TENANT_BACKUP_ROOT: z.string().min(1),
  // Path inside the tenant container where its per-tenant backup folder is
  // mounted, and the value written to its BACKUP_DIR env var. Must be
  // exactly "/backups" (the shipped image's entrypoint only chowns
  // /data, /backups, and /app/modules to the non-root `node` user before
  // dropping privileges — Yuvomi's own internal backup scheduler defaults
  // BACKUP_DIR to the relative "./backups", which resolves under its
  // app-root working directory and stays root-owned/unwritable unless
  // this is set to the absolute chowned path instead).
  TENANT_BACKUP_MOUNT_PATH: z.string().default("/backups"),
  // Directory (shared with the Traefik container via a volume) where one
  // route file per tenant is written/removed — see src/docker/traefikRoute.ts.
  // Must be the SAME flat directory Traefik's file provider watches
  // (providers.file.directory in traefik.yml), not a subdirectory of it —
  // Traefik's watch does not react live to changes inside subdirectories.
  TRAEFIK_DYNAMIC_TENANTS_DIR: z.string().default("/etc/traefik/dynamic"),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default("Yuvomi <no-reply@localhost>"),

  WHATSAPP_GATEWAY_URL: z.string().optional().default(""),
  WHATSAPP_GATEWAY_TOKEN: z.string().optional().default(""),

  INVITE_BASE_URL: z.string().url(),
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().default(48),

  // Reconciles the admin UI's BackupLog with whatever Yuvomi's own internal
  // scheduler has already written to TENANT_BACKUP_ROOT — see
  // src/backups/service.ts. Retention itself is governed by Yuvomi's own
  // BACKUP_KEEP (tenants/service.ts's tenantRuntimeEnv), not here.
  BACKUP_CRON: z.string().default("0 4 * * *"),
  // Filename of the SQLCipher database inside the tenant's data mount.
  // Adjust to match Yuvomi's actual on-disk filename.
  TENANT_DB_FILENAME: z.string().default("yuvomi.db"),

  // "owner/repo" polled for available Yuvomi image tags — see
  // src/releases/service.ts. Results are cached to disk and refreshed by
  // RELEASES_POLL_CRON.
  RELEASES_GITHUB_REPO: z.string().default("ulsklyc/yuvomi"),
  RELEASES_POLL_CRON: z.string().default("*/30 * * * *"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
