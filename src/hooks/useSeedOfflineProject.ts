// src/hooks/useSeedOfflineProject.ts
//
// Makes a project that was saved with "Download to library" open from ANYWHERE, not only from the Library row.
// The reader screens read their project / chapters / modules / access checks from the query cache; the Library seeds
// that cache from the device copy right before navigating. Any other way in — a restored last screen after the OS
// killed the app, a link, search, a profile — skipped that step, so offline those screens sat on "Loading…" forever.
//
// This runs on the screen itself: immediately when we know we're offline, and after a short wait when we're nominally
// "online" but nothing has come back (weak or dead data). seedOfflineQueries only fills keys that are still EMPTY, so
// a normal online load — which has long since filled them — is never overwritten by the older device copy.
import { useEffect } from "react";

import { seedOfflineQueries } from "@/lib/offlineStore";
import { useAuth } from "./useAuth";
import { useIsOnline } from "./useIsOnline";

/** How long a screen may wait on a network that claims to be up before it falls back to the saved copy. */
const SEED_AFTER_MS = 3500;

export function useSeedOfflineProject(projectId: string | undefined): void {
  const { user } = useAuth();
  const online = useIsOnline();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !projectId) return;
    let cancelled = false;
    const seed = () => {
      if (!cancelled) void seedOfflineQueries(userId, projectId).catch(() => {});
    };
    if (!online) {
      seed();
      return () => {
        cancelled = true;
      };
    }
    const t = setTimeout(seed, SEED_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [userId, projectId, online]);
}
