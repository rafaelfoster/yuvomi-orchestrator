import { describe, expect, test, vi, beforeEach } from "vitest";

const pullMock = vi.fn();
const followProgressMock = vi.fn();

vi.mock("./client.js", () => ({
  docker: {
    pull: (...args: unknown[]) => pullMock(...args),
    modem: { followProgress: (...args: unknown[]) => followProgressMock(...args) },
  },
}));

const { pullImage, ImagePullError } = await import("./tenantContainer.js");

describe("pullImage error classification", () => {
  beforeEach(() => {
    pullMock.mockReset();
    followProgressMock.mockReset();
  });

  test("classifies a registry 'manifest unknown' as NOT_FOUND", async () => {
    pullMock.mockImplementation((_ref: string, cb: (err: unknown, stream: unknown) => void) => cb(null, {}));
    followProgressMock.mockImplementation((_stream: unknown, cb: (err: unknown) => void) =>
      cb(new Error("manifest unknown: manifest unknown")),
    );

    await expect(pullImage("ghcr.io/ulsklyc/yuvomi:v9.9.9-missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(pullImage("ghcr.io/ulsklyc/yuvomi:v9.9.9-missing")).rejects.toBeInstanceOf(ImagePullError);
  });

  test("classifies an unrelated pull failure as REGISTRY_ERROR", async () => {
    pullMock.mockImplementation((_ref: string, cb: (err: unknown) => void) => cb(new Error("ECONNREFUSED")));

    await expect(pullImage("ghcr.io/ulsklyc/yuvomi:latest")).rejects.toMatchObject({
      code: "REGISTRY_ERROR",
    });
  });

  test("classifies a followProgress failure the same way as an initial pull failure", async () => {
    pullMock.mockImplementation((_ref: string, cb: (err: unknown, stream: unknown) => void) => cb(null, {}));
    followProgressMock.mockImplementation((_stream: unknown, cb: (err: unknown) => void) =>
      cb(new Error("404 Not Found")),
    );

    await expect(pullImage("ghcr.io/ulsklyc/yuvomi:v1.0.0")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
