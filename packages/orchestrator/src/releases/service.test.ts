import { describe, expect, test, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("node:fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
  },
}));

const listGhcrTags = vi.fn();
vi.mock("../docker/ghcrManifest.js", () => ({ listGhcrTags: (...args: unknown[]) => listGhcrTags(...args) }));

const { fetchAndStoreReleases } = await import("./service.js");
const mockedAxiosGet = vi.mocked(axios.get);

function githubRelease(tag: string) {
  return { tag_name: tag, name: tag, published_at: "2026-01-01T00:00:00Z", prerelease: false, draft: false };
}

function ghcrTagSet(...tags: string[]) {
  return { status: "ok" as const, tags: new Set(tags) };
}

describe("fetchAndStoreReleases", () => {
  beforeEach(() => {
    mockedAxiosGet.mockReset();
    listGhcrTags.mockReset();
  });

  test("keeps a tag that exists in GHCR, stripping the git tag's leading v", async () => {
    mockedAxiosGet.mockResolvedValueOnce({ data: [githubRelease("v1.0.0")] });
    // Upstream's docker-publish workflow strips the "v" when tagging the
    // image (docker/metadata-action semver pattern) — GHCR never has a
    // "v1.0.0" tag, only "1.0.0".
    listGhcrTags.mockResolvedValueOnce(ghcrTagSet("1.0.0"));

    const result = await fetchAndStoreReleases();

    expect(result.releases.map((r) => r.tag)).toEqual(["1.0.0"]);
    expect(result.status).toBe("ok");
  });

  test("excludes a release tag with no matching GHCR image", async () => {
    mockedAxiosGet.mockResolvedValueOnce({ data: [githubRelease("v1.0.0"), githubRelease("v2.0.0-nobuild")] });
    listGhcrTags.mockResolvedValueOnce(ghcrTagSet("1.0.0"));

    const result = await fetchAndStoreReleases();

    expect(result.releases.map((r) => r.tag)).toEqual(["1.0.0"]);
    expect(result.status).toBe("ok");
  });

  test("returns an empty list with an explicit status when every tag is missing from GHCR", async () => {
    mockedAxiosGet.mockResolvedValueOnce({ data: [githubRelease("v1.0.0"), githubRelease("v2.0.0")] });
    listGhcrTags.mockResolvedValueOnce(ghcrTagSet("9.9.9-unrelated"));

    const result = await fetchAndStoreReleases();

    expect(result.releases).toEqual([]);
    expect(result.status).toBe("no_published_versions");
  });

  test("paginates through every page of GitHub releases", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => githubRelease(`v1.${i}.0`));
    const page2 = [githubRelease("v2.0.0")];
    mockedAxiosGet.mockResolvedValueOnce({ data: page1 }).mockResolvedValueOnce({ data: page2 });
    listGhcrTags.mockResolvedValueOnce(ghcrTagSet(...page1.map((r) => r.tag_name.slice(1)), "2.0.0"));

    const result = await fetchAndStoreReleases();

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.releases).toHaveLength(101);
  });

  test("does not wipe the release list on a whole-registry GHCR failure", async () => {
    mockedAxiosGet.mockResolvedValueOnce({ data: [githubRelease("v1.0.0")] });
    listGhcrTags.mockResolvedValueOnce({ status: "registry_error", reason: "rate limited" });

    await expect(fetchAndStoreReleases()).rejects.toThrow(/rate limited/);
  });
});
