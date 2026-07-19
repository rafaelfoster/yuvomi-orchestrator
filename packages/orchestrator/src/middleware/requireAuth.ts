import type { NextFunction, ParamsDictionary, Request, Response } from "express-serve-static-core";
import { SESSION_COOKIE, resolveSession } from "../auth/session.js";

export interface AuthedRequest<P extends ParamsDictionary = ParamsDictionary> extends Request<P> {
  admin?: { id: string; email: string; isSuperAdmin: boolean; mustChangePassword: boolean };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "not authenticated" });
    return;
  }

  const session = await resolveSession(token);
  if (!session) {
    res.status(401).json({ error: "session expired or invalid" });
    return;
  }

  req.admin = {
    id: session.adminUser.id,
    email: session.adminUser.email,
    isSuperAdmin: session.adminUser.isSuperAdmin,
    mustChangePassword: session.adminUser.mustChangePassword,
  };

  // A bootstrapped admin must change the generated password before touching
  // anything beyond the auth endpoints (me / password change / logout).
  if (session.adminUser.mustChangePassword && !req.originalUrl.startsWith("/api/auth")) {
    res.status(403).json({ error: "password change required", code: "PASSWORD_CHANGE_REQUIRED" });
    return;
  }

  next();
}
