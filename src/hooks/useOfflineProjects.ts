// src/hooks/useOfflineProjects.ts
// React side of "Download to library" (the engine is lib/offlineStore.ts).
import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";

import { useLibrary, type LibraryItem } from "@/hooks/useLibrary";
import {
  OFFLINE_ENTRIES_KEY,
  cancelOfflineDownload,
  clearDownloadState,
  fetchRemoteVersions,
  listOfflineEntries,
  readOfflineContent,
  reconcileOfflineRecords,
  removeOfflineProject,
  seedOfflineQueries,
  startOfflineDownload,
  sweepOfflineOrphans,
  useDownloadState,
  type AcquiredVia,
  type OfflineEntry,
} from "@/lib/offlineStore";
import { isStaleVersion, mergeLibraryWithDownloads, offlineReaderRoute, openModeFor } from "@/lib/offlineProjects";
import { onlineManager } from "@/lib/queryClient";
import { useAuth } from "./useAuth";

/** Everything this account has saved on this device. Reads local storage only, so it works with no network. */
export function useOfflineEntries() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [OFFLINE_ENTRIES_KEY, user?.id],
    queryFn: () => listOfflineEntries(user!.id),
    enabled: !!user,
    networkMode: "always", // a local read: must run offline (React Query would otherwise pause it)
    staleTime: Infinity,
  });
}

/** One project's saved copy (if any) plus the actions the UI needs. */
export function useOfflineDownload(projectId: string, acquiredVia: AcquiredVia) {
  const { user } = useAuth();
  const entries = useOfflineEntries();
  const state = useDownloadState(projectId);
  const entry = useMemo(() => entries.data?.find((e) => e.projectId === projectId), [entries.data, projectId]);

  const start = useCallback(
    (confirmedCellular = false) => {
      if (!user) return Promise.reject(new Error("sign_in_required"));
      return startOfflineDownload({ userId: user.id, projectId, acquiredVia, confirmedCellular });
    },
    [user, projectId, acquiredVia]
  );
  const cancel = useCallback(() => cancelOfflineDownload(projectId), [projectId]);
  const dismissError = useCallback(() => clearDownloadState(projectId), [projectId]);
  const remove = useCallback(() => (user ? removeOfflineProject(user.id, projectId) : Promise.resolve()), [user, projectId]);

  return {
    entry,
    isSaved: !!entry,
    state,
    isBusy: state.phase === "preparing" || state.phase === "downloading" || state.phase === "saving",
    start,
    cancel,
    dismissError,
    remove,
  };
}

/**
 * Library housekeeping that needs a connection: tell the server what's on this device, and find out which saved
 * copies have newer content. Returns the set of project ids with an update available. Offline it does nothing and
 * returns an empty set — "we can't tell" is never shown as "out of date".
 */
export function useOfflineSync(entries: OfflineEntry[] | undefined) {
  const { user } = useAuth();
  const userId = user?.id;
  const ids = useMemo(() => (entries ?? []).map((e) => e.projectId).sort(), [entries]);

  useEffect(() => {
    if (!userId) return;
    void sweepOfflineOrphans(userId);
    if (onlineManager.isOnline()) void reconcileOfflineRecords(userId);
    // Re-run when the saved set changes (a new download is recorded on the server, a removal is deleted there).
  }, [userId, ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const remote = useQuery({
    queryKey: ["offline-remote-versions", userId, ids.join(",")],
    queryFn: () => fetchRemoteVersions(ids),
    enabled: !!userId && ids.length > 0, // paused (not failed) while offline
    staleTime: 60_000,
  });

  return useMemo(() => {
    const stale = new Set<string>();
    for (const e of entries ?? []) if (isStaleVersion(e.version, remote.data?.get(e.projectId))) stale.add(e.projectId);
    return stale;
  }, [entries, remote.data]);
}

/** Opens a saved project from the Library: its normal screen (text projects) or straight from the device (files). */
export function useOpenOfflineProject() {
  const { user } = useAuth();
  return useCallback(
    async (entry: Pick<OfflineEntry, "projectId" | "projectType" | "files">) => {
      if (openModeFor({ hasFiles: entry.files.length > 0 }) === "viewer") {
        router.push(`/projects/${entry.projectId}/offline` as Href);
        return;
      }
      // Make the screen's own queries find the saved copy, so it opens instantly and works with no network.
      let source: string | undefined;
      if (user) {
        const saved = await readOfflineContent(user.id, entry.projectId);
        source = typeof saved?.details?.content_source === "string" ? saved.details.content_source : undefined;
        await seedOfflineQueries(user.id, entry.projectId);
      }
      router.push(offlineReaderRoute(entry.projectType, entry.projectId, source) as Href);
    },
    [user]
  );
}

/**
 * The Library list, with what's saved on this device folded in. Offline, the server's list never arrives, so the
 * saved copies ARE the list. `byId` gives each row its saved copy (size, files); `stale` marks ones with newer content.
 */
export function useLibraryWithDownloads() {
  const library = useLibrary();
  const entries = useOfflineEntries();
  const stale = useOfflineSync(entries.data);

  const items = useMemo(() => mergeLibraryWithDownloads<LibraryItem>(library.data, entries.data), [library.data, entries.data]);
  const byId = useMemo(() => new Map((entries.data ?? []).map((e) => [e.projectId, e])), [entries.data]);
  const totalBytes = useMemo(() => (entries.data ?? []).reduce((n, e) => n + e.bytes, 0), [entries.data]);

  return {
    items,
    byId,
    stale,
    savedCount: entries.data?.length ?? 0,
    totalBytes,
    // "Loading" only while there is truly nothing to show yet; a paused (offline) query isn't loading.
    isLoading: (library.isLoading || entries.isLoading) && items.length === 0,
  };
}
