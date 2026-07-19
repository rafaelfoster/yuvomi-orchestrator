import Docker from "dockerode";
import { env } from "../config/env.js";

// Talks ONLY to Tecnativa/docker-socket-proxy over TCP — never mounts
// /var/run/docker.sock directly into this container. The proxy is
// configured (see infra/docker-socket-proxy) to allow just the endpoints
// the orchestrator needs: CONTAINERS, IMAGES, NETWORKS, VOLUMES read/write,
// with POST restricted to container create/start/stop/restart/remove.
export const docker = new Docker({
  host: env.DOCKER_SOCKET_PROXY_HOST,
  port: env.DOCKER_SOCKET_PROXY_PORT,
  protocol: "http",
});
