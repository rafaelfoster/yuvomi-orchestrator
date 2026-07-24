import { promises as fs } from "node:fs";
import path from "node:path";
import axios from "axios";
import pino from "pino";
import { env } from "../config/env.js";
import { listGhcrTags } from "../docker/ghcrManifest.js";

const logger = pino({ name: "releases" });

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
}

// "no_published_versions" is distinct from an empty array on first boot /
// GitHub outage (stale-cache-not-yet-populated): it specifically means every
// GitHub release tag was checked against GHCR and none resolved to a
// pullable image — a real, actionable state for the admin UI to show.
export type ReleasesStatus = "ok" | "no_published_versions";

interface ReleasesCache {
  fetchedAt: string;
  releases: ReleaseInfo[];
  status: ReleasesStatus;
}

interface GithubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
}

let cache: ReleasesCache | null = null;

// Persisted alongside the orchestrator's own SQLite DB (same volume, see
// docker-compose.yml's orchestrator_db mount) so the last known-good
// release list survives restarts even if GitHub is unreachable at boot.
function cacheFilePath(): string {
  return path.resolve(path.dirname(env.ORCHESTRATOR_DB_URL.replace(/^file:/, "")), "releases.json");
}

async function readCacheFile(): Promise<ReleasesCache | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(), "utf8");
    return JSON.parse(raw) as ReleasesCache;
  } catch {
    return null;
  }
}

async function writeCacheFile(data: ReleasesCache): Promise<void> {
  const file = cacheFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// Image repository tenants actually pull (TENANT_DEFAULT_IMAGE minus its
// own tag) — the thing release tags are verified against, kept separate
// from RELEASES_GITHUB_REPO in case the two ever diverge (private mirror,
// renamed image, etc).
function tenantImageRepo(): string {
  return env.TENANT_DEFAULT_IMAGE.split(":")[0];
}

// The upstream repo's docker-publish workflow tags images via
// docker/metadata-action's `type=semver,pattern={{version}}`, which strips
// a leading "v" from the git tag when deriving the image tag — git tag
// "v1.44.4" publishes as GHCR image tag "1.44.4", never "v1.44.4". Compare
// (and later pull) using this normalized form, or every release ever gets
// treated as unpublished.
function normalizeImageTag(tagName: string): string {
  return /^v\d/.test(tagName) ? tagName.slice(1) : tagName;
}

const GITHUB_PER_PAGE = 100;

async function fetchAllGithubReleases(): Promise<GithubRelease[]> {
  const url = `https://api.github.com/repos/${env.RELEASES_GITHUB_REPO}/releases`;
  const all: GithubRelease[] = [];

  for (let page = 1; ; page++) {
    const { data } = await axios.get<GithubRelease[]>(url, {
      timeout: 10_000,
      headers: { Accept: "application/vnd.github+json" },
      params: { per_page: GITHUB_PER_PAGE, page },
    });
    all.push(...data);
    if (data.length < GITHUB_PER_PAGE) break;
  }

  return all;
}

export async function fetchAndStoreReleases(): Promise<ReleasesCache> {
  const data = await fetchAllGithubReleases();

  const candidates: ReleaseInfo[] = data
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: normalizeImageTag(r.tag_name),
      name: r.name || r.tag_name,
      publishedAt: r.published_at ?? "",
      prerelease: r.prerelease,
    }));

  // GitHub Releases and published container images are independent — a
  // release tag with no matching GHCR image would otherwise reach the
  // tenant image picker and only fail at pull time during a tenant update.
  // One bulk tag-list fetch instead of one manifest check per release: this
  // repo alone has hundreds of releases, and per-tag anonymous GHCR calls
  // at that volume risk tripping its rate limit on every poll.
  const image = tenantImageRepo();
  const listResult = await listGhcrTags(image);

  if (listResult.status === "registry_error") {
    // Whole-registry failure (network/auth/rate-limit) is not the same as
    // "no tags are published" — surfacing it as an empty list would nuke a
    // perfectly good cached release list over a transient GHCR blip. Throw
    // instead: the caller (cron / initial fetch) logs it and the previous
    // cache keeps serving, same as an outright GitHub API failure already
    // does here.
    throw new Error(`GHCR tag list fetch failed: ${listResult.reason}`);
  }

  const published = listResult.tags;
  const releases = candidates.filter((release) => published.has(release.tag));
  const dropped = candidates.filter((release) => !published.has(release.tag));

  for (const release of dropped) {
    logger.info({ tag: release.tag, reason: "no_matching_ghcr_tag" }, "dropped release tag: no matching GHCR image");
  }

  const status: ReleasesStatus = releases.length === 0 ? "no_published_versions" : "ok";
  const next: ReleasesCache = { fetchedAt: new Date().toISOString(), releases, status };
  cache = next;
  await writeCacheFile(next);
  logger.info({ count: releases.length, dropped: dropped.length, status }, "fetched yuvomi releases from GitHub");
  return next;
}

export async function getCachedReleases(): Promise<ReleasesCache> {
  if (cache) return cache;
  const fromDisk = await readCacheFile();
  if (fromDisk) {
    // Back-compat: cache files written before the `status` field existed.
    fromDisk.status ??= fromDisk.releases.length === 0 ? "no_published_versions" : "ok";
    cache = fromDisk;
    return fromDisk;
  }
  return fetchAndStoreReleases();
}
