// src/hooks/usePages.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useTheme } from "../theme/ThemeProvider";
import { PAGE_AFFILIATION_SELECT, PAGE_WITH_MEMBERSHIP_SELECT, toPageAffiliations } from "../lib/pageRoles";
import type {
  ActiveIdentity,
  Page,
  PageAffiliation,
  PageMemberWithProfile,
  PageSummary,
  PageType,
  PageWithMyMembership,
  PendingPageInvite,
} from "../types/database";

const PAGE_SELECT = "id, page_type, name, username, tagline, bio, avatar_url, cover_url, website_url, category_id, parent_organization_id, created_by, is_verified, is_active, follower_count, created_at, updated_at";

/** Minimal page lookup by id — used where only a page_id is on hand
 * (e.g. resolving a page_role_accepted notification's target to a
 * route), as opposed to usePageByUsername which is what routes use. */
export function usePageById(pageId: string, enabled = true) {
  return useQuery({
    queryKey: ["page-by-id", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pages")
        .select("id, username, name, avatar_url, page_type, is_verified")
        .eq("id", pageId)
        .single();
      if (error) throw error;
      return data as PageSummary;
    },
    enabled: enabled && !!pageId,
  });
}

export function usePageByUsername(username: string) {
  return useQuery({
    queryKey: ["page", username],
    queryFn: async (): Promise<Page> => {
      const { data, error } = await supabase
        .from("pages")
        .select(PAGE_SELECT)
        .eq("username", username)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!username,
  });
}

/** Child pages attached under this one — the reverse of
 * parent_organization_id, powers the "Subsidiaries" rail on PagePage.
 * Active pages only, same as any other public listing (a deactivated
 * subsidiary shouldn't show up as if it still exists). */
export function usePageSubsidiaries(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-subsidiaries", pageId],
    queryFn: async (): Promise<PageSummary[]> => {
      const { data, error } = await supabase
        .from("pages")
        .select("id, username, name, avatar_url, page_type, is_verified")
        .eq("parent_organization_id", pageId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as PageSummary[];
    },
    enabled: !!pageId,
  });
}

/**
 * Pages the signed-in user can currently switch into — every page
 * where they have an ACTIVE role. Powers the mode switcher and the
 * "My Pages" hub.
 */
export function useMyPages() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-pages", user?.id],
    queryFn: async (): Promise<PageWithMyMembership[]> => {
      const { data, error } = await supabase
        .from("page_members")
        .select(PAGE_WITH_MEMBERSHIP_SELECT)
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      return (data as any[])
        .filter((row) => row.page)
        .map((row) => ({ ...row.page, my_role_label: row.role_label, my_is_admin: row.is_admin }));
    },
    enabled: !!user,
  });
}

/** Pending role invites addressed to the signed-in user, newest first. */
export function useMyPendingPageInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-page-invites", user?.id],
    queryFn: async (): Promise<PendingPageInvite[]> => {
      const { data, error } = await supabase
        .from("page_members")
        .select(`*, page:pages(id, username, name, avatar_url, page_type, is_verified)`)
        .eq("user_id", user!.id)
        .eq("status", "invited")
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });
}

/**
 * The identity the signed-in user is currently acting as — personal,
 * or one of their pages plus their role on it. Everything that needs
 * to render "who am I right now" (composer, header, settings) should
 * read from this single hook so they never disagree.
 */
export function useActiveIdentity() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["active-identity", user?.id],
    // This drives MyProfileRedirect's navigation decision (personal vs
    // page). Most stale-cache reads just mean a moment of slightly-old
    // data on screen that quietly corrects itself — harmless. This one
    // is different: MyProfileRedirect reads it once, picks a route, and
    // is gone. If that one read got a stale snapshot (e.g. from right
    // before a switch_active_mode elsewhere finished propagating), the
    // person lands on the wrong profile entirely and the correction
    // never reaches them — only their *next* visit reads it right. This
    // is what produced "tap Profile once → my own profile, tap it again
    // → the page" instead of the same result every time.
    // refetchOnMount: "always" forces every mount (not just ones where
    // the cache happens to already be stale) to await a real network
    // round-trip before resolving, so the loading state below actually
    // means something for this specific query.
    refetchOnMount: "always",
    queryFn: async (): Promise<ActiveIdentity> => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("active_page_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;

      if (!profile.active_page_id) return { mode: "personal" };

      const { data: membership, error: memberError } = await supabase
        .from("page_members")
        .select(`role_label, is_admin, page:pages(${PAGE_SELECT})`)
        .eq("page_id", profile.active_page_id)
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();
      if (memberError) throw memberError;

      // Membership vanished from under them (removed, page deactivated) —
      // the DB trigger clears active_page_id on removal, but a stale
      // cache read can still land here between that happening and the
      // next refetch. Fall back to personal rather than error out.
      if (!membership || !membership.page) return { mode: "personal" };

      return {
        mode: "page",
        page: membership.page as any,
        role_label: membership.role_label,
        is_admin: membership.is_admin,
      };
    },
    enabled: !!user,
  });
}

export function useSwitchActiveMode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { setPageMode } = useTheme();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (pageId: string | null) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.rpc("switch_active_mode", { p_page_id: pageId });
      if (error) throw error;
    },
    // Awaited (not fire-and-forget) so the mutation's own promise — and
    // therefore LoadingOverlay, which is keyed to this mutation via
    // meta.blocking — doesn't settle until the refetch this triggers has
    // actually landed in the cache.
    //
    // The palette swap is applied directly here (ThemeProvider.setPageMode)
    // rather than waiting for usePageThemeSync to notice on the next render:
    // we already know which mode we're switching TO (the pageId argument).
    // usePageThemeSync still runs and confirms the same value.
    onSuccess: async (_data, pageId) => {
      await queryClient.invalidateQueries({ queryKey: ["active-identity"] });
      setPageMode(pageId !== null);
    },
  });
}

interface CreatePageInput {
  page_type: PageType;
  name: string;
  username: string;
  role_label: string;
  bio?: string;
  tagline?: string;
  avatar_url?: string;
  category_id?: string;
  parent_organization_id?: string;
  // Same contract as CreateProject's topic_ids -> project_topics —
  // a follow-up client insert rather than an RPC param, since
  // page_interests already has RLS permitting the creator (who
  // becomes an admin member inside create_page itself) to write it
  // directly, no need to touch the RPC.
  topic_ids?: string[];
}

export function useCreatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: CreatePageInput): Promise<Page> => {
      const { topic_ids, ...rest } = input;
      const { data, error } = await supabase.rpc("create_page", {
        p_page_type: rest.page_type,
        p_name: rest.name,
        p_username: rest.username,
        p_role_label: rest.role_label,
        p_bio: rest.bio ?? null,
        p_tagline: rest.tagline ?? null,
        p_avatar_url: rest.avatar_url ?? null,
        p_category_id: rest.category_id ?? null,
        p_parent_organization_id: rest.parent_organization_id ?? null,
      });
      if (error) throw error;

      if (topic_ids && topic_ids.length > 0) {
        const rows = topic_ids.map((interest_id) => ({ page_id: data.id, interest_id }));
        const { error: topicsError } = await supabase.from("page_interests").insert(rows);
        if (topicsError) throw topicsError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pages"] });
    },
  });
}

// A page's currently-attached topics (interests) — same shape as
// useProjectTopics/usePostTopics, used to prefill TopicPicker when
// editing a page that already has some set.
export function usePageTopics(pageId: string | undefined) {
  return useQuery({
    queryKey: ["page-topics", pageId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("page_interests")
        .select("interest_id")
        .eq("page_id", pageId);
      if (error) throw error;
      return data.map((row) => row.interest_id);
    },
    enabled: !!pageId,
  });
}

// ------------------------------------------------------------
// Page creation eligibility — 30 posts + 30 distinct engaged posts in
// the trailing 30 days, plus a minimum account age, all
// admin-configurable (see capability_creation_rules /
// capability_overrides and get_page_creation_eligibility() in the
// migration). This hook and the reasons helper below are UX only:
// they let CreatePage show accurate progress and block submission
// early with a clear message, but create_page() independently
// re-checks the same rule server-side, so a stale or tampered client
// value here can never actually create a Page it shouldn't.
// ------------------------------------------------------------
export interface PageCreationEligibility {
  allowed: boolean;
  overridden: boolean;
  posts_30d: number;
  posts_required: number;
  posts_met: boolean;
  distinct_engaged_30d: number;
  distinct_engaged_required: number;
  distinct_engaged_met: boolean;
  account_age_days: number;
  account_age_required: number;
  account_age_met: boolean;
}

export function usePageCreationEligibility() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["page-creation-eligibility", user?.id],
    queryFn: async (): Promise<PageCreationEligibility> => {
      const { data, error } = await supabase.rpc("get_page_creation_eligibility");
      if (error) throw error;
      // RPC is declared RETURNS TABLE(...), so PostgREST hands back a
      // one-row array rather than a bare object.
      return Array.isArray(data) ? data[0] : data;
    },
    enabled: !!user,
  });
}

/** Same { eligible, reasons } shape as CreateProject's
 * getProjectTypeEligibility (see useProjects.ts), so CreatePage can
 * render its warning with the identical component pattern. Returns
 * undefined while the eligibility query is still loading, so the
 * caller can avoid flashing a false-negative warning on first render. */
export function getPageCreationEligibilityReasons(
  eligibility: PageCreationEligibility | undefined
): { eligible: boolean; reasons: string[] } | undefined {
  if (!eligibility) return undefined;
  if (eligibility.allowed) return { eligible: true, reasons: [] };

  const reasons: string[] = [];
  if (!eligibility.posts_met) {
    reasons.push(
      `You need at least ${eligibility.posts_required} posts in the last 30 days (you have ${eligibility.posts_30d}).`
    );
  }
  if (!eligibility.distinct_engaged_met) {
    reasons.push(
      `You need at least ${eligibility.distinct_engaged_required} distinct engaged posts in the last 30 days (you have ${eligibility.distinct_engaged_30d}).`
    );
  }
  if (!eligibility.account_age_met) {
    reasons.push(
      `Your account needs to be at least ${eligibility.account_age_required} days old (yours is ${eligibility.account_age_days}).`
    );
  }
  return { eligible: false, reasons };
}

// Who currently holds page-deletion/ownership-transfer authority for a
// page — the creator, unless their account is gone, in which case the
// earliest-tenured active admin (see resolve_page_owner() server-side,
// which this just mirrors for UI gating like showing/hiding "Delete").
export function useResolvePageOwner(pageId: string, enabled = true) {
  return useQuery({
    queryKey: ["page-owner", pageId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc("resolve_page_owner", { p_page_id: pageId });
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!pageId,
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (pageId: string) => {
      const { error } = await supabase.rpc("delete_page", { p_page_id: pageId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["active-identity"] });
    },
  });
}

export function useTransferPageOwnership(pageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (newOwnerId: string) => {
      const { error } = await supabase.rpc("transfer_page_ownership", {
        p_page_id: pageId,
        p_new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-owner", pageId] });
    },
  });
}

interface UpdatePageInput {
  page_id: string;
  name?: string;
  bio?: string;
  tagline?: string;
  avatar_url?: string;
  cover_url?: string;
  website_url?: string;
  category_id?: string | null;
  // Omit to leave topics untouched; pass an array (including empty,
  // to clear them all) to replace the full set — same contract as
  // useUpdateProject's topic_ids for project_topics.
  topic_ids?: string[];
}

/** Direct table update, admin-enforced by RLS — same pattern as
 * useUpdateProfile (no moderation on bio/name here either). */
export function useUpdatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ page_id, topic_ids, ...input }: UpdatePageInput) => {
      const { error } = await supabase.from("pages").update(input).eq("id", page_id);
      if (error) throw error;

      if (topic_ids !== undefined) {
        const { error: deleteError } = await supabase.from("page_interests").delete().eq("page_id", page_id);
        if (deleteError) throw deleteError;

        if (topic_ids.length > 0) {
          const rows = topic_ids.map((interest_id) => ({ page_id, interest_id }));
          const { error: insertError } = await supabase.from("page_interests").insert(rows);
          if (insertError) throw insertError;
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page"] });
      queryClient.invalidateQueries({ queryKey: ["my-pages"] });
      queryClient.invalidateQueries({ queryKey: ["active-identity"] });
      queryClient.invalidateQueries({ queryKey: ["page-members", variables.page_id] });
      queryClient.invalidateQueries({ queryKey: ["page-topics", variables.page_id] });
    },
  });
}

/** Active roster (public) plus, for admins, the pending invite list too. */
export function usePageMembers(pageId: string) {
  return useQuery({
    queryKey: ["page-members", pageId],
    queryFn: async (): Promise<PageMemberWithProfile[]> => {
      const { data, error } = await supabase
        .from("page_members")
        .select(`*, profile:profiles!page_members_user_id_fkey(id, username, display_name, avatar_url)`)
        .eq("page_id", pageId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!pageId,
  });
}

interface InviteMemberInput {
  page_id: string;
  user_id: string;
  role_label: string;
  is_admin?: boolean;
}

export function useInvitePageMember() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: InviteMemberInput) => {
      const { data, error } = await supabase.rpc("invite_page_member", {
        p_page_id: input.page_id,
        p_user_id: input.user_id,
        p_role_label: input.role_label,
        p_is_admin: input.is_admin ?? false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-members", variables.page_id] });
    },
  });
}

/** Live search-as-you-type for existing team role titles — shown
 * under the free-text role field in PageTeam so a title like
 * "Graphics Designer" only ever gets typed out in full once, not
 * once per invite. Backed by page_role_labels, which a DB trigger on
 * page_members keeps in sync on its own (see the migration) — this
 * hook only ever reads from it. Typing something with no match just
 * shows no suggestions and the invite proceeds as free text exactly
 * like before this existed; the new title becomes a suggestion for
 * next time once that invite's insert fires the trigger. */
export function usePageRoleLabelSuggestions(query: string) {
  return useQuery({
    queryKey: ["page-role-label-suggestions", query],
    queryFn: async (): Promise<string[]> => {
      const q = query.trim();
      if (!q) return [];

      const { data, error } = await supabase
        .from("page_role_labels")
        .select("label")
        .ilike("label", `%${q}%`)
        .order("usage_count", { ascending: false })
        .limit(8);
      if (error) throw error;

      // Drop an exact (case-insensitive) match to what's already
      // typed — no point suggesting the text that's already there.
      return (data ?? [])
        .map((r) => r.label as string)
        .filter((label) => label.toLowerCase() !== q.toLowerCase());
    },
    enabled: query.trim().length > 0,
  });
}

export function useRespondToPageInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ page_id, accept }: { page_id: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_to_page_invite", { p_page_id: page_id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["my-page-invites", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["my-pages", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["page-members", variables.page_id] });
    },
  });
}

/** Promote or demote an existing active member's admin flag. Requires
 * a matching `update_page_member_role` RPC in the database (mirroring
 * remove_page_member/invite_page_member's admin-only, security-definer
 * pattern) — see the migration note alongside this hook's usage in
 * PageTeam.tsx if that function doesn't exist yet in this project. */
export function useUpdatePageMemberRole() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      page_id,
      user_id,
      is_admin,
    }: {
      page_id: string;
      user_id: string;
      is_admin: boolean;
    }) => {
      const { error } = await supabase.rpc("update_page_member_role", {
        p_page_id: page_id,
        p_user_id: user_id,
        p_is_admin: is_admin,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-members", variables.page_id] });
      queryClient.invalidateQueries({ queryKey: ["my-pages", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["active-identity", user?.id] });
    },
  });
}

/** Covers both "admin removes someone" and "member leaves" — same RPC. */
export function useRemovePageMember() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ page_id, user_id }: { page_id: string; user_id: string }) => {
      const { error } = await supabase.rpc("remove_page_member", { p_page_id: page_id, p_user_id: user_id });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["page-members", variables.page_id] });
      queryClient.invalidateQueries({ queryKey: ["my-pages", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["active-identity", user?.id] });
    },
  });
}

/** Active organisational affiliations for a profile — the "X at Y"
 * chips shown alongside personal job/hobby tags (see AffiliationTags). */
export function useProfileAffiliations(userId: string) {
  return useQuery({
    queryKey: ["profile-affiliations", userId],
    queryFn: async (): Promise<PageAffiliation[]> => {
      const { data, error } = await supabase
        .from("page_members")
        .select(PAGE_AFFILIATION_SELECT)
        .eq("user_id", userId)
        .eq("status", "active");
      if (error) throw error;
      return toPageAffiliations(data as any[]);
    },
    enabled: !!userId,
  });
}

export function useIsFollowingPage(pageId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["is-following-page", pageId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("page_follows")
        .select("page_id")
        .eq("follower_id", user.id)
        .eq("page_id", pageId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !!pageId,
  });
}

export function useTogglePageFollow(pageId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currentlyFollowing: boolean) => {
      if (!user) throw new Error("Not signed in");

      if (currentlyFollowing) {
        const { error } = await supabase
          .from("page_follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("page_id", pageId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("page_follows").insert({ follower_id: user.id, page_id: pageId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-following-page", pageId] });
      queryClient.invalidateQueries({ queryKey: ["page"] });
    },
  });
}
