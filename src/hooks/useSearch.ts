import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import { getSearchVisitRanks } from "../lib/searchVisits";
import { FEED_SELECT, normalizePost } from "./usePosts";
import type { Project } from "./useProjects";
import type { Page, PostWithAuthor, ProfileWithRoles } from "../types/database";

const PEOPLE_SELECT = `id, username, display_name, avatar_url, tier, follower_count, ${PROFILE_ROLES_SELECT}`;

/**
 * Builds a quoted PostgREST `ilike` pattern (`"%query%"`) that is safe to
 * drop into an `.or()` filter. Two layers of escaping are needed:
 *  1. LIKE wildcards (`%`, `_`, `\`) are escaped so a username like
 *     "john_doe" matches literally instead of `_` meaning "any char".
 *  2. The pattern is wrapped in double quotes — with `"` and `\`
 *     escaped for PostgREST — so commas and parentheses in the query
 *     can't break out of the `or=(...)` list (previously a search for
 *     "acme, inc" produced a 400).
 */
export function ilikeContains(query: string): string {
  const likeEscaped = query.trim().replace(/[\\%_]/g, "\\$&");
  const quoted = likeEscaped.replace(/[\\"]/g, "\\$&");
  return `"%${quoted}%"`;
}

function normalizeProfile(raw: any): ProfileWithRoles {
  return { ...raw, roles: toProfileRoles(raw.profile_roles) };
}

// Cached follows + followers graph — shared across hooks, stale for 5 min
// so scoring doesn't refetch on every keystroke.
function useSocialGraph() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["social-graph", user?.id],
    queryFn: async () => {
      if (!user) return { followingIds: new Set<string>(), followerIds: new Set<string>() };
      const [fwingRes, fwersRes] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase.from("follows").select("follower_id").eq("following_id", user.id),
      ]);
      return {
        followingIds: new Set((fwingRes.data ?? []).map((f) => f.following_id)),
        followerIds: new Set((fwersRes.data ?? []).map((f) => f.follower_id)),
      };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// Cached engagement graph — who has reacted to my posts, and whose posts I've
// reacted to. Only blocks search scoring, not the profile fetch itself.
function useEngagementGraph() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["engagement-graph", user?.id],
    queryFn: async () => {
      const engagedIds = new Set<string>();
      if (!user) return engagedIds;

      const [myPostsRes, myReactedRes] = await Promise.all([
        supabase.from("posts").select("id").eq("author_id", user.id).limit(50),
        // target_type scoped to "post" — the reactions table also holds
        // likes on projects/comments, which have post_id: null. Without
        // this filter those nulls end up in reactedPostIds below and get
        // passed into .in("id", reactedPostIds), which Postgrest rejects
        // with a 400 (it tries to parse "null" as a UUID).
        supabase.from("reactions").select("post_id").eq("user_id", user.id).eq("target_type", "post").limit(50),
      ]);

      const myPostIds = (myPostsRes.data ?? []).map((p) => p.id);
      // Defensive filter — belt-and-suspenders in case a row still slips
      // through without a post_id despite the target_type scoping above.
      const reactedPostIds = (myReactedRes.data ?? [])
        .map((r) => r.post_id)
        .filter((id): id is string => id != null);

      const [reactorsRes, authorRes] = await Promise.all([
        myPostIds.length > 0
          ? supabase
              .from("reactions")
              .select("user_id")
              .in("post_id", myPostIds)
              .neq("user_id", user.id)
          : { data: [] },
        reactedPostIds.length > 0
          ? supabase
              .from("posts")
              .select("author_id")
              .in("id", reactedPostIds)
              .neq("author_id", user.id)
          : { data: [] },
      ]);

      (reactorsRes.data ?? []).forEach((r: any) => engagedIds.add(r.user_id));
      (authorRes.data ?? []).forEach((p: any) => engagedIds.add(p.author_id));
      return engagedIds;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

function scoreProfile(
  id: string,
  followingIds: Set<string>,
  followerIds: Set<string>,
  engagedIds: Set<string>,
  visitRanks: Map<string, number>
): number {
  // Item 2: an account the user previously opened from search outranks
  // everything else — 1000+ keeps it clear of the 0-4 tiers below no
  // matter how many visited profiles there are, and subtracting the
  // recency rank keeps the most-recently-visited one on top among them.
  if (visitRanks.has(id)) return 1000 - (visitRanks.get(id) ?? 0);
  if (followingIds.has(id)) return 4; // I follow them
  if (followerIds.has(id)) return 3;  // They follow me
  if (engagedIds.has(id)) return 2;   // Engagement overlap
  return 0;
}

/**
 * "People to follow" shown on the empty Discover state.
 * Excludes already-followed users; surfaces followers-not-followed-back
 * first, then everyone else ranked by follower_count.
 */
export function useSuggestedPeople() {
  const { user } = useAuth();
  const { data: graph } = useSocialGraph();

  return useQuery({
    queryKey: ["suggested-people", user?.id, !!graph],
    queryFn: async (): Promise<ProfileWithRoles[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select(PEOPLE_SELECT)
        .eq("is_deleted", false)
        .neq("id", user.id)
        .order("follower_count", { ascending: false })
        .limit(30);

      if (error) throw error;

      const followingIds = graph?.followingIds ?? new Set<string>();
      const followerIds = graph?.followerIds ?? new Set<string>();

      return (data ?? [])
        .map(normalizeProfile)
        .filter((p) => !followingIds.has(p.id))
        .map((p) => ({ p, score: followerIds.has(p.id) ? 2 : 0 }))
        .sort((a, b) => b.score - a.score || b.p.follower_count - a.p.follower_count)
        .slice(0, 12)
        .map((s) => s.p);
    },
    enabled: !!user && !!graph,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Smart people search. Profile fetch and graph lookups run in parallel
 * (graphs are cached), scoring happens instantly once both resolve.
 * Priority: following > followers > engagement overlap > everyone else.
 */
export function useSearchPeople(query: string) {
  const { user } = useAuth();
  const { data: graph } = useSocialGraph();
  const { data: engagedIds } = useEngagementGraph();

  return useQuery({
    queryKey: ["search-people", query, user?.id],
    queryFn: async (): Promise<ProfileWithRoles[]> => {
      if (!query.trim()) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select(PEOPLE_SELECT)
        .eq("is_deleted", false)
        .or(`username.ilike.${ilikeContains(query)},display_name.ilike.${ilikeContains(query)}`)
        .limit(30);

      if (error) throw error;

      const followingIds = graph?.followingIds ?? new Set<string>();
      const followerIds = graph?.followerIds ?? new Set<string>();
      const engaged = engagedIds ?? new Set<string>();
      const visitRanks = getSearchVisitRanks(user?.id);

      return (data ?? [])
        .map(normalizeProfile)
        .map((p) => ({ p, score: scoreProfile(p.id, followingIds, followerIds, engaged, visitRanks) }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.p);
    },
    enabled: query.trim().length > 1,
  });
}

/**
 * Full-text post search via the search_vector tsvector column.
 * Uses websearch mode so queries like "AI startup nigeria" just work.
 */
export function useSearchPosts(query: string) {
  return useQuery({
    queryKey: ["search-posts", query],
    queryFn: async (): Promise<PostWithAuthor[]> => {
      if (!query.trim()) return [];

      // FEED_SELECT (not a hand-rolled select) so page posts come back
      // with posted_as_page and render under the page's name — the old
      // select omitted it, so a page post showed the team member as
      // its author in results.
      const { data, error } = await supabase
        .from("posts")
        .select(FEED_SELECT)
        .eq("is_deleted", false)
        .eq("is_archived", false)
        .eq("status", "published")
        .textSearch("search_vector", query, { type: "websearch" })
        .limit(20);

      if (error) throw error;

      return (data as any[]).map(normalizePost);
    },
    enabled: query.trim().length > 1,
  });
}

export type PageSearchResult = Pick<
  Page,
  "id" | "name" | "username" | "tagline" | "avatar_url" | "page_type" | "is_verified" | "follower_count"
>;

const PAGE_RESULT_SELECT = "id, name, username, tagline, avatar_url, page_type, is_verified, follower_count";

/**
 * Page search — name, @username or tagline. Ranked by followers so the
 * established page wins over a look-alike. Inactive pages are hidden by
 * RLS for everyone but their admins, so is_active is also filtered
 * explicitly to keep an admin's own deactivated page out of results.
 */
export function useSearchPages(query: string) {
  return useQuery({
    queryKey: ["search-pages", query],
    queryFn: async (): Promise<PageSearchResult[]> => {
      if (!query.trim()) return [];
      const pattern = ilikeContains(query);
      const { data, error } = await supabase
        .from("pages")
        .select(PAGE_RESULT_SELECT)
        .eq("is_active", true)
        .or(`name.ilike.${pattern},username.ilike.${pattern},tagline.ilike.${pattern}`)
        .order("follower_count", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PageSearchResult[];
    },
    enabled: query.trim().length > 1,
  });
}

/**
 * Public project search — title or description. Only active, non-private
 * projects: RLS alone would also return private ones (it only checks
 * is_active), and a private project must never be discoverable.
 */
export function useSearchProjects(query: string) {
  return useQuery({
    queryKey: ["search-projects", query],
    queryFn: async (): Promise<Project[]> => {
      if (!query.trim()) return [];
      const pattern = ilikeContains(query);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("status", "active")
        .eq("is_private", false)
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: query.trim().length > 1,
  });
}

/**
 * "Pages to follow" for the empty Discover state — the most-followed
 * active pages the viewer doesn't already follow.
 */
export function useSuggestedPages() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["suggested-pages", user?.id],
    queryFn: async (): Promise<PageSearchResult[]> => {
      const [pagesRes, followsRes] = await Promise.all([
        supabase
          .from("pages")
          .select(PAGE_RESULT_SELECT)
          .eq("is_active", true)
          .order("follower_count", { ascending: false })
          .limit(20),
        user
          ? supabase.from("page_follows").select("page_id").eq("follower_id", user.id)
          : Promise.resolve({ data: [] as { page_id: string }[], error: null }),
      ]);
      if (pagesRes.error) throw pagesRes.error;
      if (followsRes.error) throw followsRes.error;

      const followed = new Set((followsRes.data ?? []).map((f) => f.page_id));
      return ((pagesRes.data ?? []) as PageSearchResult[]).filter((p) => !followed.has(p.id)).slice(0, 8);
    },
    staleTime: 5 * 60 * 1000,
  });
}
