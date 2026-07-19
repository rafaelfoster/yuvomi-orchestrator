import type { Response } from "express";
import { docker } from "./client.js";

/**
 * Streams a tenant container's stdout/stderr to an SSE response in real
 * time. dockerode demultiplexes the Docker log stream frames for us.
 */
export async function streamTenantLogs(containerId: string, res: Response, tail = 200): Promise<void> {
  const container = docker.getContainer(containerId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });

  const send = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
  };

  docker.modem.demuxStream(logStream as unknown as NodeJS.ReadableStream, { write: send } as unknown as NodeJS.WritableStream, {
    write: send,
  } as unknown as NodeJS.WritableStream);

  const close = () => {
    (logStream as unknown as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    res.end();
  };

  res.req.on("close", close);
}
