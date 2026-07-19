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
