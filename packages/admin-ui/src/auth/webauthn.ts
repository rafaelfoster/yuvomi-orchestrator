import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { api } from "../api/client";

export async function registerPasskey(deviceLabel?: string): Promise<void> {
  const { data: options } = await api.get("/auth/webauthn/register/options");
  const response = await startRegistration(options);
  await api.post("/auth/webauthn/register/verify", { response, deviceLabel });
}

export async function loginWithPasskey(email: string): Promise<void> {
  const { data: options } = await api.post("/auth/webauthn/login/options", { email });
  const response = await startAuthentication(options);
  await api.post("/auth/webauthn/login/verify", { email, response });
}
