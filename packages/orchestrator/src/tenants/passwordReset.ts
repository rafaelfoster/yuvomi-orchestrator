import { docker } from "../docker/client.js";
import { recordAudit } from "../audit.js";
import type { Tenant } from "../db/generated/client/client.js";

export class PasswordResetError extends Error {
  constructor(
    message: string,
    public code: "USER_NOT_FOUND" | "EXEC_FAILED",
  ) {
    super(message);
  }
}

// Static script, no user input interpolated into it — username/password
// reach the process only via the exec's own Env (below), never through
// string-built JS source. Mirrors server/db.js's own exports (init, get)
// and users.password_hash column, confirmed against the shipped image;
// init() is required because `docker exec` starts a brand-new node
// process each time, unconnected to the app's already-running instance —
// db.get() throws "Not initialized" without it. --import dotenv/config
// loads the same bind-mounted /app/.env the main process uses, so this
// opens the correct (and, if configured, correctly SQLCipher-decrypted)
// database file.
const RESET_SCRIPT = `
import bcrypt from 'bcrypt';
import { init, get } from '/app/server/db.js';

init();
const username = process.env.YUVOMI_RESET_USERNAME;
const password = process.env.YUVOMI_RESET_PASSWORD;
const hash = await bcrypt.hash(password, 12);
const result = get().prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
if (result.changes > 0) {
  console.log('RESET_OK');
} else {
  console.error('RESET_USER_NOT_FOUND');
  process.exit(1);
}
`;

export async function resetTenantAdminPassword(
  tenant: Tenant,
  username: string,
  newPassword: string,
  actorId?: string,
): Promise<void> {
  if (!tenant.containerId) throw new PasswordResetError("tenant has no container", "EXEC_FAILED");

  const container = docker.getContainer(tenant.containerId);
  const exec = await container.exec({
    Cmd: ["node", "--import", "dotenv/config", "--input-type=module", "-e", RESET_SCRIPT],
    Env: [`YUVOMI_RESET_USERNAME=${username}`, `YUVOMI_RESET_PASSWORD=${newPassword}`],
    WorkingDir: "/app",
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const sink = { write: (chunk: Buffer) => chunks.push(chunk) };
    docker.modem.demuxStream(
      stream as unknown as NodeJS.ReadableStream,
      sink as unknown as NodeJS.WritableStream,
      sink as unknown as NodeJS.WritableStream,
    );
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const result = await exec.inspect();
  const output = Buffer.concat(chunks).toString("utf8");

  // Audit logs the username only — never the password, on success or failure.
  if (result.ExitCode !== 0) {
    await recordAudit({
      actorId,
      action: "tenant.reset_admin_password_failed",
      targetType: "Tenant",
      targetId: tenant.id,
      metadata: { username },
    });
    if (output.includes("RESET_USER_NOT_FOUND")) {
      throw new PasswordResetError(`user not found: ${username}`, "USER_NOT_FOUND");
    }
    throw new PasswordResetError(`password reset failed: ${output.trim()}`, "EXEC_FAILED");
  }

  await recordAudit({
    actorId,
    action: "tenant.reset_admin_password",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { username },
  });
}
