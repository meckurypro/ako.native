// src/hooks/useEngagementOrder.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

// 'dislike' added — it's now part of the scrollable tray, ranked by usage.
// 'reshare' added — no longer a fixed left-side slot; ranked like everything
// else now that only Like (left) stays fixed.
// 'share' added — was pinned right, unpinned per the "only Like stays
// pinned" change; ranked using the same reactions-table 'share' count
// PostCard's toggleShare already writes on every share tap (see
// handleShare), so this needed no new usage signal, just reading one
// that was already being recorded.
export type SecondaryActionKey =
  | "support"
  | "question"
  | "pushback"
  | "dislike"
  | "gift"
  | "save"
  | "reshare"
  | "share";

const ALL_SECONDARY: SecondaryActionKey[] = [
  "support",
  "question",
  "pushback",
  "dislike",
  "gift",
  "save",
  "reshare",
  "share",
];

/** The only actions that can take one of the two usage-ranked tray slots (Like and Comment are fixed). Support,
 *  Question, Dislike and Gift never show in the tray: they live in "More". */
export const TRAY_CANDIDATES: SecondaryActionKey[] = ["save", "reshare", "share", "pushback"];

/** Tray order for someone with no usage yet. */
export const DEFAULT_TRAY_ORDER: SecondaryActionKey[] = ["reshare", "share", "save", "pushback"];

/** "More" is a fixed list, never reshuffled: Support first, then Question, the rest, Dislike last. */
export const MORE_ORDER: SecondaryActionKey[] = [
  "support",
  "question",
  "pushback",
  "reshare",
  "share",
  "save",
  "gift",
  "dislike",
];

// Tiebreaker for brand-new users (all counts = 0).
const DEFAULT_ORDER: SecondaryActionKey[] = [...DEFAULT_TRAY_ORDER, "support", "question", "gift", "dislike"];

type UsageCounts = Record<SecondaryActionKey, number>;

/**
 * Ranks the secondary post actions by how often the current user
 * has used each one, most-used first. Only TRAY_CANDIDATES are read from
 * this ranking (the two tray slots after the fixed Like and Comment).
 *
 * Usage sources:
 *   support / question / pushback  →  comments.stance authored by this user
 *                                      (legacy "disagree" rows were merged into pushback)
 *   dislike                        →  reactions of type "dislike"
 *   gift                           →  gifts.sender_id
 *   save                           →  bookmarks.user_id
 *   reshare                        →  posts authored by this user with
 *                                      reshared_post_id set (plain reshares
 *                                      and quotes both count as "resharing")
 *   share                          →  reactions of type "share"
 *
 * PostCard places Like and Comment first (fixed), then the top two tray
 * candidates from this ranking. Cached 5 min — usage shifts slowly.
 */
export function useEngagementOrder() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["engagement-order", user?.id],
    queryFn: async (): Promise<SecondaryActionKey[]> => {
      const counts: UsageCounts = {
        support: 0,
        question: 0,
        pushback: 0,
        dislike: 0,
        gift: 0,
        save: 0,
        reshare: 0,
        share: 0,
      };

      const [stanceRes, dislikeRes, giftRes, saveRes, reshareRes, shareRes] = await Promise.all([
        // Support/Question/Pushback are stance-tagged comments.
        supabase
          .from("comments")
          .select("stance")
          .eq("author_id", user!.id)
          .eq("is_deleted", false)
          .not("stance", "is", null),

        supabase
          .from("reactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("type", "dislike"),

        supabase
          .from("gifts")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", user!.id),

        supabase
          .from("bookmarks")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id),

        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", user!.id)
          .not("reshared_post_id", "is", null),

        supabase
          .from("reactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("type", "share"),
      ]);

      if (stanceRes.error) throw stanceRes.error;
      if (dislikeRes.error) throw dislikeRes.error;
      if (giftRes.error) throw giftRes.error;
      if (saveRes.error) throw saveRes.error;
      if (reshareRes.error) throw reshareRes.error;
      if (shareRes.error) throw shareRes.error;

      for (const row of stanceRes.data ?? []) {
        if (row.stance === "support") counts.support++;
        else if (row.stance === "question") counts.question++;
        else if (row.stance === "pushback" || (row.stance as string) === "disagree") counts.pushback++;
      }
      counts.dislike = dislikeRes.count ?? 0;
      counts.gift = giftRes.count ?? 0;
      counts.save = saveRes.count ?? 0;
      counts.reshare = reshareRes.count ?? 0;
      counts.share = shareRes.count ?? 0;

      return [...ALL_SECONDARY].sort((a, b) => {
        const diff = counts[b] - counts[a];
        return diff !== 0 ? diff : DEFAULT_ORDER.indexOf(a) - DEFAULT_ORDER.indexOf(b);
      });
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
