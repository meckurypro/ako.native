// src/hooks/useFeedAccess.ts
//
// Progressive Access: how an account EARNS the Feed. The database does the work (see
// supabase/ako_progressive_feed_access.sql in the web repo) — pathways are rows in
// feed_access_rules, evaluated server-side by evaluate_feed_access(). This is the client view:
// the signed-in user's progress per pathway. Reading it also triggers evaluation, so reaching a
// threshold unlocks the account the next time they look. Pathways are edited in the web admin.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface FeedCondition {
  metric: string;
  label: string;
  op: string;
  current: number;
  required: number;
  met: boolean;
}

export interface FeedPathwayState {
  key: string;
  name: string;
  description: string | null;
  pathway: string;
  logic: "AND" | "OR";
  met: boolean;
  /** 0..1 — AND uses the weakest condition, OR the best one. */
  progress: number;
  conditions: FeedCondition[];
}

export interface FeedAccessStatus {
  gate_enabled: boolean;
  progressive_enabled: boolean;
  account_status: string;
  has_feed_access: boolean;
  /** 'manual' | 'rule:<key>' | null */
  unlocked_by: string | null;
  unlocked_at: string | null;
  auto_unlock_blocked: boolean;
  eligible_rule: string | null;
  rules: FeedPathwayState[];
}

export const PATHWAY_LABELS: Record<string, string> = {
  writer: "Writers",
  resource: "Resources",
  course: "Courses",
  organiser: "Events & meetings",
  artist: "Artists & talent",
  community: "Community",
  other: "Other",
};

/** The pathway the user is closest to finishing. */
export function closestPathway(rules: FeedPathwayState[]): FeedPathwayState | null {
  if (rules.length === 0) return null;
  return [...rules].sort((a, b) => b.progress - a.progress)[0];
}

export function useMyFeedAccess(opts: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["my-feed-access", user?.id],
    queryFn: async (): Promise<FeedAccessStatus> => {
      // refresh_* evaluates first, so a met pathway unlocks the account right here.
      const { data, error } = await supabase.rpc("refresh_my_feed_access");
      if (error) throw error;
      return data as FeedAccessStatus;
    },
    enabled: !!user && (opts.enabled ?? true),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // The moment the account flips to approved, re-read the access gate so the Feed appears.
  const hasAccess = query.data?.has_feed_access;
  const unlockedBy = query.data?.unlocked_by;
  useEffect(() => {
    if (hasAccess && unlockedBy) {
      queryClient.invalidateQueries({ queryKey: ["account-access"] });
    }
  }, [hasAccess, unlockedBy, queryClient]);

  return query;
}
