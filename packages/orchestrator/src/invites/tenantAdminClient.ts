import axios from "axios";
import { env } from "../config/env.js";
import type { Tenant } from "../db/generated/client/client.js";

/**
 * Yuvomi's own source code is never modified, so promoting the invited
 * contact to tenant admin has to go through whatever first-run/admin
 * bootstrap HTTP endpoint the Yuvomi app already exposes, called over the
 * internal Docker network (container name resolves via TENANT_NETWORK —
 * the orchestrator must be attached to that network too).
 *
 * The path below (`/api/admin/bootstrap`) is a placeholder — point it at
 * Yuvomi's actual first-admin-setup route before going live.
 */
export async function bootstrapTenantAdmin(
  tenant: Tenant,
  params: { name: string; email: string; password: string },
): Promise<void> {
  const url = `http://${tenant.containerName}:${env.TENANT_APP_PORT}/api/admin/bootstrap`;

  await axios.post(url, params, { timeout: 10_000 }).catch((err) => {
    throw new Error(
      `failed to bootstrap tenant admin for ${tenant.subdomain}: ${(err as Error).message}`,
    );
  });
}
