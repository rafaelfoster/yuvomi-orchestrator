import { docker } from "./client.js";
import { buildManagedLabels } from "./labels.js";
import { env } from "../config/env.js";

export interface TenantContainerSpec {
  tenantId: string;
  containerName: string;
  subdomain: string;
  image: string;
  imageTag: string;
  dataPath: string; // host path: /srv/yuvomi/tenants/{tenant_id}/data
  envFilePath: string; // host path: /srv/yuvomi/tenants/{tenant_id}/.env
  network: string;
}

function imageRef(spec: Pick<TenantContainerSpec, "image" | "imageTag">): string {
  return `${spec.image}:${spec.imageTag}`;
}

export async function pullImage(ref: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    docker.pull(ref, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (progressErr: unknown) =>
        progressErr ? reject(progressErr) : resolve(),
      );
    });
  });
}

export async function createTenantContainer(spec: TenantContainerSpec): Promise<string> {
  const ref = imageRef(spec);
  await pullImage(ref);

  const container = await docker.createContainer({
    name: spec.containerName,
    Image: ref,
    Labels: buildManagedLabels({ tenantId: spec.tenantId }),
    HostConfig: {
      Binds: [
        `${spec.dataPath}:${env.TENANT_DATA_MOUNT_PATH}:rw`,
        `${spec.envFilePath}:${env.TENANT_ENV_MOUNT_PATH}:ro`,
      ],
      NetworkMode: spec.network,
      RestartPolicy: { Name: "unless-stopped" },
      // Never grant the tenant container Docker socket access or host
      // networking — strict per-tenant isolation.
      ReadonlyRootfs: false,
      SecurityOpt: ["no-new-privileges"],
    },
    Healthcheck: {
      Test: ["CMD-SHELL", `wget -qO- http://localhost:${env.TENANT_APP_PORT}/ || exit 1`],
      Interval: 30_000_000_000, // 30s in ns
      Timeout: 5_000_000_000,
      Retries: 3,
    },
  });

  await container.start();
  return container.id;
}

export async function stopTenantContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.stop({ t: 15 }).catch((err: { statusCode?: number }) => {
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err; // already stopped / gone
  });
}

export async function startTenantContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.start().catch((err: { statusCode?: number }) => {
    if (err.statusCode !== 304) throw err; // already running
  });
}

export async function removeTenantContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container
    .remove({ force: true })
    .catch((err: { statusCode?: number }) => {
      if (err.statusCode !== 404) throw err;
    });
}

/**
 * Surgical update: stop + remove the old container, keep the data volume
 * and secrets file untouched on disk, recreate with a new image tag.
 */
export async function updateTenantImage(
  spec: TenantContainerSpec,
  previousContainerId: string,
): Promise<string> {
  await stopTenantContainer(previousContainerId);
  await removeTenantContainer(previousContainerId);
  return createTenantContainer(spec);
}
