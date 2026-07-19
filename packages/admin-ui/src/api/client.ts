import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  withCredentials: true,
});

function expectArray<T>(value: unknown, label: string): T[] {
  if (Array.isArray(value)) return value as T[];

  const detail =
    value && typeof value === "object" && "error" in value
      ? String((value as { error?: unknown }).error)
      : `Invalid ${label} response`;

  throw new Error(detail);
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: "PROVISIONING" | "RUNNING" | "PAUSED" | "UNHEALTHY" | "STOPPED" | "DELETING";
  containerId: string | null;
  containerName: string;
  image: string;
  imageTag: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
}

export interface ContainerState {
  running: boolean;
  status: string;
  health: "starting" | "healthy" | "unhealthy" | "none";
  imageTag: string;
  imageSha: string;
  startedAt: string | null;
}

export interface Invite {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  contactEmail: string | null;
  contactPhone: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface BackupLog {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  sizeBytes: number | null;
  errorMessage: string | null;
}

export interface Schedule {
  id: string;
  tenantId: string | null;
  type: "UPDATE" | "RESTART";
  targetImage: string | null;
  cronExpression: string | null;
  runAt: string | null;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
  lastRunAt: string | null;
  lastError: string | null;
}

export const tenantsApi = {
  list: () => api.get<unknown>("/tenants").then((r) => expectArray<Tenant>(r.data, "tenants")),
  get: (id: string) => api.get<Tenant>(`/tenants/${id}`).then((r) => r.data),
  status: (id: string) =>
    api.get<{ tenant: Tenant; container: ContainerState | null }>(`/tenants/${id}/status`).then((r) => r.data),
  create: (input: {
    name: string;
    subdomain: string;
    contactName: string;
    contactEmail?: string;
    contactPhone?: string;
  }) => api.post<Tenant>("/tenants", input).then((r) => r.data),
  pause: (id: string) => api.post<Tenant>(`/tenants/${id}/pause`).then((r) => r.data),
  resume: (id: string) => api.post<Tenant>(`/tenants/${id}/resume`).then((r) => r.data),
  remove: (id: string, wipeData: boolean) =>
    api.delete(`/tenants/${id}`, { params: { wipeData } }).then(() => undefined),
  updateImage: (id: string, image: string, imageTag: string) =>
    api.post<Tenant>(`/tenants/${id}/image`, { image, imageTag }).then((r) => r.data),
  logsUrl: (id: string) => `${api.defaults.baseURL}/tenants/${id}/logs`,
};

export const invitesApi = {
  list: (tenantId: string) =>
    api.get<unknown>(`/tenants/${tenantId}/invites`).then((r) => expectArray<Invite>(r.data, "invites")),
  create: (tenantId: string, input: { channel: "EMAIL" | "WHATSAPP"; contactEmail?: string; contactPhone?: string }) =>
    api.post<Invite>(`/tenants/${tenantId}/invites`, input).then((r) => r.data),
  inspect: (token: string) =>
    api.get<{ tenantName: string; subdomain: string; channel: string; expiresAt: string }>(`/invites/${token}`).then((r) => r.data),
  activate: (token: string, input: { name: string; email: string; password: string }) =>
    api.post(`/invites/${token}/activate`, input).then(() => undefined),
};

export const backupsApi = {
  list: (tenantId: string) =>
    api.get<unknown>(`/tenants/${tenantId}/backups`).then((r) => expectArray<BackupLog>(r.data, "backups")),
};

export const schedulesApi = {
  list: () => api.get<unknown>("/schedules").then((r) => expectArray<Schedule>(r.data, "schedules")),
  create: (input: {
    tenantId?: string;
    type: "UPDATE" | "RESTART";
    targetImage?: string;
    cronExpression?: string;
    runAt?: string;
  }) => api.post<Schedule>("/schedules", input).then((r) => r.data),
  cancel: (id: string) => api.post<Schedule>(`/schedules/${id}/cancel`).then((r) => r.data),
  runNow: (id: string) => api.post(`/schedules/${id}/run`).then(() => undefined),
};

export interface AdminProfile {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
}

export const authApi = {
  login: (email: string, password: string) =>
    api
      .post<{ pending: true; pendingId: string; mfaSetupRequired?: boolean }>("/auth/login", { email, password })
      .then((r) => r.data),
  totpSetup: (pendingId: string) =>
    api.post<{ secret: string; otpauthUrl: string }>("/auth/totp/setup", { pendingId }).then((r) => r.data),
  totpEnable: (pendingId: string, token: string) =>
    api.post("/auth/totp/enable", { pendingId, token }).then(() => undefined),
  totpVerify: (pendingId: string, token: string) =>
    api.post("/auth/totp/verify", { pendingId, token }).then(() => undefined),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post("/auth/password", { currentPassword, newPassword }).then(() => undefined),
  logout: () => api.post("/auth/logout").then(() => undefined),
  me: () => api.get<AdminProfile>("/auth/me").then((r) => r.data),
};
