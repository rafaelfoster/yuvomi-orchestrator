// Populates required env vars with dummy values before any test module
// imports src/config/env.ts, which validates process.env eagerly at
// import time. Real values only matter for the actual running service.
const defaults: Record<string, string> = {
  ORCHESTRATOR_DB_URL: "file:./test.db",
  ORCHESTRATOR_SESSION_SECRET: "test-session-secret-at-least-32-chars-long",
  ORCHESTRATOR_COOKIE_DOMAIN: "localhost",
  ROOT_DOMAIN: "families.test",
  DOCKER_SOCKET_PROXY_HOST: "docker-socket-proxy",
  WEBAUTHN_RP_ID: "families.test",
  WEBAUTHN_RP_NAME: "Yuvomi Orchestrator Test",
  WEBAUTHN_ORIGIN: "https://admin.families.test",
  TENANT_DATA_ROOT: "/tmp/yuvomi-test-tenants",
  TENANT_BACKUP_ROOT: "/tmp/yuvomi-test-tenant-backups",
  TENANT_DEFAULT_IMAGE: "ghcr.io/ulsklyc/yuvomi:latest",
  TENANT_NETWORK: "yuvomi_edge_test",
  INVITE_BASE_URL: "https://admin.families.test/activate",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
