import axios, { type AxiosResponse } from "axios";
import pino from "pino";

const logger = pino({ name: "ghcrManifest" });

export type ManifestCheckResult =
  | { status: "exists" }
  | { status: "not_found" }
  | { status: "registry_error"; reason: string };

// Every manifest media type a modern GHCR-hosted image could plausibly use —
// a bare Accept: application/json (or no manifest Accept at all) can get
// silently redirected to an HTML error page rather than a clean 404.
const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/**
 * GHCR's anonymous pull token for a public package — required by the OCI
 * distribution spec even when no credentials are involved. Requesting it
 * fresh per check (rather than caching) keeps this dead simple; call volume
 * here is low (once per release tag, on a 30-minute poll cron).
 */
async function getAnonymousPullToken(repository: string): Promise<string> {
  const { data } = await axios.get<{ token: string }>("https://ghcr.io/token", {
    params: { scope: `repository:${repository}:pull`, service: "ghcr.io" },
    timeout: 10_000,
  });
  return data.token;
}

export type ListTagsResult = { status: "ok"; tags: Set<string> } | { status: "registry_error"; reason: string };

/**
 * Lists every tag actually published for `<image>` on GHCR in one shot (plus
 * pagination follow-ups per the `Link: <...>; rel="next"` header) — used to
 * bulk-filter a whole release list against GHCR with 1-2 requests total
 * instead of one round-trip per tag, which matters here: this repo has
 * hundreds of GitHub releases, and hammering GHCR's anonymous endpoint that
 * hard on every 30-minute poll risks tripping its rate limit.
 */
export async function listGhcrTags(image: string): Promise<ListTagsResult> {
  const repository = image.replace(/^ghcr\.io\//, "");

  try {
    const token = await getAnonymousPullToken(repository);
    const tags = new Set<string>();
    let url: string | undefined = `https://ghcr.io/v2/${repository}/tags/list`;

    while (url) {
      const currentUrl: string = url;
      const response: AxiosResponse<{ tags: string[] | null }> = await axios.get(currentUrl, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
        validateStatus: () => true,
      });

      if (response.status !== 200) {
        return { status: "registry_error", reason: `unexpected GHCR response: HTTP ${response.status}` };
      }

      const pageTags = response.data.tags ?? [];
      for (const tag of pageTags) tags.add(tag);

      const link = response.headers.link as string | undefined;
      const next = link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
      // GHCR's Link header is host-relative ("/v2/repo/tags/list?..."), not
      // absolute — feeding that straight to axios throws ERR_INVALID_URL.
      // Also stop once a page comes back empty: GHCR has been observed to
      // still hand back a "next" link with n=0 on the final page, which
      // would otherwise loop forever re-requesting the same empty page.
      url = next && pageTags.length > 0 ? new URL(next, "https://ghcr.io").toString() : undefined;
    }

    return { status: "ok", tags };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ image, reason }, "GHCR tag list fetch failed");
    return { status: "registry_error", reason };
  }
}

/**
 * Checks whether `<image>:<tag>` actually exists as a pullable manifest on
 * GHCR — GitHub Releases and published container images are independent;
 * a release tag with no matching image build would otherwise reach the
 * tenant image picker and fail the pull at tenant-update time instead of
 * being filtered out up front. Only supports ghcr.io-hosted images (the
 * only registry this orchestrator ever configures tenants against).
 */
export async function checkImageTagExists(image: string, tag: string): Promise<ManifestCheckResult> {
  const repository = image.replace(/^ghcr\.io\//, "");

  try {
    const token = await getAnonymousPullToken(repository);
    const response = await axios.get(`https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(tag)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT },
      timeout: 10_000,
      validateStatus: () => true,
    });

    if (response.status === 200) return { status: "exists" };
    if (response.status === 404) return { status: "not_found" };

    return {
      status: "registry_error",
      reason: `unexpected GHCR response: HTTP ${response.status}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn({ image, tag, reason }, "GHCR manifest check failed");
    return { status: "registry_error", reason };
  }
}
