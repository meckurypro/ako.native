// src/hooks/useReturnAfterSave.ts
// The one way every "save / publish, then leave" screen exits.
//
// After a successful write the person should land back on the screen they came from, showing what they just
// changed — not on the editor they just finished with, and not on a cached copy of the old data.
//
//  1. Every cached query is marked stale, so whichever screen we land on refetches instead of trusting what it
//     cached before the edit (a project's status shows in lists, feeds, embeds and search — not just its own
//     screen). Mutation hooks still await a refetch of the keys they know about *before* resolving, so the
//     screen underneath (the native stack keeps it mounted) is already fresh when it slides back into view;
//     this is the safety net for everything else.
//  2. Navigation is ordinary back navigation, so the stack stays tidy — the editor isn't left behind the back
//     gesture. With nothing to go back to (cold start, deep link) we land on `fallback` instead of exiting.
import { useQueryClient } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useCallback } from "react";

interface ReturnOptions {
  /** Where to land when there's no screen to go back to. */
  fallback?: string;
  /**
   * Replace the editor with this screen instead of going back. For saves that change the URL the previous
   * screen lives at — e.g. a new username turns /profile/old into a dead link.
   */
  replaceWith?: string;
  /**
   * Always land on this screen, whatever opened the editor: if it is already in the stack (e.g. the Feed, which is
   * the stack's root) everything above it is dismissed. For saves whose result lives in a known place - a new post
   * belongs on the Feed, not on the Notifications screen whose "+" button happened to open Compose.
   */
  landOn?: string;
}

export function useReturnAfterSave() {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ fallback = "/feed", replaceWith, landOn }: ReturnOptions = {}) => {
      // refetchType "none": mark stale only — refetching here would hit every query still mounted on the editor.
      await queryClient.invalidateQueries({ refetchType: "none" });

      if (landOn) {
        router.dismissTo(landOn as Href);
        return;
      }
      if (replaceWith) {
        router.replace(replaceWith as Href);
        return;
      }
      if (router.canGoBack()) {
        router.back();
        return;
      }
      router.replace(fallback as Href);
    },
    [queryClient]
  );
}
