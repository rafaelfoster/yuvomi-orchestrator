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

export async function createTenantContainer(
  spec: TenantContainerSpec,
  options: { skipPull?: boolean } = {},
): Promise<string> {
  const ref = imageRef(spec);
  if (!options.skipPull) await pullImage(ref);

  const container = await docker.createContainer({
    name: spec.containerName,
    Image: ref,
    Labels: buildManagedLabels({ tenantId: spec.tenantId }),
    // The shipped image's own baked-in CMD is just ["node",
    // "server/index.js"] — no dotenv preload — even though its
    // package.json "start" script (never actually invoked by the image)
    // is "node --import dotenv/config server/index.js". Without this
    // override the bind-mounted .env file (DB_PATH, DB_ENCRYPTION_KEY,
    // SESSION_SECRET, ...) is silently never read: dotenv is simply never
    // loaded, regardless of the file's path, contents, or permissions.
    // Confirmed by extracting the image's package.json and comparing
    // against `docker inspect`'s Config.Cmd. Matches their own start
    // script exactly so this stays correct across image updates as long
    // as that script does.
    Cmd: ["node", "--import", "dotenv/config", "server/index.js"],
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
      // NOT wget: the shipped image has no wget (and no curl) on PATH —
      // confirmed via `docker exec ... which wget` → "not found". A
      // wget-based check fails 100% of the time with "wget: not found",
      // which Docker reports as HEALTHCHECK failure (exit 1, not "command
      // not found" surfaced any other way) — so health was permanently
      // "unhealthy" regardless of the app's real state. Using Node's
      // built-in fetch instead: guaranteed present, since this is what
      // runs the app itself.
      Test: [
        "CMD-SHELL",
        `node -e "fetch('http://localhost:${env.TENANT_APP_PORT}/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`,
      ],
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
 * Surgical update: pull the new image *before* touching the running
 * container, then stop + remove the old one and recreate with the new
 * tag (data volume and secrets file untouched on disk throughout).
 *
 * Pulling first is deliberate: a bad/nonexistent tag fails at the pull
 * step, before the old container is stopped — so the tenant stays online
 * on the previous image instead of ending up with no container at all.
 * (Previously the old container was removed first; a pull failure for the
 * new tag then left the tenant with nothing running until manually
 * recreated.)
 */
export async function updateTenantImage(
  spec: TenantContainerSpec,
  previousContainerId: string,
): Promise<string> {
  await pullImage(imageRef(spec));
  await stopTenantContainer(previousContainerId);
  await removeTenantContainer(previousContainerId);
  return createTenantContainer(spec, { skipPull: true });
}
