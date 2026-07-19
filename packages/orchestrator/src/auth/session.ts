import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "yo_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Hash of a raw session token as stored in AdminSession.tokenHash. */
export function sessionTokenHash(token: string): string {
  return hashToken(token);
}

export async function createSession(
  adminUserId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      adminUserId,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export async function resolveSession(token: string) {
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    domain: env.NODE_ENV === "production" ? env.ORCHESTRATOR_COOKIE_DOMAIN : undefined,
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    domain: env.NODE_ENV === "production" ? env.ORCHESTRATOR_COOKIE_DOMAIN : undefined,
  });
}
