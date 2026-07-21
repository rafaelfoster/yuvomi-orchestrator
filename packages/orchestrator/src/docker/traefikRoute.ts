import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { env } from "../config/env.js";

function routeFilePath(tenantId: string): string {
  // Flat, not nested — Traefik's file-provider `watch: true` picks up
  // changes made from another container to files directly inside its
  // watched directory, but does NOT react live to changes inside a
  // subdirectory (confirmed empirically: a nested-subdir file loads fine
  // on Traefik startup/restart, but edits to it afterward are silently
  // ignored — the recursive directory *parse* and the fsnotify *watch*
  // are not the same thing). A `tenant-` prefix keeps this collision-free
  // with the static *.yml files in the same directory.
  return path.join(env.TRAEFIK_DYNAMIC_TENANTS_DIR, `tenant-${tenantId}.yml`);
}

/**
 * Writes one Traefik dynamic-config file per tenant to a directory shared
 * with the Traefik container. Traefik's file provider (watch: true) picks
 * it up live — no restart, no Docker API involved. This replaces the
 * Docker-label + Traefik-Docker-provider approach, which cannot work here:
 * see infra/traefik/traefik.yml for why.
 */
export async function writeTenantRoute(params: {
  tenantId: string;
  subdomain: string;
  containerName: string;
}): Promise<void> {
  const router = `tenant-${params.tenantId}`;
  const host = `${params.subdomain}.${env.ROOT_DOMAIN}`;

  const config = `# managed by the orchestrator — do not edit by hand
http:
  routers:
    ${router}:
      rule: "Host(\`${host}\`)"
      entryPoints:
        - websecure
      tls:
        certResolver: dnswildcard
      service: ${router}
  services:
    ${router}:
      loadBalancer:
        servers:
          - url: "http://${params.containerName}:${env.TENANT_APP_PORT}"
`;

  await mkdir(env.TRAEFIK_DYNAMIC_TENANTS_DIR, { recursive: true });
  await writeFile(routeFilePath(params.tenantId), config);
}

export async function removeTenantRoute(tenantId: string): Promise<void> {
  await rm(routeFilePath(tenantId), { force: true });
}
