import { spawn } from "node:child_process";
import readline from "node:readline";

let shuttingDown = false;

const processes = [
  ["api", ["run", "dev:orchestrator"]],
  ["ui", ["run", "dev:admin-ui"]],
].map(([name, args]) => {
  const child = spawn("npm", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeWithPrefix(child.stdout, name);
  pipeWithPrefix(child.stderr, name);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${name}] exited with ${signal ?? code}`);
    shutdown(code && code > 0 ? code : 1);
  });

  return child;
});

function pipeWithPrefix(stream, name) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    console.log(`[${name}] ${line}`);
  });
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
