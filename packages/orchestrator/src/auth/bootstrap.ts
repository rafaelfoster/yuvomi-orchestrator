// Auto-bootstrap of the first super-admin account. Replaces the old manual
// seed script: when the orchestrator starts with an empty AdminUser table it
// creates ADMIN_DEFAULT_EMAIL with a randomly generated password and prints
// the credentials to the container logs. The banner is re-printed on every
// startup until the password is changed (the generated password is kept in
// the DB for exactly that purpose and cleared on first change — the login
// flow forces that change before anything else can be done).
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Logger } from "pino";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";

const PASSWORD_BYTES = 15; // → 20 chars base64url

export function generateInitialPassword(): string {
  return randomBytes(PASSWORD_BYTES).toString("base64url");
}

function printCredentialsBanner(email: string, password: string): void {
  const lines = [
    "",
    "==============================================================",
    "  Yuvomi Orchestrator — default admin credentials",
    "",
    `  E-mail:   ${email}`,
    `  Password: ${password}`,
    "",
    "  You will be required to change this password on first login.",
    "  This banner repeats on every startup until it is changed.",
    "==============================================================",
    "",
  ];
  // Plain console output on purpose: pino wraps messages in JSON, and this
  // banner must be trivially readable in `docker logs`.
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

export async function ensureAdminBootstrap(logger: Logger): Promise<void> {
  const adminCount = await prisma.adminUser.count();

  if (adminCount === 0) {
    const password = generateInitialPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.adminUser.create({
      data: {
        email: env.ADMIN_DEFAULT_EMAIL,
        passwordHash,
        isSuperAdmin: true,
        mustChangePassword: true,
        initialPassword: password,
      },
    });
    logger.warn({ email: env.ADMIN_DEFAULT_EMAIL }, "no admin found — default super-admin created");
  }

  const pending = await prisma.adminUser.findMany({
    where: { mustChangePassword: true, initialPassword: { not: null } },
    select: { email: true, initialPassword: true },
  });
  for (const admin of pending) {
    if (admin.initialPassword) printCredentialsBanner(admin.email, admin.initialPassword);
  }
}
