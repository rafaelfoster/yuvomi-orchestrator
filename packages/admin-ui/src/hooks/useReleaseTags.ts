import { useEffect, useState } from "react";
import { releasesApi, type ReleaseInfo } from "../api/client";

export const LATEST_TAG = "latest";

/** Fetches the cached Yuvomi release list once per mount; "latest" is always offered alongside it. */
export function useReleaseTags(): { releases: ReleaseInfo[]; loading: boolean } {
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    releasesApi
      .list()
      .then((res) => {
        if (!cancelled) setReleases(res.releases);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { releases, loading };
}
