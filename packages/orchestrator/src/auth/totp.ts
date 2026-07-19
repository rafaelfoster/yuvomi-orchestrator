import { authenticator } from "otplib";
import { env } from "../config/env.js";

authenticator.options = { window: 1 }; // allow ±1 step (30s) of clock drift

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, env.WEBAUTHN_RP_NAME, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
