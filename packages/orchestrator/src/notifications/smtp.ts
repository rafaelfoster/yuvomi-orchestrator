import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendInviteEmail(params: {
  to: string;
  familyName: string;
  activationUrl: string;
}): Promise<void> {
  if (!transport) {
    throw new Error("SMTP not configured (set SMTP_HOST in .env)");
  }

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: `Ative o acesso da família ${params.familyName} no Yuvomi`,
    text: `Olá! Você foi convidado a administrar o Yuvomi da família ${params.familyName}.\n\nAtive seu acesso em: ${params.activationUrl}\n\nEste link expira em breve.`,
    html: `<p>Olá!</p><p>Você foi convidado a administrar o Yuvomi da família <strong>${params.familyName}</strong>.</p><p><a href="${params.activationUrl}">Ativar meu acesso</a></p><p>Este link expira em breve.</p>`,
  });
}
