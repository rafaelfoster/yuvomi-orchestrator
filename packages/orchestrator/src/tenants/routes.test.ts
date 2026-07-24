import { describe, expect, test, vi } from "vitest";

vi.mock("../middleware/requireAuth.js", () => ({ requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));

const { handleTenantError } = await import("./routes.js");
const { TenantError } = await import("./service.js");

function fakeRes() {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe("handleTenantError", () => {
  test("maps IMAGE_TAG_NOT_FOUND to a 404 with the domain error code surfaced", () => {
    const res = fakeRes();
    const handled = handleTenantError(new TenantError("image tag not found: ghcr.io/x:v9", "IMAGE_TAG_NOT_FOUND"), res as never);

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: "IMAGE_TAG_NOT_FOUND" });
  });

  test("does not handle non-TenantError errors", () => {
    const res = fakeRes();
    const handled = handleTenantError(new Error("boom"), res as never);
    expect(handled).toBe(false);
  });
});
