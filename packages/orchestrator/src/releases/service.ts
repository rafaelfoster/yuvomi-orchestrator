import { promises as fs } from "node:fs";
import path from "node:path";
import axios from "axios";
import pino from "pino";
import { env } from "../config/env.js";

const logger = pino({ name: "releases" });

export interface ReleaseInfo {
  tag: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
}

interface ReleasesCache {
  fetchedAt: string;
  releases: ReleaseInfo[];
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

export async function fetchAndStoreReleases(): Promise<ReleasesCache> {
  const url = `https://api.github.com/repos/${env.RELEASES_GITHUB_REPO}/releases`;
  const { data } = await axios.get<GithubRelease[]>(url, {
    timeout: 10_000,
    headers: { Accept: "application/vnd.github+json" },
  });

  const releases: ReleaseInfo[] = data
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      publishedAt: r.published_at ?? "",
      prerelease: r.prerelease,
    }));

  const next: ReleasesCache = { fetchedAt: new Date().toISOString(), releases };
  cache = next;
  await writeCacheFile(next);
  logger.info({ count: releases.length }, "fetched yuvomi releases from GitHub");
  return next;
}

export async function getCachedReleases(): Promise<ReleasesCache> {
  if (cache) return cache;
  const fromDisk = await readCacheFile();
  if (fromDisk) {
    cache = fromDisk;
    return fromDisk;
  }
  return fetchAndStoreReleases();
}
