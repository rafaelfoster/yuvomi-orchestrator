import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { recordAudit } from "../audit.js";
import { sendInviteEmail } from "../notifications/smtp.js";
import { sendInviteWhatsapp } from "../notifications/whatsapp.js";
import { bootstrapTenantAdmin } from "./tenantAdminClient.js";
import type { Invite } from "../db/generated/client/client.js";
import type { InviteChannel } from "../db/enums.js";

export class InviteError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "EXPIRED" | "USED" | "INVALID_STATE",
  ) {
    super(message);
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreateInviteInput {
  tenantId: string;
  channel: InviteChannel;
  contactEmail?: string;
  contactPhone?: string;
  actorId?: string;
}

export async function createInvite(input: CreateInviteInput): Promise<Invite> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new InviteError("tenant not found", "NOT_FOUND");
  if (tenant.status !== "RUNNING") {
    throw new InviteError("tenant must be running to send an invite", "INVALID_STATE");
  }
  if (input.channel === "EMAIL" && !input.contactEmail) {
    throw new InviteError("contactEmail required for EMAIL channel", "INVALID_STATE");
  }
  if (input.channel === "WHATSAPP" && !input.contactPhone) {
    throw new InviteError("contactPhone required for WHATSAPP channel", "INVALID_STATE");
  }

  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.invite.create({
    data: {
      tenantId: tenant.id,
      channel: input.channel,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  const activationUrl = `${env.INVITE_BASE_URL}?token=${token}`;

  if (input.channel === "EMAIL") {
    await sendInviteEmail({ to: input.contactEmail!, familyName: tenant.name, activationUrl });
  } else {
    await sendInviteWhatsapp({ to: input.contactPhone!, familyName: tenant.name, activationUrl });
  }

  await recordAudit({
    actorId: input.actorId,
    action: "invite.create",
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { channel: input.channel, inviteId: invite.id },
  });

  return invite;
}

async function requireValidInvite(token: string) {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { tenant: true },
  });
  if (!invite) throw new InviteError("invite not found", "NOT_FOUND");
  if (invite.usedAt) throw new InviteError("invite already used", "USED");
  if (invite.expiresAt.getTime() < Date.now()) throw new InviteError("invite expired", "EXPIRED");
  return invite;
}

export async function inspectInvite(token: string) {
  const invite = await requireValidInvite(token);
  return {
    tenantName: invite.tenant.name,
    subdomain: invite.tenant.subdomain,
    channel: invite.channel,
    expiresAt: invite.expiresAt,
  };
}

export async function activateInvite(params: {
  token: string;
  name: string;
  email: string;
  password: string;
}): Promise<void> {
  if (params.password.length < 10) {
    throw new InviteError("password must be at least 10 characters", "INVALID_STATE");
  }

  const invite = await requireValidInvite(params.token);

  await bootstrapTenantAdmin(invite.tenant, {
    name: params.name,
    email: params.email,
    password: params.password,
  });

  await prisma.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

  await recordAudit({
    action: "invite.activate",
    targetType: "Tenant",
    targetId: invite.tenantId,
    metadata: { inviteId: invite.id, email: params.email },
  });
}

export async function listInvitesForTenant(tenantId: string): Promise<Invite[]> {
  return prisma.invite.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
}
