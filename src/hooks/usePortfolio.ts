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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Project, ProjectType } from "./useProjects";

export interface GigRole {
  id: string;
  key: string;
  label: string;
  category: string;
  sort_order: number;
}

/** The full canonical role taxonomy, for the Gig role picker. */
export function useGigRoles() {
  return useQuery({
    queryKey: ["gig-roles"],
    queryFn: async (): Promise<GigRole[]> => {
      const { data, error } = await supabase
        .from("gig_roles")
        .select("id, key, label, category, sort_order")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return data as GigRole[];
    },
    staleTime: 1000 * 60 * 60, // admin-curated, rarely changes
  });
}

/** Same list, grouped by category — what the role picker actually renders. */
export function useGigRolesByCategory() {
  const query = useGigRoles();
  const grouped = new Map<string, GigRole[]>();
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
 * the account has at least one active Gig in it with at least one
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
  });
}

/**
 * The actual portfolio items behind one dynamic tab (e.g. everything
 * under "Film") — real Project rows, so they render with the same
 * <ProjectCard> used everywhere else. Joins project_gig_details →
 * project_gig_samples → the sample Projects, scoped to this
 * account's active gigs in this category. Reuses the existing
 * portfolio join table rather than a second one (spec section 9 —
 * never clone a Project into a portfolio), and one canonical Project
 * attached to more than one gig in the same category only shows once.
 */
export function usePortfolioCategoryProjects(accountId: string | undefined, category: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-category-projects", accountId, category],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId || !category) return [];

      const { data: gigRows, error: gigError } = await supabase
        .from("project_gig_details")
        .select("project_id, gig_roles!inner(category), projects!inner(owner_id, status)")
        .eq("gig_roles.category", category)
        .eq("projects.owner_id", accountId)
        .eq("projects.status", "active");
      if (gigError) throw gigError;

      const gigProjectIds = (gigRows ?? []).map((r: any) => r.project_id);
      if (gigProjectIds.length === 0) return [];

      const { data: sampleRows, error: sampleError } = await supabase
        .from("project_gig_samples")
        .select("sample_project_id")
        .in("gig_project_id", gigProjectIds);
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
  });
}

/**
 * The account's own active Gig project(s) within one dynamic
 * portfolio category (e.g. the "Music Artist" gig backing the
 * "Artist" tab). Previously nothing on the profile linked to the gig
 * page itself — a category tab only ever showed its work-sample
 * Projects (via usePortfolioCategoryProjects), so a visitor could see
 * the proof-of-work but never reach the gig's own page (tagline,
 * pricing, "Message to inquire", full sample rail) from the profile —
 * only by following a link to it from somewhere else, like a feed
 * post. Rendered as a small rail above the samples in
 * PortfolioCategoryPane. Same eligibility bar as the samples query
 * (active, public, complete).
 */
export function usePortfolioCategoryGigs(accountId: string | undefined, category: string | undefined) {
  return useQuery({
    queryKey: ["portfolio-category-gigs", accountId, category],
    queryFn: async (): Promise<Project[]> => {
      if (!accountId || !category) return [];
      const { data: gigRows, error: gigError } = await supabase
        .from("project_gig_details")
        .select("project_id, gig_roles!inner(category), projects!inner(owner_id, status, is_private)")
        .eq("gig_roles.category", category)
        .eq("projects.owner_id", accountId)
        .eq("projects.status", "active")
        .eq("projects.is_private", false)
        .eq("is_complete", true);
      if (gigError) throw gigError;

      const gigIds = [...new Set((gigRows ?? []).map((r: any) => r.project_id))];
      if (gigIds.length === 0) return [];

      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .in("id", gigIds)
        .order("created_at", { ascending: false });
      if (projectsError) throw projectsError;
      return (projects ?? []) as Project[];
    },
    enabled: !!accountId && !!category,
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
 * that don't route through a professional Gig role at all (Book,
 * Course, Event, Room, File). Without this, an account with a
 * published Book and no Gig had no way to get a "Books" tab — which
 * contradicts the spec's own first example ("Books only -> Posts |
 * Books"). See get_profile_type_categories; same "never empty"
 * guarantee as usePortfolioCategories, just a different eligibility
 * rule (published + public, no Gig/role/completion state involved).
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
  });
}

export interface EligibleGigSample {
  id: string;
  title: string;
  thumbnail_url: string | null;
  project_type: ProjectType;
}

/**
 * Everything the signed-in user can legitimately show as gig proof-
 * of-work: projects they own, plus projects they have an *accepted*
 * collaboration credit on (spec section 13 — one canonical Project
 * can back more than one contributor's portfolio). The server-side
 * can_use_as_gig_sample() check enforces the same rule, so this is
 * the picker matching what the backend will actually accept — before
 * this, a collaborator's own gig could only ever get the one sample
 * auto-attached on acceptance, with no way to add a second one.
 */
export function useEligibleGigSampleProjects(excludeProjectId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["eligible-gig-samples", user?.id, excludeProjectId],
    queryFn: async (): Promise<EligibleGigSample[]> => {
      if (!user) return [];
      const [ownRes, collabRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, title, thumbnail_url, project_type")
          .eq("owner_id", user.id)
          .neq("project_type", "gig"),
        supabase
          .from("project_collaborators")
          .select(
            "project:projects!project_collaborators_project_id_fkey(id, title, thumbnail_url, project_type, status)"
          )
          .eq("user_id", user.id)
          .eq("status", "accepted"),
      ]);
      if (ownRes.error) throw ownRes.error;
      if (collabRes.error) throw collabRes.error;

      const own = (ownRes.data ?? []) as EligibleGigSample[];
      const collaborated = ((collabRes.data ?? []) as any[])
        .map((row) => (Array.isArray(row.project) ? row.project[0] : row.project))
        .filter((p): p is any => !!p && p.project_type !== "gig" && p.status === "active")
        .map((p): EligibleGigSample => ({
          id: p.id,
          title: p.title,
          thumbnail_url: p.thumbnail_url,
          project_type: p.project_type,
        }));

      // De-dupe (shouldn't overlap in practice — you can't collaborate
      // on your own project — but a Map keeps this safe either way)
      // and drop the gig being edited so it can't showcase itself.
      const byId = new Map<string, EligibleGigSample>();
      for (const p of [...own, ...collaborated]) {
        if (p.id !== excludeProjectId) byId.set(p.id, p);
      }
      return [...byId.values()];
    },
    enabled: !!user,
  });
}

export interface MyGig {
  id: string;
  title: string;
  thumbnail_url: string | null;
  status: string;
  created_at: string;
  role_label: string | null;
  category: string | null;
  is_complete: boolean;
  source: "manual" | "auto_project" | "auto_collaboration";
}

/**
 * "Your Gigs" — every project_type='gig' Project the account owns,
 * across every status and completion state, in one query. This is
 * the missing piece flagged by the AKO_GIG_ROLE_EXPANSION audit
 * (spec section 21): an auto-created draft Gig (source =
 * auto_collaboration/auto_project, is_complete = false) never
 * appears in the dynamic profile tabs above — get_profile_portfolio_
 * categories deliberately only surfaces complete, published Gigs —
 * so without this list the one-time notification is the only way an
 * owner could ever find it again. Ordered incomplete-first so
 * anything needing attention surfaces at the top.
 */
export function useMyGigs() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-gigs", user?.id],
    queryFn: async (): Promise<MyGig[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, title, thumbnail_url, status, created_at, project_gig_details!inner(is_complete, source, gig_roles(label, category))"
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
 * Every sample Project id already shown under one of this account's
 * dynamic portfolio category tabs — i.e. a sample_project_id attached
 * to one of the account's active, *complete* Gigs. The generic
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
  });
}
