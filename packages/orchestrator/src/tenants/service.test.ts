import { describe, expect, test, vi, beforeEach } from "vitest";
import type { Tenant } from "../db/generated/client/client.js";

const findUniqueTenant = vi.fn();
const findUniqueSecret = vi.fn();

vi.mock("../db/client.js", () => ({
  prisma: {
    tenant: { findUnique: (...args: unknown[]) => findUniqueTenant(...args) },
    tenantSecret: { findUnique: (...args: unknown[]) => findUniqueSecret(...args) },
  },
}));

vi.mock("./secrets.js", () => ({
  generateTenantSecrets: () => ({ dbEncryptionKey: "k", sessionSecret: "s" }),
  writeTenantEnvFile: vi.fn().mockResolvedValue(undefined),
}));

const dockerUpdateImageMock = vi.fn();
vi.mock("../docker/tenantContainer.js", async () => {
  const actual = await vi.importActual<typeof import("../docker/tenantContainer.js")>("../docker/tenantContainer.js");
  return {
    ...actual,
    updateTenantImage: (...args: unknown[]) => dockerUpdateImageMock(...args),
  };
});

const { updateTenantImage, TenantError } = await import("./service.js");
const { ImagePullError } = await import("../docker/tenantContainer.js");

function fakeTenant(): Tenant {
  return {
    id: "t1",
    name: "Foster Family",
    subdomain: "foster",
    status: "RUNNING",
    containerId: "container-1",
    containerName: "yuvomi-tenant-foster",
    image: "ghcr.io/ulsklyc/yuvomi",
    imageTag: "v1.0.0",
    dataPath: "/srv/yuvomi/tenants/t1/data",
    backupPath: "/srv/yuvomi/tenants/t1/backups",
    network: "yuvomi_edge",
    contactName: "Rafael",
    contactEmail: null,
    contactPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe("updateTenantImage", () => {
  beforeEach(() => {
    findUniqueTenant.mockReset();
    findUniqueSecret.mockReset();
    dockerUpdateImageMock.mockReset();
    findUniqueSecret.mockResolvedValue({ dbEncryptionKey: "k", sessionSecret: "s" });
  });

  test("maps a missing GHCR image tag to a TenantError with code IMAGE_TAG_NOT_FOUND", async () => {
    findUniqueTenant.mockResolvedValue(fakeTenant());
    dockerUpdateImageMock.mockRejectedValue(new ImagePullError("manifest unknown", "NOT_FOUND"));

    await expect(updateTenantImage("t1", { imageTag: "v9.9.9-missing" })).rejects.toMatchObject({
      code: "IMAGE_TAG_NOT_FOUND",
    });
    await expect(updateTenantImage("t1", { imageTag: "v9.9.9-missing" })).rejects.toBeInstanceOf(TenantError);
  });

  test("re-throws an unrelated pull failure unchanged", async () => {
    findUniqueTenant.mockResolvedValue(fakeTenant());
    const registryError = new ImagePullError("ECONNREFUSED", "REGISTRY_ERROR");
    dockerUpdateImageMock.mockRejectedValue(registryError);

    await expect(updateTenantImage("t1", { imageTag: "v1.0.1" })).rejects.toBe(registryError);
  });
});
