import type { Response } from "express";
import pino from "pino";
import { docker } from "./client.js";

const logger = pino({ name: "docker-logs" });

/**
 * Streams a tenant container's stdout/stderr to an SSE response in real
 * time. dockerode demultiplexes the Docker log stream frames for us.
 *
 * The underlying stream emits an 'error' event (not a rejected promise) if
 * the container is stopped/removed out from under a live `follow: true`
 * tail — e.g. mid-image-update. An EventEmitter 'error' with no listener
 * is a Node fatal: it throws synchronously and crashes the whole process
 * (confirmed in production — an in-progress tenant image update killed the
 * orchestrator while an admin had that tenant's live-logs panel open,
 * leaving the tenant's container update half-applied). Every stream
 * touched here needs an explicit 'error' listener for that reason.
 */
export async function streamTenantLogs(containerId: string, res: Response, tail = 200): Promise<void> {
  const container = docker.getContainer(containerId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let logStream: (NodeJS.ReadableStream & { destroy?: () => void }) | null = null;

  const close = () => {
    logStream?.destroy?.();
    if (!res.writableEnded) res.end();
  };

  try {
    logStream = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })) as unknown as NodeJS.ReadableStream & { destroy?: () => void };
  } catch (err) {
    logger.warn({ err, containerId }, "failed to open log stream");
    close();
    return;
  }

  logStream.on("error", (err: unknown) => {
    logger.warn({ err, containerId }, "log stream error (container likely stopped/removed)");
    close();
  });

  const send = (chunk: Buffer) => {
    if (res.writableEnded) return;
    for (const line of chunk.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
  };

  const stdout = { write: send, on: () => stdout } as unknown as NodeJS.WritableStream;
  const stderr = { write: send, on: () => stderr } as unknown as NodeJS.WritableStream;
  docker.modem.demuxStream(logStream, stdout, stderr);

  res.req.on("close", close);
  res.req.on("error", close);
}
