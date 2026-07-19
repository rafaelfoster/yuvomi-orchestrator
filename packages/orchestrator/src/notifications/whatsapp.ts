import axios from "axios";
import { env } from "../config/env.js";

/**
 * Sends a message through a self-hosted whatsmeow HTTP gateway
 * (https://github.com/tulir/whatsmeow-based bridges typically expose a
 * simple REST send endpoint). Adjust the payload shape to match whichever
 * whatsmeow HTTP wrapper is deployed — this assumes a generic
 * `POST /send {phone, message}` contract.
 */
export async function sendInviteWhatsapp(params: {
  to: string; // E.164 phone number
  familyName: string;
  activationUrl: string;
}): Promise<void> {
  if (!env.WHATSAPP_GATEWAY_URL) {
    throw new Error("WhatsApp gateway not configured (set WHATSAPP_GATEWAY_URL in .env)");
  }

  const message =
    `Olá! Você foi convidado a administrar o Yuvomi da família ${params.familyName}.\n` +
    `Ative seu acesso: ${params.activationUrl}\n` +
    `Este link expira em breve.`;

  await axios.post(
    env.WHATSAPP_GATEWAY_URL,
    { phone: params.to, message },
    {
      headers: env.WHATSAPP_GATEWAY_TOKEN
        ? { Authorization: `Bearer ${env.WHATSAPP_GATEWAY_TOKEN}` }
        : undefined,
      timeout: 10_000,
    },
  );
}
