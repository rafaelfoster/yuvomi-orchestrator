import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorDevice,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import type { VerifiedAuthenticationResponse, VerifiedRegistrationResponse } from "@simplewebauthn/server";
import { env } from "../config/env.js";
import { prisma } from "../db/client.js";

// Single-process challenge store. If the orchestrator is ever scaled to
// multiple replicas, back this with Redis (or the AdminSession table) so
// registration/auth ceremonies survive load-balancer stickiness changes.
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function putChallenge(key: string, challenge: string): void {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function takeChallenge(key: string): string | null {
  const entry = challengeStore.get(key);
  challengeStore.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}

function parseTransports(csv: string | null): AuthenticatorTransportFuture[] | undefined {
  return csv ? (csv.split(",") as AuthenticatorTransportFuture[]) : undefined;
}

export async function buildRegistrationOptions(adminUserId: string, email: string) {
  const existingCredentials = await prisma.webAuthnCredential.findMany({ where: { adminUserId } });

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userName: email,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: parseTransports(cred.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  putChallenge(`reg:${adminUserId}`, options.challenge);
  return options;
}

export async function verifyRegistration(
  adminUserId: string,
  response: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<VerifiedRegistrationResponse> {
  const expectedChallenge = takeChallenge(`reg:${adminUserId}`);
  if (!expectedChallenge) throw new Error("registration challenge expired or missing");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
  });

  if (verification.verified && verification.registrationInfo) {
    const info = verification.registrationInfo;
    await prisma.webAuthnCredential.create({
      data: {
        adminUserId,
        credentialId: info.credentialID,
        publicKey: Buffer.from(info.credentialPublicKey),
        counter: info.counter,
        deviceLabel,
      },
    });
  }

  return verification;
}

export async function buildAuthenticationOptions(email: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    include: { credentials: true },
  });
  if (!admin || admin.credentials.length === 0) {
    throw new Error("no passkeys registered for this account");
  }

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: "preferred",
    allowCredentials: admin.credentials.map((cred) => ({
      id: cred.credentialId,
      transports: parseTransports(cred.transports),
    })),
  });

  putChallenge(`auth:${email}`, options.challenge);
  return options;
}

export async function verifyAuthentication(
  email: string,
  response: AuthenticationResponseJSON,
): Promise<{ verification: VerifiedAuthenticationResponse; adminUserId: string }> {
  const expectedChallenge = takeChallenge(`auth:${email}`);
  if (!expectedChallenge) throw new Error("authentication challenge expired or missing");

  const admin = await prisma.adminUser.findUnique({ where: { email }, include: { credentials: true } });
  if (!admin) throw new Error("unknown account");

  const credential = admin.credentials.find((cred) => cred.credentialId === response.id);
  if (!credential) throw new Error("credential not registered for this account");

  const authenticator: AuthenticatorDevice = {
    credentialID: credential.credentialId,
    credentialPublicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
    transports: parseTransports(credential.transports),
  };

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.WEBAUTHN_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    authenticator,
  });

  if (verification.verified) {
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
  }

  return { verification, adminUserId: admin.id };
}
