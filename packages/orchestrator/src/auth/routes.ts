import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { recordAudit } from "../audit.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  sessionTokenHash,
  setSessionCookie,
  SESSION_COOKIE,
} from "./session.js";
import { consumePendingLogin, createPendingLogin, peekPendingLogin } from "./pendingLogin.js";
import { generateTotpSecret, totpKeyUri, verifyTotp } from "./totp.js";
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "./webauthn.js";

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const admin = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = admin ? await bcrypt.compare(parsed.data.password, admin.passwordHash) : false;
  if (!admin || !passwordOk) {
    return res.status(401).json({ error: "invalid credentials" });
  }

  const pendingId = createPendingLogin(admin.id);

  if (!admin.totpEnabled) {
    return res.json({ pending: true, pendingId, mfaSetupRequired: true });
  }
  return res.json({ pending: true, pendingId });
});

authRouter.post("/totp/setup", async (req, res) => {
  const { pendingId } = req.body as { pendingId?: string };
  const adminUserId = pendingId ? peekPendingLogin(pendingId) : null;
  if (!adminUserId) return res.status(401).json({ error: "invalid or expired pending login" });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminUserId } });
  const secret = generateTotpSecret();
  await prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecret: secret } });

  res.json({ secret, otpauthUrl: totpKeyUri(admin.email, secret) });
});

const totpVerifySchema = z.object({ pendingId: z.string().min(1), token: z.string().min(6).max(6) });

async function finishTotpLogin(req: import("express").Request, res: import("express").Response, enable: boolean) {
  const parsed = totpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const adminUserId = peekPendingLogin(parsed.data.pendingId);
  if (!adminUserId) return res.status(401).json({ error: "invalid or expired pending login" });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminUserId } });
  if (!admin.totpSecret) return res.status(409).json({ error: "TOTP not set up for this account" });

  if (!verifyTotp(admin.totpSecret, parsed.data.token)) {
    return res.status(401).json({ error: "invalid TOTP code" });
  }

  consumePendingLogin(parsed.data.pendingId);

  if (enable && !admin.totpEnabled) {
    await prisma.adminUser.update({ where: { id: admin.id }, data: { totpEnabled: true } });
  }

  const token = await createSession(admin.id, { userAgent: req.get("user-agent") ?? undefined, ip: req.ip });
  setSessionCookie(res, token);
  await recordAudit({ actorId: admin.id, action: "auth.login", targetType: "AdminUser", targetId: admin.id });
  res.json({ ok: true });
}

authRouter.post("/totp/enable", (req, res) => finishTotpLogin(req, res, true));
authRouter.post("/totp/verify", (req, res) => finishTotpLogin(req, res, false));

// --- WebAuthn / Passkeys ---
// Registration requires an existing session (adding a passkey to your own
// account). Authentication is passwordless and does not.

authRouter.get("/webauthn/register/options", requireAuth, async (req: AuthedRequest, res) => {
  const options = await buildRegistrationOptions(req.admin!.id, req.admin!.email);
  res.json(options);
});

authRouter.post("/webauthn/register/verify", requireAuth, async (req: AuthedRequest, res) => {
  const { response, deviceLabel } = req.body as { response: Parameters<typeof verifyRegistration>[1]; deviceLabel?: string };
  const result = await verifyRegistration(req.admin!.id, response, deviceLabel);
  if (!result.verified) return res.status(400).json({ error: "passkey registration failed" });
  await recordAudit({ actorId: req.admin!.id, action: "auth.webauthn_register", targetType: "AdminUser", targetId: req.admin!.id });
  res.json({ ok: true });
});

authRouter.post("/webauthn/login/options", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "email required" });
  try {
    res.json(await buildAuthenticationOptions(email));
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

authRouter.post("/webauthn/login/verify", async (req, res) => {
  const { email, response } = req.body as { email?: string; response?: Parameters<typeof verifyAuthentication>[1] };
  if (!email || !response) return res.status(400).json({ error: "email and response required" });

  try {
    const { verification, adminUserId } = await verifyAuthentication(email, response);
    if (!verification.verified) return res.status(401).json({ error: "passkey verification failed" });

    const token = await createSession(adminUserId, { userAgent: req.get("user-agent") ?? undefined, ip: req.ip });
    setSessionCookie(res, token);
    await recordAudit({ actorId: adminUserId, action: "auth.login_webauthn", targetType: "AdminUser", targetId: adminUserId });
    res.json({ ok: true });
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, "new password must be at least 12 characters"),
});

authRouter.post("/password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: req.admin!.id } });
  const currentOk = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
  if (!currentOk) return res.status(401).json({ error: "current password is incorrect" });
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ error: "new password must differ from the current one" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const currentTokenHash = sessionTokenHash(req.cookies?.[SESSION_COOKIE] ?? "");
  await prisma.$transaction([
    // Clearing initialPassword stops the credentials banner in the
    // container logs — see src/auth/bootstrap.ts.
    prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash, mustChangePassword: false, initialPassword: null },
    }),
    // Revoke every other session for this account: the old password may
    // have been exposed (bootstrap credentials are printed to logs).
    prisma.adminSession.deleteMany({
      where: { adminUserId: admin.id, NOT: { tokenHash: currentTokenHash } },
    }),
  ]);

  await recordAudit({ actorId: admin.id, action: "auth.password_change", targetType: "AdminUser", targetId: admin.id });
  res.json({ ok: true });
});

authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json(req.admin);
});
