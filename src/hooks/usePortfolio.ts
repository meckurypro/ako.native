// src/hooks/usePortfolio.ts
//
// AKỌ_DYNAMIC_PROFILE_PORTFOLIOS_AND_GIG_SYSTEM — Phase 1.
//
// The canonical `professional_role → portfolio_category` taxonomy
// (gig_roles table, admin-curated, same pattern as `roles` and
// `categories`) and the derived dynamic profile tabs it powers.
//
// A role answers "how did this person contribute" (Cinematographer).
// A category answers "what kind of work can visitors explore"
// (Film). See section 3 of the spec doc for the full mapping.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Project, ProjectType } from "./useProjects";

export interface TalentRole {
  id: string;
  key: string;
  label: string;
  category: string;
  sort_order: number;
}

/** The full canonical role taxonomy, for the Talent role picker. */
export function useTalentRoles() {
  return useQuery({
    queryKey: ["talent-roles"],
    queryFn: async (): Promise<TalentRole[]> => {
      const { data, error } = await supabase
        .from("gig_roles")
        .select("id, key, label, category, sort_order")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data as TalentRole[];
    },
    staleTime: 1000 * 60 * 60, // admin-curated, rarely changes
  });
}

/** Same list, grouped by category — what the role picker actually renders. */
export function useTalentRolesByCategory() {
  const query = useTalentRoles();
  const grouped = new Map<string, TalentRole[]>();
  for (const role of query.data ?? []) {
    const list = grouped.get(role.category) ?? [];
    list.push(role);
    grouped.set(role.category, list);
  }
  return { ...query, grouped };
}

export interface PortfolioCategory {
  category: string;
  gig_count: number;
  project_count: number;
}

/**
 * A profile's dynamic portfolio tabs — one aggregate query (see
 * get_profile_portfolio_categories) rather than one query per
 * candidate category (spec section 37). A category only appears if
 * the account has at least one active Talent in it with at least one
 * published, public portfolio project attached — "meaningful
 * eligible work" per spec section 2. Never returns an empty category.
 */
export function usePortfolioCategories(accountId: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-categories", accountId],
    queryFn: async (): Promise<PortfolioCategory[]> => {
      if (!accountId) return [];
      const { data, error } = await supabase.rpc("get_profile_portfolio_categories", {
        p_account_id: accountId,
      });
      if (error) throw error;
      return (data ?? []) as PortfolioCategory[];
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}

/**
 * The actual portfolio items behind one dynamic tab (e.g. everything
 * under "Film") — real Project rows, so they render with the same
 * <ProjectCard> used everywhere else. Joins project_gig_details →
 * project_gig_samples → the sample Projects, scoped to this
 * account's active talents in this category. Reuses the existing
 * portfolio join table rather than a second one (spec section 9 —
 * never clone a Project into a portfolio), and one canonical Project
 * attached to more than one talent in the same category only shows once.
 */
export function usePortfolioCategoryProjects(accountId: string | undefined, category: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-category-projects", accountId, category],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId || !category) return [];

      const { data: talentRows, error: talentError } = await supabase
        .from("project_gig_details")
        .select("project_id, gig_roles!inner(category), projects!inner(owner_id, status)")
        .eq("gig_roles.category", category)
        .eq("projects.owner_id", accountId)
        .eq("projects.status", "active");
      if (talentError) throw talentError;

      const talentProjectIds = (talentRows ?? []).map((r: any) => r.project_id);
      if (talentProjectIds.length === 0) return [];

      const { data: sampleRows, error: sampleError } = await supabase
        .from("gig_works")
        .select("sample_project_id")
        .in("gig_project_id", talentProjectIds);
      if (sampleError) throw sampleError;

      const sampleIds = [...new Set((sampleRows ?? []).map((r) => r.sample_project_id))];
      if (sampleIds.length === 0) return [];

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .in("id", sampleIds)
        .eq("status", "active")
        .eq("is_private", false)
        .order("created_at", { ascending: false });
      if (projectsError) throw projectsError;
      return (projects ?? []) as Project[];
    },
    enabled: !!accountId && !!category,
    staleTime: 60_000,
  });
}

/**
 * The account's own active Talent project(s) within one dynamic
 * portfolio category (e.g. the "Music Artist" talent backing the
 * "Artist" tab). Previously nothing on the profile linked to the talent
 * page itself — a category tab only ever showed its work-sample
 * Projects (via usePortfolioCategoryProjects), so a visitor could see
 * the proof-of-work but never reach the talent's own page (tagline,
 * pricing, "Message to inquire", full sample rail) from the profile —
 * only by following a link to it from somewhere else, like a feed
 * post. Rendered as a small rail above the samples in
 * PortfolioCategoryPane. Same eligibility bar as the samples query
 * (active, public, complete).
 */
export function usePortfolioCategoryTalents(accountId: string | undefined, category: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-category-talents", accountId, category],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId || !category) return [];
      const { data: talentRows, error: talentError } = await supabase
        .from("project_gig_details")
        .select("project_id, gig_roles!inner(category), projects!inner(owner_id, status, is_private)")
        .eq("gig_roles.category", category)
        .eq("projects.owner_id", accountId)
        .eq("projects.status", "active")
        .eq("projects.is_private", false)
        .eq("is_complete", true);
      if (talentError) throw talentError;

      const talentIds = [...new Set((talentRows ?? []).map((r: any) => r.project_id))];
      if (talentIds.length === 0) return [];

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .in("id", talentIds)
        .order("created_at", { ascending: false });
      if (projectsError) throw projectsError;
      return (projects ?? []) as Project[];
    },
    enabled: !!accountId && !!category,
    staleTime: 60_000,
  });
}

export interface TypePortfolioCategory {
  category: string;
  project_type: ProjectType;
  project_count: number;
}

/**
 * The other half of the dynamic tab set (spec section 2/44) — a
 * category derived straight from project_type for the five types
 * that don't route through a professional Talent role at all (Book,
 * Course, Event, Room, File). Without this, an account with a
 * published Book and no Talent had no way to get a "Books" tab — which
 * contradicts the spec's own first example ("Books only -> Posts |
 * Books"). See get_profile_type_categories; same "never empty"
 * guarantee as usePortfolioCategories, just a different eligibility
 * rule (published + public, no Talent/role/completion state involved).
 */
export function useTypePortfolioCategories(accountId: string | undefined) {
  return useQuery({
    queryKey: ["type-portfolio-categories", accountId],
    queryFn: async (): Promise<TypePortfolioCategory[]> => {
      if (!accountId) return [];
      const { data, error } = await supabase.rpc("get_profile_type_categories", {
        p_account_id: accountId,
      });
      if (error) throw error;
      return (data ?? []) as TypePortfolioCategory[];
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}

/** The published/public projects behind one type-based tab (e.g. "Books"). */
export function useTypeCategoryProjects(accountId: string | undefined, projectType: ProjectType | undefined) {
  return useQuery({
    queryKey: ["type-category-projects", accountId, projectType],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId || !projectType) return [];
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("owner_id", accountId)
        .is("posted_as_page_id", null)
        .eq("project_type", projectType)
        .eq("status", "active")
        .eq("is_private", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: !!accountId && !!projectType,
    staleTime: 60_000,
  });
}

export interface EligibleTalentSample {
  id: string;
  title: string;
  thumbnail_url: string | null;
  thumbnail_shape?: string | null;
  project_type: ProjectType;
}

/**
 * Everything the signed-in user can legitimately show as talent proof-
 * of-work: projects they own, plus projects they have an *accepted*
 * collaboration credit on (spec section 13 — one canonical Project
 * can back more than one contributor's portfolio). The server-side
 * can_use_as_gig_sample() check enforces the same rule, so this is
 * the picker matching what the backend will actually accept — before
 * this, a collaborator's own talent could only ever get the one sample
 * auto-attached on acceptance, with no way to add a second one.
 */
export function useEligibleTalentSampleProjects(excludeProjectId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["eligible-talent-samples", user?.id, excludeProjectId],
    queryFn: async (): Promise<EligibleTalentSample[]> => {
      if (!user) return [];
      const [ownRes, collabRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, title, thumbnail_url, thumbnail_shape, project_type, parent_gig_id")
          .eq("owner_id", user.id)
          .neq("project_type", "gig"),
        supabase
          .from("project_collaborators")
          .select(
            "project:projects!project_collaborators_project_id_fkey(id, title, thumbnail_url, thumbnail_shape, project_type, status)"
          )
          .eq("user_id", user.id)
          .eq("status", "accepted"),
      ]);
      if (ownRes.error) throw ownRes.error;
      if (collabRes.error) throw collabRes.error;

      // A talent's own songs already show under it (projects.parent_gig_id) — offering them as samples too would just
      // list them twice. Songs under a *different* talent stay eligible.
      const own = ((ownRes.data ?? []) as (EligibleTalentSample & { parent_gig_id: string | null })[]).filter(
        (p) => !excludeProjectId || p.parent_gig_id !== excludeProjectId
      );
      const collaborated = ((collabRes.data ?? []) as any[])
        .map((row) => (Array.isArray(row.project) ? row.project[0] : row.project))
        .filter((p): p is any => !!p && p.project_type !== "gig" && p.status === "active")
        .map((p): EligibleTalentSample => ({
          id: p.id,
          title: p.title,
          thumbnail_url: p.thumbnail_url,
          thumbnail_shape: p.thumbnail_shape,
          project_type: p.project_type,
        }));

      // De-dupe (shouldn't overlap in practice — you can't collaborate
      // on your own project — but a Map keeps this safe either way)
      // and drop the talent being edited so it can't showcase itself.
      const byId = new Map<string, EligibleTalentSample>();
      for (const p of [...own, ...collaborated]) {
        if (p.id !== excludeProjectId) byId.set(p.id, p);
      }
      return [...byId.values()];
    },
    enabled: !!user,
  });
}

export interface MyTalent {
  id: string;
  title: string;
  thumbnail_url: string | null;
  thumbnail_shape?: string | null;
  status: string;
  created_at: string;
  role_label: string | null;
  category: string | null;
  is_complete: boolean;
  source: "manual" | "auto_project" | "auto_collaboration";
}

/**
 * "Your Talents" — every project_type='gig' Project the account owns,
 * across every status and completion state, in one query. This is
 * the missing piece flagged by the AKO_GIG_ROLE_EXPANSION audit
 * (spec section 21): an auto-created draft Talent (source =
 * auto_collaboration/auto_project, is_complete = false) never
 * appears in the dynamic profile tabs above — get_profile_portfolio_
 * categories deliberately only surfaces complete, published Talents —
 * so without this list the one-time notification is the only way an
 * owner could ever find it again. Ordered incomplete-first so
 * anything needing attention surfaces at the top.
 */
export function useMyTalents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-talents", user?.id],
    queryFn: async (): Promise<MyTalent[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, title, thumbnail_url, thumbnail_shape, status, created_at, project_gig_details!inner(is_complete, source, gig_roles(label, category))"
        )
        .eq("owner_id", user.id)
        .eq("project_type", "gig")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row: any) => {
          const details = Array.isArray(row.project_gig_details) ? row.project_gig_details[0] : row.project_gig_details;
          const role = Array.isArray(details?.gig_roles) ? details.gig_roles[0] : details?.gig_roles;
          return {
            id: row.id,
            title: row.title,
            thumbnail_url: row.thumbnail_url,
            thumbnail_shape: row.thumbnail_shape,
            status: row.status,
            created_at: row.created_at,
            role_label: role?.label ?? null,
            category: role?.category ?? null,
            is_complete: details?.is_complete ?? true,
            source: details?.source ?? "manual",
          };
        })
        .sort((a, b) => Number(a.is_complete) - Number(b.is_complete));
    },
    enabled: !!user,
  });
}

/**
 * The talents a song can live under: this account's own Artist-category talents that are still live. A song always lives
 * under one of these (projects.parent_gig_id), so this is the picker's list.
 */
export function useArtistTalents() {
  const query = useMyTalents();
  const data = (query.data ?? []).filter(
    (g) => g.category === "Artist" && (g.status === "active" || g.status === "draft")
  );
  return { data, isLoading: query.isLoading };
}

/**
 * Scaffolds the signed-in account's Music Artist talent (or returns the one they already have) — see the
 * ensure_artist_gig() RPC in supabase/ako_songs_under_talents.sql. A new talent comes back incomplete: the owner sets it
 * up properly later. This is how a musician with no talent yet can still post a song.
 */
export function useEnsureArtistTalent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc("ensure_artist_gig");
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-talents"], refetchType: "all" }),
  });
}

/**
 * Every sample Project id already shown under one of this account's
 * dynamic portfolio category tabs — i.e. a sample_project_id attached
 * to one of the account's active, *complete* Talents. The generic
 * Projects fallback tab (spec section 44: "Do not let a fallback
 * become a dumping ground") should exclude these, or a Project like a
 * published song shows twice: once correctly under its dynamic
 * category (e.g. "Artist"), and once more under the catch-all
 * "Projects" tab because the old filter only checked
 * project_type !== 'gig'.
 */
export function useCategorizedProjectIds(accountId: string | undefined) {
  return useQuery({
    queryKey: ["categorized-project-ids", accountId],
    queryFn: async (): Promise<Set<string>> => {
      if (!accountId) return new Set();
      const { data, error } = await supabase
        .from("project_gig_details")
        .select("is_complete, projects!inner(owner_id, status), project_gig_samples(sample_project_id)")
        .eq("projects.owner_id", accountId)
        .eq("projects.status", "active")
        .eq("is_complete", true);
      if (error) throw error;
      const ids = new Set<string>();
      for (const row of (data ?? []) as any[]) {
        for (const s of row.project_gig_samples ?? []) {
          ids.add(s.sample_project_id);
        }
      }
      return ids;
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}

/**
 * Media Projects where this account is an accepted collaborator, not
 * the owner — the other half of "Media will be found on the profiles
 * of collaborators as well" (spec §6). A Media project's own gifting
 * split already credits collaborators the moment someone gifts it
 * (process_media_gift); this is what makes that Media discoverable
 * from a collaborator's profile in the first place, matching the
 * owner's own copy of it (which already surfaces via the ordinary
 * projects fallback). See get_profile_collaborator_media — a plain
 * client join can't do this because project_collaborators' own RLS
 * only lets a viewer see rows where THEY are the collaborator/inviter,
 * not an arbitrary visited profile's rows.
 */
export function useCollaboratorMediaProjects(accountId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["collaborator-media-projects", accountId],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId) return [];
      const { data, error } = await supabase.rpc("get_profile_collaborator_media", {
        p_profile_id: accountId,
        p_viewer_id: user?.id ?? accountId,
      });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: !!accountId,
    staleTime: 60_000,
  });
}
