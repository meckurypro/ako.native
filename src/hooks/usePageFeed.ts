// src/hooks/usePageFeed.ts
//
// Page-mode counterpart to the feed hooks in usePosts.ts. A page is its
// own account with its own topics and its own follow graph — separate
// from whichever team member is currently switched into it — so "For
// You" and "Following" while in page mode should rank by the PAGE's
// interests/network, not the acting human's.
//
// Backend is live: public.page_interests (page_id, interest_id) and
// public.page_follows_target (page_id, followed_profile_id OR
// followed_page_id — a page follows an account or another page, the
// reverse of page_follows) both exist, and get_page_ranked_feed /
// get_page_following_feed RPCs are deployed mirroring get_ranked_feed
// / get_following_feed but keyed to a page rather than a viewer
// profile.
//
// Top Discussions (get_trending_feed) is deliberately NOT duplicated
// here — it's already a global "what's hot this week" ranking with no
// per-viewer personalization, so it stays identical in page mode.
//
// Also deliberately skipped: fulfill_gift_tokens. That's a wallet/gift
// mechanic and wallets belong to profiles only (see public.wallets —
// no page_id column), so pages have no gift tokens to fulfill.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { PostWithAuthor } from "../types/database";
// Reuse the personal feed's select string + normalizer rather than
// keeping a second hand-copied version here — a prior drift between
// the two (this file was missing profile_roles and tagged_project)
// left post.author.roles undefined in page mode, crashing PostCard's
// `post.author.roles.length` check. Importing the real ones means
// page-mode posts are always shaped identically to personal-mode ones.
import { FEED_SELECT, normalizePost } from "./usePosts";

const PAGE_SIZE = 15;

async function fetchByRankedIds(
  rpcName: string,
  pageId: string,
  page: number
): Promise<PostWithAuthor[]> {
  const { data: ranked, error: rankError } = await supabase.rpc(rpcName, {
    p_page_id: pageId,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  if (rankError) throw rankError;

  const orderedIds: string[] = (ranked ?? []).map((r: { post_id: string }) => r.post_id);
  if (orderedIds.length === 0) return [];

  const { data, error } = await supabase.from("posts").select(FEED_SELECT).in("id", orderedIds);
  if (error) throw error;

  const byId = new Map((data as any[]).map((raw) => [raw.id, normalizePost(raw)]));
  return orderedIds.map((id) => byId.get(id)).filter((p): p is PostWithAuthor => !!p);
}

/** Page-mode "For You" — ranked by the page's own topics (page_interests)
 *  and engagement, not the acting team member's. */
export function usePageRankedFeed(pageId: string | undefined, page: number) {
  return useQuery({
    queryKey: ["page-feed-posts", "ranked", pageId, page],
    queryFn: () => fetchByRankedIds("get_page_ranked_feed", pageId!, page),
    enabled: !!pageId,
  });
}

/** Page-mode "Following" — posts from whoever/whatever the PAGE follows
 *  (page_follows_target), not the acting team member's own following list. */
export function usePageFollowingFeed(pageId: string | undefined, page: number) {
  return useQuery({
    queryKey: ["page-feed-posts", "following", pageId, page],
    queryFn: () => fetchByRankedIds("get_page_following_feed", pageId!, page),
    enabled: !!pageId,
  });
}
