import { randomBytes } from "node:crypto";

// Holds admin identity between "password verified" and "second factor
// verified". In-memory + single-process, same caveat as the WebAuthn
// challenge store (see webauthn.ts) — move to Redis before scaling out.
const pending = new Map<string, { adminUserId: string; expiresAt: number }>();
const PENDING_TTL_MS = 5 * 60 * 1000;

export function createPendingLogin(adminUserId: string): string {
  const id = randomBytes(24).toString("base64url");
  pending.set(id, { adminUserId, expiresAt: Date.now() + PENDING_TTL_MS });
  return id;
}

export function peekPendingLogin(pendingId: string): string | null {
  const entry = pending.get(pendingId);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.adminUserId;
}

export function consumePendingLogin(pendingId: string): string | null {
  const adminUserId = peekPendingLogin(pendingId);
  pending.delete(pendingId);
  return adminUserId;
}
