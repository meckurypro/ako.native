// src/hooks/useFeedDoorway.ts
//
// Frequency policy for the soft Feed discovery doorway (see
// 04_AKO_SOFT_FEED_DISCOVERY_AND_CROSS_SURFACE_INVITATIONS.md). This
// is purely presentational — it decides whether *this* render should
// show an invitation, never anything about Project access, purchases,
// or the Feed itself. If it fails or is unavailable for any reason,
// the calling page's primary content is completely unaffected; the
// doorway just doesn't render.
//
// State lives in sessionStorage, not the database and not
// localStorage: per the spec ("Session-Level State"), this is
// purely-presentational frequency management with no product need to
// persist across devices or across days, so the simplest thing that
// works is a plain per-tab session — closing the tab and coming back
// later naturally resets it, which is exactly the "new session can
// invite again" behavior the spec asks for.
import { useEffect, useState } from "react";
import { useFeatureFlag } from "./useFeatureFlags";
import type { FeedDoorwayContextKey } from "../lib/feedDoorwayCopy";

const SHOWN_KEY = "ako_feed_doorway_shown";
const ENTERED_KEY = "ako_feed_doorway_entered_feed";

// Small and fixed rather than derived from analytics we don't have
// yet — see the spec's own caution against inventing precise
// thresholds. Comfortably below "every completion", which is the
// failure mode this guards against.
const MAX_INVITATIONS_PER_SESSION = 2;

function readShownContexts(): FeedDoorwayContextKey[] {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    return raw ? (JSON.parse(raw) as FeedDoorwayContextKey[]) : [];
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — treat as
    // "nothing shown yet" rather than breaking the host page.
    return [];
  }
}

function hasEnteredFeedThisSession(): boolean {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Decides whether a Feed doorway should render for a given context on
 * this page, and hands back the one function a call site needs to
 * record that the user actually followed it into the Feed.
 *
 * Does NOT decide copy, layout, or navigation target — see
 * FeedDoorway.tsx for the component that renders once this says yes.
 */
export function useFeedDoorway(context: FeedDoorwayContextKey) {
  // Every flag in useFeatureFlags.ts is an off-switch on something
  // already live, defaulting to enabled — this one is no different:
  // a missing row (nobody has seeded feed_invitations_enabled yet)
  // means "show it", not "hide it".
  const enabled = useFeatureFlag("feed_invitations_enabled");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (hasEnteredFeedThisSession()) {
      // Already took the door once this session — no redundant
      // second knock (spec: "avoid repeatedly prompting after the
      // user has already entered Feed").
      setVisible(false);
      return;
    }
    const shown = readShownContexts();
    if (shown.includes(context)) {
      // Same context already shown this session (e.g. this exact
      // page revisited) — don't repeat identical copy at the user.
      setVisible(false);
      return;
    }
    if (shown.length >= MAX_INVITATIONS_PER_SESSION) {
      setVisible(false);
      return;
    }

    setVisible(true);
    try {
      sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown, context]));
    } catch {
      // Non-fatal — worst case the frequency cap under-counts for
      // this session, never over-counts into blocking the doorway.
    }
    // Only re-evaluate on genuine context/enablement changes, not on
    // every re-render of the host page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, context]);

  function markEnteredFeed() {
    try {
      sessionStorage.setItem(ENTERED_KEY, "1");
    } catch {
      // Non-fatal.
    }
  }

  return { visible, markEnteredFeed };
}
