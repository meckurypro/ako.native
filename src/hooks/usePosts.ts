// src/hooks/usePosts.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { resolveFunctionErrorMessage } from "../lib/functionErrors";
import { useAuth } from "./useAuth";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import { PAGE_SELECT } from "../lib/postSelects";
import type { PostWithAuthor, RepostSource } from "../types/database";
import { DEBUG_DISABLE_PER_CARD_QUERIES } from "../lib/debugFlags";

const PAGE_SIZE = 15;
export const POST_EDIT_WINDOW_MS = 15 * 60 * 1000;


const AUTHOR_SELECT = `id, username, display_name, avatar_url, tier, is_private, is_verified, ${PROFILE_ROLES_SELECT}`;
// Joined alongside author on every post select — null on the vast
// majority of rows (personal posts), populated only when the post was
// published in Page mode. PostCard should prefer this over `author`
// for byline/avatar whenever it's non-null.
// Item 10 — the tagged project's card-preview fields only (not `*`):
// this rides along on every single post fetch in the feed, so keeping
// it to what TaggedProjectEmbed.tsx actually renders (thumbnail,
// title, type, price, status, owner byline) matters for payload size
// on a feed page of 15 posts.
const TAGGED_PROJECT_SELECT = `tagged_project:projects!posts_tagged_project_id_fkey(id, title, thumbnail_url, project_type, price_usd, promo_price_usd, status, slug, owner:profiles!projects_owner_id_fkey(username, display_name), posted_as_page:pages(username))`;

// One level deep: the embedded reshared_post carries its own author but
// not a further-nested reshared_post, so repost-of-a-repost links to the
// immediate parent rather than recursing indefinitely.
export const FEED_SELECT = `*, author:profiles!posts_author_id_fkey(${AUTHOR_SELECT}), ${PAGE_SELECT}, ${TAGGED_PROJECT_SELECT}, reshared_post(*, author:profiles!posts_author_id_fkey(${AUTHOR_SELECT}))`;

export function canEditPost(post: Pick<PostWithAuthor, "created_at">): boolean {
  return Date.now() - new Date(post.created_at).getTime() <= POST_EDIT_WINDOW_MS;
}

function normalizeAuthor(raw: any) {
  return raw ? { ...raw, roles: toProfileRoles(raw.profile_roles) } : raw;
}

/** Normalises the raw Supabase shape → PostWithAuthor (flattens profile_roles → roles). */
export function normalizePost(raw: any): PostWithAuthor {
  if (!raw) throw new Error("No post data to normalize.");
  const reshared_post: RepostSource | null | undefined = raw.reshared_post
    ? { ...raw.reshared_post, author: normalizeAuthor(raw.reshared_post.author) }
    : raw.reshared_post;

  return {
    ...raw,
    author: normalizeAuthor(raw.author),
    reshared_post,
  };
}

interface CreatePostInput {
  heading?: string;
  // Named palette key for the heading — see src/lib/headingColors.ts.
  // Omit (or send null) for the default heading color.
  heading_color?: string | null;
  content: string;
  category_id?: string;
  interest_ids?: string[];
  media_urls?: string[];
  // Present when posting in Page mode — routes through create-page-post
  // instead of create-post, and attributes the post to the page. See
  // useActiveIdentity in hooks/usePages.ts for where this comes from.
  posted_as_page_id?: string;
  // Item 10 — the id of a project being tagged into this post. See
  // sql/30_post_project_tag.sql: the create-post / create-page-post
  // edge functions need to start persisting this field, same as they
  // already persist media_urls/category_id — not something this repo
  // can change directly.
  tagged_project_id?: string;
  // Optional soundtrack — see src/components/music/AddMusicSheet.tsx.
  music_catalogue_id?: string;
  // Defaults to "published" server-side when omitted — only send this
  // for a draft or scheduled save. See
  // supabase-fixes/add_post_drafts_and_scheduling.sql: requires that
  // migration AND the corresponding create-post edge function change
  // to actually take effect; the request shape here is ready for it,
  // but the insert itself is out of this repo's reach until then.
  status?: "draft" | "scheduled" | "published";
  // Required iff status === "scheduled".
  scheduled_for?: string;
}

/**
 * The personalized "For You" ranking — calls get_ranked_feed (see
 * feed_algorithm_ranking_function.sql) which blends following,
 * topic relevance, social relevance, and Prioritize/gift-token
 * substitution into a single scored order, then fetches the full
 * rows for the returned ids (RPC only returns post_id + score,
 * .in() doesn't preserve order so it's re-sorted client-side to
 * match). Once the page renders, fulfill_gift_tokens is fired to
 * consume any gift tokens whose prioritized post was just served —
 * a separate call, not baked into the (read-only/STABLE) ranking
 * function itself.
 */
function useRankedFeed(page: number, enabled: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["feed-posts", "ranked", user?.id, page],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (!user) return [];

      const { data: ranked, error: rankError } = await supabase.rpc("get_ranked_feed", {
        p_viewer_id: user.id,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (rankError) throw rankError;

      // supabase.rpc() isn't given a type param, so `ranked` (and thus
      // anything derived from it with .map/.filter) comes back as `any`
      // unless pinned down explicitly — hence the annotation here.
      const orderedIds: string[] = (ranked ?? []).map((r: { post_id: string }) => r.post_id);
      if (orderedIds.length === 0) return [];

      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .in("id", orderedIds);
      if (error) throw error;

      const byId = new Map((data as any[]).map((raw) => [raw.id, normalizePost(raw)]));
      const posts = orderedIds.map((id) => byId.get(id)).filter((p): p is PostWithAuthor => !!p);

      // Fire-and-forget — a failed token fulfillment shouldn't block
      // the feed from rendering, just means a token stays unconsumed
      // until the next page load that includes the same prioritized post.
      supabase.rpc("fulfill_gift_tokens", {
        p_viewer_id: user.id,
        p_served_post_ids: orderedIds,
      }).then(({ error: fulfillError }) => {
        if (fulfillError) console.error("fulfill_gift_tokens failed:", fulfillError);
      });

      return posts;
    },
    enabled: enabled && !!user,
  });
}

/**
 * Explicit topic browsing (tapping a topic pill in Discover) stays
 * plain reverse-chronological within that topic — a deliberate "show
 * me everything tagged X" mode, distinct from the personalized ranked
 * feed used when no topic filter is active.
 */
function useTopicFeed(interestId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["feed-posts", "topic", interestId, page],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data: postIds } = await supabase
        .from("post_topics")
        .select("post_id")
        .eq("interest_id", interestId);

      const ids = (postIds ?? []).map((p) => p.post_id);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .in("id", ids)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      return (data as any[]).map(normalizePost);
    },
    enabled,
  });
}

export function useFeedPosts(interestId?: string, page = 0) {
  const ranked = useRankedFeed(page, !interestId);
  const topic = useTopicFeed(interestId ?? "", page, !!interestId);
  return interestId ? topic : ranked;
}

export function useFollowingFeed(page = 0) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["feed-posts", "following", user?.id, page],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (!user) return [];

      const { data: ranked, error: rankError } = await supabase.rpc("get_following_feed", {
        p_viewer_id: user.id,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (rankError) throw rankError;

      const orderedIds: string[] = (ranked ?? []).map((r: { post_id: string }) => r.post_id);
      if (orderedIds.length === 0) return [];

      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .in("id", orderedIds);
      if (error) throw error;

      const byId = new Map((data as any[]).map((raw) => [raw.id, normalizePost(raw)]));

      supabase.rpc("fulfill_gift_tokens", {
        p_viewer_id: user.id,
        p_served_post_ids: orderedIds,
      }).then(({ error: fulfillError }) => {
        if (fulfillError) console.error("fulfill_gift_tokens failed:", fulfillError);
      });

      return orderedIds.map((id) => byId.get(id)).filter((p): p is PostWithAuthor => !!p);
    },
    enabled: !!user,
  });
}

export function useTopDiscussionsFeed(page = 0) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["feed-posts", "top", user?.id, page],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (!user) return [];

      const { data: ranked, error: rankError } = await supabase.rpc("get_trending_feed", {
        p_viewer_id: user.id,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (rankError) throw rankError;

      const orderedIds: string[] = (ranked ?? []).map((r: { post_id: string }) => r.post_id);
      if (orderedIds.length === 0) return [];

      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .in("id", orderedIds);
      if (error) throw error;

      const byId = new Map((data as any[]).map((raw) => [raw.id, normalizePost(raw)]));
      return orderedIds.map((id) => byId.get(id)).filter((p): p is PostWithAuthor => !!p);
    },
    enabled: !!user,
  });
}

/**
 * A page's own visitor feed — "cumulative activity of everyone
 * managing it" is just every post posted_as_page_id = this page,
 * regardless of which admin actually posted it.
 */
export function usePagePosts(pageId: string, page = 0) {
  return useQuery({
    queryKey: ["page-posts", pageId, page],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("posted_as_page_id", pageId)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return (data as any[]).map(normalizePost);
    },
    enabled: !!pageId,
  });
}

/**
 * A single post by id, in the same fully-joined shape as the feed
 * queries (author, posted_as_page, tagged_project, reshared_post) —
 * a distinct query key from PostDetail.tsx's own local `usePost`
 * (["post", id]), which only joins `author`. Sharing that key would
 * mean whichever query happened to populate the cache first "wins"
 * the shape for both call sites, even though the two select different
 * columns — not worth the entanglement for what's otherwise an
 * unrelated read. Currently used by Feed.tsx to pin a just-published
 * post at the top of the "For You" list the instant it lands there
 * (see justPostedId) — the ranked feed itself has no reason to
 * surface a brand-new, zero-engagement post anywhere near the top
 * (see get_ranked_feed: a fresh post scores 0 until it has
 * engagement), so that placement is done here client-side rather than
 * by waiting on the ranking algorithm to do it.
 */
export function usePostById(postId: string | null) {
  return useQuery({
    queryKey: ["post-full", postId],
    queryFn: async (): Promise<PostWithAuthor> => {
      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("id", postId)
        .single();
      if (error) throw error;
      return normalizePost(data);
    },
    enabled: !!postId,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: CreatePostInput) => {
      const { posted_as_page_id, ...rest } = input;

      // Page-mode posts go through a separate function (different
      // author-vs-page attribution + admin check) — see create-page-post.
      const { data, error } = posted_as_page_id
        ? await supabase.functions.invoke("create-page-post", {
            body: { ...rest, page_id: posted_as_page_id },
          })
        : await supabase.functions.invoke("create-post", { body: rest });

      // See resolveFunctionErrorMessage — without this, a moderation
      // rejection (e.g. the code-based word-filter's block message)
      // never reaches the composer: supabase-js discards create-post's
      // actual { error: "..." } body on a non-2xx response and only
      // gives back a generic "Edge Function returned a non-2xx status
      // code", so the toast/inline error the user sees would be that
      // instead of the real reason their post was blocked.
      if (error) throw new Error(await resolveFunctionErrorMessage(error, "Couldn't post this."));
      if (data?.error) throw new Error(data.error);
      return data.post;
    },
    onSuccess: (_post, variables) => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      if (variables.posted_as_page_id) {
        queryClient.invalidateQueries({ queryKey: ["page-posts", variables.posted_as_page_id] });
      }
      if (variables.status === "draft") {
        queryClient.invalidateQueries({ queryKey: ["my-draft-posts"] });
      } else if (variables.status === "scheduled") {
        queryClient.invalidateQueries({ queryKey: ["my-scheduled-posts"] });
      }
    },
  });
}

/**
 * Requires supabase-fixes/add_post_drafts_and_scheduling.sql to be
 * applied — posts.status doesn't exist until then, and this query
 * will 400 against the live schema in the meantime. Written ahead of
 * that migration so the Activity "Drafts" row (see Activity.tsx) has
 * real data the moment it lands, instead of needing a second pass.
 */
export function useMyDraftPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-draft-posts", user?.id],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("author_id", user!.id)
        .eq("status", "draft")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizePost);
    },
    enabled: !!user,
  });
}

/** See useMyDraftPosts above — same migration dependency. */
export function useMyScheduledPosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-scheduled-posts", user?.id],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("author_id", user!.id)
        .eq("status", "scheduled")
        .eq("is_deleted", false)
        .order("scheduled_for", { ascending: true })
        .returns<any[]>();
      if (error) throw error;
      return (data ?? []).map(normalizePost);
    },
    enabled: !!user,
  });
}

/** Deletes a draft or scheduled post outright — "discard", not
 *  "archive"; drafts/scheduled posts were never published, so there's
 *  nothing for a soft-delete/is_deleted flag to hide from anyone
 *  else's view the way it matters for a real published post. */
export function useDeleteDraftOrScheduledPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-draft-posts"] });
      queryClient.invalidateQueries({ queryKey: ["my-scheduled-posts"] });
    },
  });
}

interface ReshareInput {
  originalPostId: string;
  /** Empty/omitted → plain reshare. Non-empty → quote. */
  caption?: string;
}

/**
 * Creates a reshare or quote (same row shape, distinguished by whether
 * `caption` is empty — see isPlainReshare/isQuote in types/database.ts).
 *
 * Routed through the create-reshare edge function — NOT a direct
 * `.from("posts").insert(...)` like this used to be. That was the one
 * spot in the whole app that wrote to `posts` straight from the client:
 * every other post-creation path (create-post, create-page-post,
 * create-comment) goes through an edge function, and it's what actually
 * broke Repost/Quote — RLS on `posts` only allows inserts via those
 * service-role functions (which also run moderation on the content),
 * so the direct client insert was rejected outright. See
 * supabase/functions/create-reshare for the function itself; it also
 * now owns the double-reshare guard and the moderation pass on the
 * caption, matching create-post's shape instead of skipping both.
 *
 * Personal-mode only for now — resharing/quoting as a page isn't wired
 * up (create-page-post only handles fresh posts, not reshared_post_id).
 */
export function useCreateReshare() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ originalPostId, caption }: ReshareInput) => {
      const { data, error } = await supabase.functions.invoke("create-reshare", {
        body: { originalPostId, caption: caption?.trim() ?? "" },
      });
      if (error) {
        // supabase-js only gives a generic "Edge Function returned a
        // non-2xx status code" for FunctionsHttpError by default — the
        // function's actual error body (what create-post's equivalent
        // failures normally show the user) is on error.context, the
        // raw Response. Falling back to error.message keeps this safe
        // if the body isn't JSON or doesn't have the shape we expect.
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            throw new Error(typeof body?.error === "string" ? body.error : error.message);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== error.message) throw parseError;
            throw error;
          }
        }
        throw error;
      }
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Couldn't repost this.");
      // A 2xx response with no post body means something upstream of
      // this function's own error handling went wrong (e.g. the insert
      // silently returned nothing) — surface that plainly instead of
      // letting normalizePost below throw a raw "Cannot read properties
      // of undefined" at the caller.
      if (!data?.post) throw new Error("Couldn't repost this — the server didn't return the new post.");
      return normalizePost(data.post);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["has-reshared", variables.originalPostId] });
    },
  });
}

/** Whether the current user has already reshared/quoted the given post — used
 * to hide the Reshare button (you can only reshare a given post once). */
export function useHasReshared(postId: string, enabled: boolean = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["has-reshared", postId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("posts")
        .select("id")
        .eq("author_id", user.id)
        .eq("reshared_post_id", postId)
        .eq("is_deleted", false)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && enabled && !DEBUG_DISABLE_PER_CARD_QUERIES,
  });
}

/** Total distinct viewers of a post, from the same post_views rows
 * useMarkPostSeen writes to (one row per user, author's own views excluded
 * at write-time). Only fetched when `enabled` — call sites pass their
 * showStats flag so feed cards, which never show this, skip the query. */
export function usePostViewCount(postId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["post-view-count", postId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("post_views")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!postId && enabled,
    staleTime: 60 * 1000,
  });
}

interface UpdatePostInput {
  post_id: string;
  heading?: string;
  // Named palette key for the heading — see src/lib/headingColors.ts.
  // Always applied together with `heading` — see update-post's header.
  heading_color?: string | null;
  content: string;
  category_id?: string | null;
  media_urls?: string[];
  // Omit to leave topics untouched; pass an array (including empty,
  // to clear them all) to replace the full set — see update-post.
  interest_ids?: string[];
}

export function useUpdatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: UpdatePostInput) => {
      const { data, error } = await supabase.functions.invoke("update-post", {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.post;
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", post.id] });
      queryClient.invalidateQueries({ queryKey: ["post-topics", post.id] });
    },
  });
}

// A post's currently-attached topics (interests) — same shape and
// purpose as useProjectTopics, used to prefill TopicPicker when
// editing a post that already has some set.
export function usePostTopics(postId: string | undefined) {
  return useQuery({
    queryKey: ["post-topics", postId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("post_topics")
        .select("interest_id")
        .eq("post_id", postId);
      if (error) throw error;
      return data.map((row) => row.interest_id);
    },
    enabled: !!postId,
  });
}

/**
 * Today's prioritized post for a creator, if any — drives the
 * Prioritize button's state on PostCard (whether this exact post
 * is today's pick, a different post is, or nothing's been chosen
 * yet). See feed_algorithm_migration.sql for prioritized_posts.
 */
export function usePrioritizedPostToday(creatorId: string, enabled = true) {
  return useQuery({
    queryKey: ["prioritized-post-today", creatorId],
    queryFn: async (): Promise<string | null> => {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches the edge function
      const { data, error } = await supabase
        .from("prioritized_posts")
        .select("post_id")
        .eq("creator_id", creatorId)
        .eq("prioritized_date", today)
        .maybeSingle();
      if (error) throw error;
      return data?.post_id ?? null;
    },
    enabled,
  });
}

export function usePrioritizePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.functions.invoke("prioritize-post", {
        body: { post_id: postId },
      });
      if (error) {
        // Same FunctionsHttpError unwrapping as useReshare — the friendly
        // "already prioritized today" message lives in the function's
        // response body, not the generic error supabase-js surfaces.
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            throw new Error(typeof body?.error === "string" ? body.error : error.message);
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== error.message) throw parseError;
            throw error;
          }
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data.prioritized as { post_id: string; creator_id: string; prioritized_date: string };
    },
    onSuccess: (prioritized) => {
      queryClient.invalidateQueries({ queryKey: ["prioritized-post-today", prioritized.creator_id] });
      queryClient.invalidateQueries({ queryKey: ["feed-posts"] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from("posts")
        .update({ is_deleted: true })
        .eq("id", postId);
      if (error) throw error;
    },
    // Awaited (not fire-and-forget) so LoadingOverlay — which is
    // driven off this mutation's pending state, see meta.blocking —
    // stays up until these refetches actually land, not just until
    // they're requested. invalidateQueries' returned promise resolves
    // once the matching active queries finish refetching, so without
    // this await the overlay could close while the deleted post is
    // still sitting in the list for another moment, reading as
    // "nothing happened" until the background refetch catches up.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["user-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["page-posts"] }),
      ]);
    },
  });
}

export function useSetPostArchived() {
  const queryClient = useQueryClient();

  return useMutation({
    // Same reasoning as useDeletePost's onSuccess above — archiving/
    // restoring a post needs the same "stay blocking until the item
    // has actually left (or rejoined) the list" treatment, which it
    // was missing entirely before (no meta.blocking at all).
    meta: { blocking: true },
    mutationFn: async ({ postId, archived }: { postId: string; archived: boolean }) => {
      const { error } = await supabase
        .from("posts")
        .update({ is_archived: archived })
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feed-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["user-posts"] }),
        queryClient.invalidateQueries({ queryKey: ["page-posts"] }),
      ]);
    },
  });
}

/**
 * `includePagePosts` is off by default: a post published in Page mode
 * lives on the page's timeline, not the posting member's personal one.
 * The member's own Archive screen turns it on — it's the only place a
 * member can restore a page post they archived, since archived posts
 * drop off the page timeline too.
 */
export function useUserPostsWithArchived(
  userId: string,
  includeArchived: boolean,
  { includePagePosts = false }: { includePagePosts?: boolean } = {}
) {
  return useQuery({
    queryKey: ["user-posts", userId, "with-archived", includeArchived, includePagePosts],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      // A post published in Page mode belongs to the page's timeline
      // only (see usePagePosts) — author_id still records which team
      // member wrote it (accountability, edit/delete rights), but it
      // must not also show up on that member's personal profile.
      let authoredQuery = supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("author_id", userId)
        .eq("is_deleted", false);
      if (!includePagePosts) {
        authoredQuery = authoredQuery.is("posted_as_page_id", null);
      }
      if (!includeArchived) {
        authoredQuery = authoredQuery.eq("is_archived", false);
      }

      // A profile's post grid is everything the user authored, PLUS
      // anything they're an accepted collaborator on — a collaborator
      // should see the post on their own profile the same as the
      // author does, not just be reachable via the original author's
      // page. See post_collaborators / useCollaboration.ts.
      const [authoredRes, collaboratedRes] = await Promise.all([
        authoredQuery.order("created_at", { ascending: false }),
        supabase
          .from("post_collaborators")
          .select(`post:posts!post_collaborators_post_id_fkey(${FEED_SELECT})`)
          .eq("user_id", userId)
          .eq("status", "accepted"),
      ]);
      if (authoredRes.error) throw authoredRes.error;
      if (collaboratedRes.error) throw collaboratedRes.error;

      const authored = (authoredRes.data as any[]).map(normalizePost);

      // Same to-one-embedded-as-array quirk as elsewhere in this
      // codebase (see useCollaboration.ts) — `post` comes back as an
      // array even though the FK is to a single row; also null when
      // the post itself was hard-deleted, so it's filtered out here
      // rather than reaching normalizePost with nothing to normalize.
      const collaborated = (collaboratedRes.data ?? [])
        .map((row: any) => (Array.isArray(row.post) ? row.post[0] : row.post))
        .filter(
          (post: any) =>
            post &&
            !post.is_deleted &&
            (includePagePosts || !post.posted_as_page_id) &&
            (includeArchived || !post.is_archived)
        )
        .map(normalizePost);

      // A post could theoretically show up in both lists (shouldn't
      // happen — the author isn't normally also their own
      // collaborator — but de-duping by id keeps that safe either way).
      const byId = new Map<string, PostWithAuthor>();
      for (const post of [...authored, ...collaborated]) byId.set(post.id, post);

      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!userId,
  });
}
