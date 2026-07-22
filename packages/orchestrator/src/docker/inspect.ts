import { docker } from "./client.js";

export type HealthState = "starting" | "healthy" | "unhealthy" | "none";

export interface TenantContainerState {
  running: boolean;
  status: string; // docker's raw State.Status: running, exited, paused, ...
  health: HealthState;
  imageTag: string;
  imageSha: string;
  startedAt: string | null;
}

export async function inspectTenantContainer(containerId: string): Promise<TenantContainerState | null> {
  const container = docker.getContainer(containerId);
  try {
    const info = await container.inspect();
    return {
      running: info.State.Running,
      status: info.State.Status,
      health: (info.State.Health?.Status as HealthState | undefined) ?? "none",
      imageTag: info.Config.Image,
      imageSha: info.Image,
      startedAt: info.State.Running ? info.State.StartedAt : null,
    };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404) return null; // container gone (removed outside orchestrator)
    throw err;
  }
}

// Yuvomi logs its own version once at boot: {"mod":"Yuvomi","msg":"Server
// running on port 3000 | Version 1.43.0"}. There's no dedicated version
// endpoint on the app, so this is the only source — read it straight out
// of the container's own logs instead of relying on the image tag (which
// is often "latest" and tells you nothing about what's actually running).
const VERSION_LINE_RE = /"msg":"Server running on port \d+ \| Version ([^"]+)"/;

export async function getTenantAppVersion(containerId: string, startedAt: string | null): Promise<string | null> {
  const container = docker.getContainer(containerId);
  try {
    // `since` scopes the read to the current boot so a long-lived
    // container's full log history is never pulled just to find one line
    // near the top of it; `tail` is a belt-and-suspenders cap.
    const raw = (await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
      tail: 200,
      since: startedAt ? Math.floor(new Date(startedAt).getTime() / 1000) : 0,
    })) as unknown as Buffer;
    return raw.toString("utf8").match(VERSION_LINE_RE)?.[1] ?? null;
  } catch {
    return null; // best-effort — never let version lookup break the status endpoint
  }
}
