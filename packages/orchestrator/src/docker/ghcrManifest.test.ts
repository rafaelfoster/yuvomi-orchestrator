import { describe, expect, test, vi, beforeEach } from "vitest";
import axios from "axios";
import { checkImageTagExists, listGhcrTags } from "./ghcrManifest.js";

vi.mock("axios");

const mockedGet = vi.mocked(axios.get);

function mockToken() {
  mockedGet.mockResolvedValueOnce({ data: { token: "anon-token" } });
}

describe("checkImageTagExists", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  test("returns exists when GHCR responds 200 for the manifest", async () => {
    mockToken();
    mockedGet.mockResolvedValueOnce({ status: 200 });

    const result = await checkImageTagExists("ghcr.io/ulsklyc/yuvomi", "v1.2.3");

    expect(result).toEqual({ status: "exists" });
    expect(mockedGet).toHaveBeenNthCalledWith(
      2,
      "https://ghcr.io/v2/ulsklyc/yuvomi/manifests/v1.2.3",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer anon-token" }) }),
    );
  });

  test("returns not_found when GHCR responds 404 (manifest unknown)", async () => {
    mockToken();
    mockedGet.mockResolvedValueOnce({ status: 404 });

    const result = await checkImageTagExists("ghcr.io/ulsklyc/yuvomi", "v9.9.9-missing");

    expect(result).toEqual({ status: "not_found" });
  });

  test("returns registry_error on network failure", async () => {
    mockToken();
    mockedGet.mockRejectedValueOnce(new Error("timeout of 10000ms exceeded"));

    const result = await checkImageTagExists("ghcr.io/ulsklyc/yuvomi", "v1.0.0");

    expect(result.status).toBe("registry_error");
    if (result.status === "registry_error") {
      expect(result.reason).toContain("timeout");
    }
  });

  test("returns registry_error on unexpected non-200/404 status", async () => {
    mockToken();
    mockedGet.mockResolvedValueOnce({ status: 500 });

    const result = await checkImageTagExists("ghcr.io/ulsklyc/yuvomi", "v1.0.0");

    expect(result.status).toBe("registry_error");
  });
});

describe("listGhcrTags", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  test("returns every tag from a single, unpaginated response", async () => {
    mockToken();
    mockedGet.mockResolvedValueOnce({ status: 200, data: { tags: ["latest", "1.0.0", "1.0.1"] }, headers: {} });

    const result = await listGhcrTags("ghcr.io/ulsklyc/yuvomi");

    expect(result).toEqual({ status: "ok", tags: new Set(["latest", "1.0.0", "1.0.1"]) });
  });

  test("follows a host-relative Link: rel=next header across multiple pages", async () => {
    // GHCR's actual Link header is host-relative, not absolute — confirmed
    // against the live registry. Resolving it naively (or not at all)
    // throws ERR_INVALID_URL.
    mockToken();
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: { tags: ["1.0.0"] },
        headers: { link: '</v2/ulsklyc/yuvomi/tags/list?last=1.0.0&n=100>; rel="next"' },
      })
      .mockResolvedValueOnce({ status: 200, data: { tags: ["1.0.1"] }, headers: {} });

    const result = await listGhcrTags("ghcr.io/ulsklyc/yuvomi");

    expect(result).toEqual({ status: "ok", tags: new Set(["1.0.0", "1.0.1"]) });
    expect(mockedGet).toHaveBeenCalledTimes(3); // token + 2 pages
    expect(mockedGet).toHaveBeenNthCalledWith(
      3,
      "https://ghcr.io/v2/ulsklyc/yuvomi/tags/list?last=1.0.0&n=100",
      expect.anything(),
    );
  });

  test("stops paginating once a page comes back empty, even with a next link", async () => {
    // Observed against the live registry: the last page can still carry a
    // "next" link (n=0) — without a stop condition this would loop forever.
    mockToken();
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: { tags: [] },
      headers: { link: '</v2/ulsklyc/yuvomi/tags/list?last=z&n=0>; rel="next"' },
    });

    const result = await listGhcrTags("ghcr.io/ulsklyc/yuvomi");

    expect(result).toEqual({ status: "ok", tags: new Set() });
    expect(mockedGet).toHaveBeenCalledTimes(2); // token + 1 page, no further follow-up
  });

  test("returns registry_error when the tag list request fails", async () => {
    mockToken();
    mockedGet.mockRejectedValueOnce(new Error("ECONNRESET"));

    const result = await listGhcrTags("ghcr.io/ulsklyc/yuvomi");

    expect(result.status).toBe("registry_error");
  });
});
