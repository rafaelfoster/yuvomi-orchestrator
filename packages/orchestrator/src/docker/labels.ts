/**
 * Bookkeeping labels only — Traefik has no Docker provider (see
 * infra/traefik/traefik.yml) and never reads these. Routing is handled by
 * src/docker/traefikRoute.ts instead. Kept for safe bulk operations
 * (e.g. `docker ps --filter label=yuvomi.orchestrator.managed=true`).
 */
export function buildManagedLabels(params: { tenantId: string }): Record<string, string> {
  return {
    "yuvomi.orchestrator.managed": "true",
    "yuvomi.orchestrator.tenant-id": params.tenantId,
  };
}
