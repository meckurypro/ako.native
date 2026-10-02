// src/hooks/useProjectTypeDetails.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { Project } from "./useProjects";

export interface EventDetails {
  project_id: string;
  event_date: string | null;
  location_type: "physical" | "online";
  location_value: string;
  ticket_template_url: string | null;
}

export interface MeetingDetails {
  project_id: string;
  scheduled_at: string;
  provider_room_id: string | null;
  status: "scheduled" | "live" | "ended" | "cancelled";
  recording_url: string | null;
  // Requires the recording_enabled column added by the
  // ako_projects_v5_meeting_infra migration — defaults to false via
  // `?? false` wherever read, same pattern as Course's is_free_preview.
  recording_enabled: boolean;
}

// Both tables are publicly readable (see ako_projects_v2_rls.sql) —
// this is browsing info shown before anyone pays.
export function useEventDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-event-details", projectId],
    queryFn: async (): Promise<EventDetails | null> => {
      const { data, error } = await supabase
        .from("project_event_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export function useMeetingDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-meeting-details", projectId],
    queryFn: async (): Promise<MeetingDetails | null> => {
      const { data, error } = await supabase
        .from("project_meeting_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, recording_enabled: data.recording_enabled ?? false } : null;
    },
    enabled: !!projectId,
  });
}

// A 'media' project holds an audio channel, a video channel, an image
// channel, or any combination of the three. Audio/video are hybrid:
// *_url (a redirect to the full thing elsewhere — Spotify, YouTube)
// and *_file_path (an uploaded clip played in-app as a capped ~20s
// preview, see ProjectCard's MediaPreviewPlayer) are independent —
// either, both, or neither can be set per channel, not one-or-the-
// other. audio_source/video_source are vestigial (kept for backward
// compatibility with older rows) and no longer drive display logic —
// what's actually shown is derived straight from which of {url,
// file_path} are non-null. Image is upload-only: image_file_path is
// the full image shown in-app, and image_url/image_source are no
// longer written by the app (may still hold values on old rows).
// All fields null when the matching has_* flag is false.
export interface MediaDetails {
  project_id: string;
  has_audio: boolean;
  has_video: boolean;
  has_image: boolean;
  audio_source: "link" | "upload" | null;
  audio_url: string | null;
  audio_file_path: string | null;
  video_source: "link" | "upload" | null;
  video_url: string | null;
  video_file_path: string | null;
  image_source: "link" | "upload" | null;
  image_url: string | null;
  image_file_path: string | null;
}

// Publicly readable, same as event/meeting details above. Note that
// *_file_path values are private-bucket storage paths, not usable
// URLs on their own — same safety property projects.file_path
// already relies on — so exposing them here is harmless; only
// get-project-file (service role) can turn one into a signed,
// time-limited streaming URL after checking access.
export function useMediaDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-media-details", projectId],
    queryFn: async (): Promise<MediaDetails | null> => {
      const { data, error } = await supabase
        .from("project_media_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

export interface GigFaqItem {
  question: string;
  answer: string;
}

export interface GigDetails {
  project_id: string;
  // Canonical professional role this gig represents (gig_roles.id) —
  // see AKO_DYNAMIC_PROFILE_PORTFOLIOS spec. Null only for gigs
  // created before that migration.
  role_id: string | null;
  tagline: string | null;
  delivery_estimate: string | null;
  // Requires the ako_projects_v7_gig_extras migration — default to
  // empty/null wherever read, same pattern as Course's is_free_preview.
  revisions_included: number | null;
  deliverables: string[] | null;
  faq: GigFaqItem[] | null;
  // false for a gig that find_or_create_role_gig auto-created from a
  // Project role or accepted collaboration credit (spec §10-11) —
  // true (the default) for anything created through the normal
  // Create Gig form. Doesn't gate editing, only public-portfolio
  // visibility (see get_profile_portfolio_categories) — the owner
  // completing and re-saving the form sets this back to true.
  is_complete: boolean;
  source: "manual" | "auto_project" | "auto_collaboration";
}

// Publicly readable, same as event/meeting/media above.
export function useGigDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-gig-details", projectId],
    queryFn: async (): Promise<GigDetails | null> => {
      const { data, error } = await supabase
        .from("project_gig_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            ...data,
            deliverables: data.deliverables ?? null,
            faq: data.faq ?? null,
          }
        : null;
    },
    enabled: !!projectId,
  });
}

// A gig's proof-of-work samples, in display order. Two-step fetch
// (sample ids, then the projects themselves) rather than a
// PostgREST embed — keeps this independent of the exact FK
// constraint name in the DB.
export function useGigSamples(gigProjectId: string | undefined) {
  return useQuery({
    queryKey: ["project-gig-samples", gigProjectId],
    queryFn: async (): Promise<Project[]> => {
      const { data: links, error: linksError } = await supabase
        .from("project_gig_samples")
        .select("sample_project_id, sort_order")
        .eq("gig_project_id", gigProjectId)
        .order("sort_order");
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      const ids = links.map((l) => l.sample_project_id);
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .in("id", ids);
      if (projectsError) throw projectsError;

      // Preserve the sort_order from project_gig_samples — the .in()
      // query above doesn't guarantee row order.
      const byId = new Map((projects ?? []).map((p) => [p.id, p as Project]));
      return links.map((l) => byId.get(l.sample_project_id)).filter((p): p is Project => !!p);
    },
    enabled: !!gigProjectId,
  });
}

// The reverse of useGigSamples: which of the account's own Gig
// page(s) feature THIS project as a work sample, if any. Nothing
// previously linked from a sample project (e.g. a published song)
// back to the Gig page it's proof-of-work for — a visitor who
// reached the sample directly (a feed post, a share) had no way to
// discover the gig itself ("Message to inquire", pricing, other
// samples) short of stumbling onto it separately. Two-step fetch,
// same reasoning as useGigSamples — only ever surfaces gigs that are
// themselves active/public, never a draft or private one.
export interface FeaturingGig {
  id: string;
  title: string;
  role_label: string | null;
}

export function useGigsFeaturingProject(sampleProjectId: string | undefined) {
  return useQuery({
    queryKey: ["gigs-featuring-project", sampleProjectId],
    queryFn: async (): Promise<FeaturingGig[]> => {
      if (!sampleProjectId) return [];
      const { data: links, error: linksError } = await supabase
        .from("project_gig_samples")
        .select("gig_project_id")
        .eq("sample_project_id", sampleProjectId);
      if (linksError) throw linksError;

      const gigIds = [...new Set((links ?? []).map((l) => l.gig_project_id))];
      if (gigIds.length === 0) return [];

      const { data, error } = await supabase
        .from("project_gig_details")
        .select("project_id, gig_roles(label), projects!inner(id, title, status, is_private)")
        .in("project_id", gigIds)
        .eq("projects.status", "active")
        .eq("projects.is_private", false);
      if (error) throw error;

      return ((data ?? []) as any[]).map((row) => {
        const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
        const role = Array.isArray(row.gig_roles) ? row.gig_roles[0] : row.gig_roles;
        return { id: project.id, title: project.title, role_label: role?.label ?? null };
      });
    },
    enabled: !!sampleProjectId,
  });
}

// A Pitch's fundraising goal + the id of its auto-provisioned update
// Room, which every supporter is added to on backing (see
// create_pitch_project and add_supporter_to_pitch_room in
// ako_projects_v8_pitch.sql). Pitch never has price_usd on the base
// `projects` row — the goal here is a progress-bar target only,
// always keep-what-you-raise, never a gate.
export interface PitchDetails {
  project_id: string;
  goal_amount_usd: number;
  linked_room_id: string;
}

// Publicly readable, same as event/meeting/media/gig above — this is
// browsing info shown before anyone supports.
export function usePitchDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-pitch-details", projectId],
    queryFn: async (): Promise<PitchDetails | null> => {
      const { data, error } = await supabase
        .from("project_pitch_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// The "raised" side of the goal-progress bar — summed from the
// pitch_supporters ledger rather than stored as a column, same
// reasoning as this codebase's other accumulation logic (e.g.
// project_access_events unlock counts): the ledger is the source of
// truth, a cached total is just one more place for drift to creep in.
export function usePitchRaised(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-pitch-raised", projectId],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("pitch_supporters")
        .select("amount_usd")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + row.amount_usd, 0);
    },
    enabled: !!projectId,
  });
}

export interface PitchSupporter {
  id: string;
  supporter_id: string;
  amount_usd: number;
  message: string | null;
  supported_at: string;
}

// Publicly readable, matching pitch_supporters' RLS — part of what
// makes public accountability work: anyone can see who backed an
// idea and for how much.
export function usePitchSupporters(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-pitch-supporters", projectId],
    queryFn: async (): Promise<PitchSupporter[]> => {
      const { data, error } = await supabase
        .from("pitch_supporters")
        .select("id, supporter_id, amount_usd, message, supported_at")
        .eq("project_id", projectId)
        .order("supported_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
  });
}

// Backing a Pitch: a free-form pledge, not a purchase — no price to
// validate, no unlock to grant. In production this should go through
// a support-pitch edge function that captures the Paystack charge
// first and only then writes the ledger row with the service role,
// the same pattern as purchase-project for paid unlocks; the direct
// insert here is the client-side shape for that flow, guarded by the
// "a user can insert their own support" RLS policy either way. The
// insert trigger (add_supporter_to_pitch_room) handles adding the
// supporter to the linked update Room server-side — nothing extra to
// do here for that part.
export function useSupportPitch(projectId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ amountUsd, message }: { amountUsd: number; message?: string }) => {
      if (!user) throw new Error("Not signed in");
      if (!(amountUsd > 0)) throw new Error("Enter an amount to support with.");

      const { error } = await supabase.from("pitch_supporters").insert({
        project_id: projectId,
        supporter_id: user.id,
        amount_usd: amountUsd,
        message: message?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-pitch-raised", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-pitch-supporters", projectId] });
    },
  });
}

// A 'book' project's content lives in one of three shapes — see the
// header comment on ako_projects_v9_book_type.sql for the full
// rationale. external_url/file_path are only ever set for their
// matching content_source; page_count is a display estimate, not the
// live source of truth (see BookReader/book_reading_progress for
// that). Publicly readable — browsing info, not the gated content
// itself (book_chapters, unlike this table, IS gated — see below).
export interface BookDetails {
  project_id: string;
  book_type: "book" | "article";
  content_source: "link" | "upload" | "authored";
  author_name: string | null;
  is_own_work: boolean;
  source_credit: string | null;
  external_url: string | null;
  file_path: string | null;
  allow_download: boolean;
  allow_read_in_app: boolean;
  page_count: number | null;
}

export function useBookDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-book-details", projectId],
    queryFn: async (): Promise<BookDetails | null> => {
      const { data, error } = await supabase
        .from("project_book_details")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}

// PDF-mode reading position (content_source 'link'/'upload', opened
// via BookReader's page-image renderer) — the current_page/total_pages
// half of book_reading_progress. Authored books use the
// current_chapter_id/scroll_fraction half instead — see
// useBookProgress/useSaveBookProgress in useBookBuilder.ts.
export interface PdfReadingProgress {
  current_page: number;
  total_pages: number | null;
}

export function usePdfReadingProgress(projectId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["pdf-reading-progress", projectId, userId],
    queryFn: async (): Promise<PdfReadingProgress | null> => {
      const { data, error } = await supabase
        .from("book_reading_progress")
        .select("current_page, total_pages")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("book_reading_progress unavailable — has the migration run yet?", error);
        return null;
      }
      return data && data.current_page != null ? (data as PdfReadingProgress) : null;
    },
    enabled: !!projectId && !!userId,
  });
}

// Debounced by BookReader — not meant to write on every single page
// turn while someone's rapidly flipping through.
export function useSavePdfReadingProgress(projectId: string, userId: string | undefined) {
  return useMutation({
    mutationFn: async ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => {
      if (!userId) return;
      const { error } = await supabase.from("book_reading_progress").upsert(
        {
          project_id: projectId,
          user_id: userId,
          current_page: currentPage,
          total_pages: totalPages,
        },
        { onConflict: "user_id,project_id" }
      );
      if (error) throw error;
    },
  });
}
