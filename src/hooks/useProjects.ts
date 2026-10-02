// src/hooks/useProjects.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { useSound } from "./useSound";
import { PROFILE_ROLES_SELECT, toProfileRoles } from "../lib/profileRoles";
import type { AuthorSummary, PageSummary } from "../types/database";
import {
  normalizeProjectSlug,
  isValidProjectSlugFormat,
} from "../lib/projectLinks";

// ------------------------------------------------------------
// Types — mirror the projects table after ako_projects_v3_media_url_privacy.sql
// ------------------------------------------------------------

// 'cancelled' only applies to event/meeting — set when a host cancels
// an upcoming one that already has paid attendees (see cancelled_at
// below). Other types go active <-> draft/archived only.
export type ProjectStatus = "active" | "draft" | "archived" | "cancelled";

// 'audio' and 'video' were merged into a single 'media' type (a media
// project can carry an audio channel, a video channel, or both — see
// MediaDetails in useProjectTypeDetails.ts). 'url' is new: a bare
// link the host is selling access to (a WhatsApp group invite, a
// gated page, anything).
export type ProjectType =
  | "event"
  | "media"
  | "file"
  | "url"
  | "course"
  | "room"
  | "meeting"
  | "gig"
  | "pitch"
  | "book";

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  event: "Event",
  media: "Media",
  file: "File",
  url: "URL",
  course: "Course",
  room: "Cohort",
  meeting: "Meeting",
  gig: "Gig",
  pitch: "Pitch",
  book: "Book",
};

// Order to show in the type picker.
export const PROJECT_TYPE_OPTIONS: ProjectType[] = [
  "gig",
  "pitch",
  "event",
  "meeting",
  "room",
  "course",
  "book",
  "media",
  "file",
  "url",
];

// Short helper text shown under the type picker once a type is chosen —
// keeps the picker itself uncluttered while still orienting the host.
export const PROJECT_TYPE_HINTS: Record<ProjectType, string> = {
  event: "Sell tickets to something happening in person or online.",
  meeting: "A single scheduled live session people buy access to join.",
  room: "A structured learning group with a start and end date — lectures, live meetings, assignments, and its own chat.",
  course: "Structured modules and lessons. Build it, then publish when ready.",
  media: "Audio, video, or both. Link out (Spotify, YouTube) or upload to stream here.",
  file: "A file you upload and host here — visitors download it with one click.",
  url: "A link you're selling access to — a WhatsApp group, a page, anything.",
  gig: "A skill or service you offer. Show proof of work, get messaged or booked.",
  pitch:
    "Share an idea and let people support it — not an investment, just backing. No price tag; supporters back it for any amount and keep whatever's raised regardless of the goal.",
  book: "A book or article. Link out, upload a PDF for download, or let people read it right here.",
};

// Which posting identity each type is restricted to — see
// projects_page_authorship_migration.sql for the schema/RLS side of
// this. The split follows one rule: does this type represent one
// person's individual expertise/time (personal), or does it benefit
// from a team/organizational identity behind it (page)? 'url' is a
// bare link either kind of identity can sell equally, so it's the
// only 'either'.
export type ProjectAccess = "page" | "personal" | "either";

export const PROJECT_TYPE_ACCESS: Record<ProjectType, ProjectAccess> = {
  // Page-only — benefits from a team/brand identity behind it.
  event: "page",
  room: "page",
  course: "page",
  // Personal-only — inherently about one person's own time/skill/work
  // or, for pitch, one person's own idea.
  gig: "personal",
  meeting: "personal",
  media: "personal",
  file: "personal",
  pitch: "personal",
  // Either — a personal author and a publisher/organization page can
  // both reasonably post a book.
  book: "either",
  // Either.
  url: "either",
};

export function getAllowedProjectTypes(mode: "personal" | "page"): ProjectType[] {
  return PROJECT_TYPE_OPTIONS.filter(
    (type) => PROJECT_TYPE_ACCESS[type] === "either" || PROJECT_TYPE_ACCESS[type] === mode
  );
}

// ------------------------------------------------------------
// Per-type on/off switch + achievement-gated access, set by admins
// (see ako_admin_project_type_controls_migration.sql and
// useAdmin.ts). Both tables are public-read so any signed-in user's
// CreateProject screen can filter/explain without an admin-only call.
// ------------------------------------------------------------
export interface ProjectTypeActiveSetting {
  project_type: ProjectType;
  is_active: boolean;
  hide_when_ineligible: boolean;
}

// Which types are currently switched on. Defaults to "all active"
// while loading so the picker doesn't flash empty/wrong on first
// render — the real list swaps in once the query resolves.
export function useActiveProjectTypes() {
  return useQuery({
    queryKey: ["project-type-settings"],
    queryFn: async (): Promise<ProjectTypeActiveSetting[]> => {
      const { data, error } = await supabase
        .from("project_type_settings")
        .select("project_type, is_active, hide_when_ineligible");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export interface ProjectTypeAccessRule {
  project_type: ProjectType;
  min_follower_count: number;
  min_account_age_days: number;
  min_total_engagement: number;
}

export function useProjectTypeAccessRules() {
  return useQuery({
    queryKey: ["project-type-access-rules"],
    queryFn: async (): Promise<ProjectTypeAccessRule[]> => {
      const { data, error } = await supabase
        .from("project_type_access_rules")
        .select("project_type, min_follower_count, min_account_age_days, min_total_engagement");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

// The stats an achievement rule is checked against, for the
// currently signed-in user. account_age_days is computed client-side
// from created_at — fine for UI messaging; the real gate is the
// enforce_project_type_rules trigger on the server, which computes it
// fresh at insert time.
export interface MyEligibilityStats {
  follower_count: number;
  account_age_days: number;
  total_engagement: number;
}

export function useMyEligibilityStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-eligibility-stats", user?.id],
    queryFn: async (): Promise<MyEligibilityStats> => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("follower_count, created_at")
        .eq("id", user!.id)
        .single();
      if (profileError) throw profileError;

      const { data: engagement, error: engagementError } = await supabase.rpc(
        "get_user_total_engagement",
        { target_user: user!.id }
      );
      if (engagementError) throw engagementError;

      const accountAgeMs = Date.now() - new Date(profile.created_at).getTime();

      return {
        follower_count: profile.follower_count,
        account_age_days: Math.floor(accountAgeMs / (1000 * 60 * 60 * 24)),
        total_engagement: engagement ?? 0,
      };
    },
    enabled: !!user,
  });
}

// Whether an admin has granted the current user a full pass on
// project_type_access_rules (see project_type_rule_exemptions).
// `undefined` while loading — treated as "not exempt yet" by callers
// so a warning doesn't briefly disappear then reappear.
export function useMyProjectTypeExemption() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-project-type-exemption", user?.id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("project_type_rule_exemptions")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
  });
}

export interface ProjectTypeEligibility {
  eligible: boolean;
  // Empty when eligible — otherwise one entry per unmet requirement,
  // e.g. "You need 50 more followers".
  reasons: string[];
}

// Combines a project type's rule with the caller's own stats. Returns
// `undefined` while either query is still loading, so callers can
// tell "don't know yet" apart from "eligible" — useful to avoid
// flashing a false-negative warning on first render. `isExempt`
// short-circuits straight to eligible, regardless of rules/stats —
// an admin-granted exemption always wins.
export function getProjectTypeEligibility(
  type: ProjectType,
  rules: ProjectTypeAccessRule[] | undefined,
  stats: MyEligibilityStats | undefined,
  isExempt?: boolean
): ProjectTypeEligibility | undefined {
  if (isExempt) return { eligible: true, reasons: [] };
  if (!rules || !stats) return undefined;

  const rule = rules.find((r) => r.project_type === type);
  if (!rule) return { eligible: true, reasons: [] };

  const reasons: string[] = [];

  if (stats.follower_count < rule.min_follower_count) {
    reasons.push(
      `You need at least ${rule.min_follower_count} followers (you have ${stats.follower_count}).`
    );
  }
  if (stats.account_age_days < rule.min_account_age_days) {
    reasons.push(
      `Your account needs to be at least ${rule.min_account_age_days} days old (it's ${stats.account_age_days}).`
    );
  }
  if (stats.total_engagement < rule.min_total_engagement) {
    reasons.push(
      `You need at least ${rule.min_total_engagement} total engagement across your posts (you have ${stats.total_engagement}).`
    );
  }

  return { eligible: reasons.length === 0, reasons };
}

// Combines everything above into the actual list CreateProject's
// picker should render: personal/page split, admin on/off, and
// per-type hide-vs-show-locked for users who don't qualify yet.
// Returns `allowedTypes` unfiltered by eligibility while rules/stats
// are still loading, so the picker doesn't flicker between two
// different lists on first render.
export function getVisibleProjectTypes(
  mode: "personal" | "page",
  typeSettings: ProjectTypeActiveSetting[] | undefined,
  rules: ProjectTypeAccessRule[] | undefined,
  stats: MyEligibilityStats | undefined,
  isExempt?: boolean
): ProjectType[] {
  return getAllowedProjectTypes(mode).filter((type) => {
    const setting = typeSettings?.find((s) => s.project_type === type);
    if (setting && !setting.is_active) return false;
    if (isExempt || !setting?.hide_when_ineligible) return true;

    const eligibility = getProjectTypeEligibility(type, rules, stats, isExempt);
    // Unknown yet → don't hide it prematurely.
    return eligibility ? eligibility.eligible : true;
  });
}

export interface Project {
  id: string;
  owner_id: string;
  // Overlay attribution, same relationship as posts.posted_as_page_id
  // to posts.author_id — owner_id is still always the creating user;
  // this marks which page (if any) the project is attributed to.
  posted_as_page_id: string | null;
  title: string;
  description: string | null;
  external_url: string | null;
  file_path: string | null;
  thumbnail_url: string | null;
  thumbnail_width: number | null;
  thumbnail_height: number | null;
  project_type: ProjectType;
  price_usd: number;
  promo_price_usd: number | null;
  status: ProjectStatus;
  is_active: boolean;
  // null while draft. A 'course' project can't be purchased until
  // this is set — enforced in the purchase edge function, not just
  // here — this field is what CreateProject/CourseBuilder show as
  // "Published" vs "Draft — not visible to buyers yet".
  published_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Set by the host, before or after publishing. Doesn't gate direct
  // access (a private project is still reachable by anyone with its
  // URL, same as before) — it only controls whether the project is
  // surfaced anywhere the host didn't hand out directly: their
  // profile's Projects tab (to visitors), and the "similar projects"
  // rails. See useUserProjects/useSimilarProjects below.
  is_private: boolean;
  like_count: number;
  // Public link alias — see src/lib/projectLinks.ts. Never the
  // canonical identity (id always is); null until the owner sets one
  // in the "Custom URL" section of Edit. Globally unique.
  slug: string | null;
}

// --------------------------------------------------------
// Effective price helpers — "effective" means what the buyer
// actually pays / what determines "free" status. A promo price,
// when set, always wins over the listed price_usd.
//
// NOTE: the purchase-project and get-project-file edge functions,
// and ProjectCard's own display logic, all need to agree on this
// same definition — see the migration file's note on this.
// --------------------------------------------------------

export function getEffectivePrice(project: Pick<Project, "price_usd" | "promo_price_usd">): number {
  return project.promo_price_usd ?? project.price_usd;
}

export function isProjectFree(project: Pick<Project, "price_usd" | "promo_price_usd">): boolean {
  return getEffectivePrice(project) <= 0;
}

export function hasActivePromo(project: Pick<Project, "price_usd" | "promo_price_usd">): boolean {
  return project.promo_price_usd !== null && project.promo_price_usd !== undefined;
}


// --------------------------------------------------------
// Fetch a single project — used by the Edit page to prefill the form.
// --------------------------------------------------------
export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Project> => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!projectId,
  });
}


// --------------------------------------------------------
// Fetch a user's projects.
//
// `includeAllStatuses` should be true ONLY when the viewer is the
// owner and NOT previewing their profile as a visitor — that's what
// lets an owner see their own drafts/archived projects to manage
// them. Everyone else (including the owner in "view as visitor"
// preview mode) should only ever see status = 'active'.
//
// IMPORTANT — this filter is enforced client-side here, but the
// real security boundary has to be the table's RLS policy. If the
// existing RLS policy on `projects` filters SELECT to is_active = true
// unconditionally, an owner's own drafts/archived rows won't come
// back from Supabase at all regardless of this query — that policy
// needs updating to allow owner_id = auth.uid() through regardless
// of status, while still restricting everyone else to status =
// 'active'. Flagging this since I haven't seen that policy's SQL.
// --------------------------------------------------------
// includeAllStatuses does double duty as "is this the owner's own
// management view" — the same view that's allowed to see drafts and
// archived projects is the one allowed to see private ones too, so a
// visitor (or the owner previewing their profile as a visitor) never
// sees either... EXCEPT (item 5) when that visitor has a concrete
// access grant on a specific private project (bought it, was added
// as a member, joined its room, holds a live ticket) — previously
// this branch's flat `.eq("is_private", false)` hid those from the
// profile's Projects tab unconditionally, so the only way to reach a
// private project you already had access to was the direct URL. Now
// routed through get_profile_projects (sql/28_profile_projects_visibility.sql),
// which folds that access check in server-side. Direct access by
// id/URL (useProject, useProjectDetail) was already, and still is,
// NOT filtered by is_private — privacy only affects what gets listed.
//
// Projects published as a Page belong to that Page's own Projects tab
// (usePageProjects), not the creator's personal profile — so they're
// excluded here (and in get_profile_projects on the server). The
// creator's Archive screen passes includePageProjects so an archived
// page project can still be found and restored.
export function useUserProjects(
  userId: string,
  includeAllStatuses: boolean,
  { includePageProjects = false }: { includePageProjects?: boolean } = {}
) {
  const { user: viewer } = useAuth();

  return useQuery({
    queryKey: [
      "user-projects",
      userId,
      includeAllStatuses,
      includeAllStatuses ? undefined : viewer?.id,
      includePageProjects,
    ],
    queryFn: async (): Promise<Project[]> => {
      if (includeAllStatuses) {
        let query = supabase.from("projects").select("*").eq("owner_id", userId);
        if (!includePageProjects) query = query.is("posted_as_page_id", null);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc("get_profile_projects", {
        p_profile_id: userId,
        p_viewer_id: viewer?.id ?? null,
      });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: !!userId,
  });
}


/**
 * Projects attributed to a Page (posted_as_page_id) — the Projects tab on
 * /page/:username. Goes through get_page_projects (see
 * supabase/ako_page_projects_listing.sql) because RLS alone can't express
 * "public to everyone, plus the creator's own drafts". Viewer-dependent, so
 * the viewer id is part of the cache key.
 */
export function usePageProjects(pageId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["page-projects", pageId, user?.id],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase.rpc("get_page_projects", { p_page_id: pageId });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
    enabled: !!pageId,
  });
}

// Per-type detail payloads — only the block matching project_type
// should be passed; the others stay undefined. Room and Course don't
// take detail input at creation time: a Room has nothing to configure
// beyond the base project fields, and a Course's modules/lessons are
// built afterward in the Course builder (see published_at note above —
// it can't be purchased until the host explicitly publishes it there).
interface EventDetailsInput {
  event_date?: string; // ISO — omit for "date TBA"
  location_type: "physical" | "online";
  location_value: string;
  ticket_template_url?: string;
}

interface MeetingDetailsInput {
  scheduled_at: string; // ISO
  recording_enabled?: boolean;
}

// A 'media' project's audio/video/image channels — see MediaDetails
// in useProjectTypeDetails.ts for the full shape/invariants. Channel
// fields are only meaningful when the matching has_* flag is true.
interface MediaDetailsInput {
  has_audio: boolean;
  has_video: boolean;
  has_image: boolean;
  audio_source?: "link" | "upload";
  audio_url?: string;
  audio_file_path?: string;
  video_source?: "link" | "upload";
  video_url?: string;
  video_file_path?: string;
  image_source?: "link" | "upload";
  image_url?: string;
  image_file_path?: string;
}

// A 'gig' is a portfolio/service listing rather than a pre-made
// asset — sample_project_ids points at the owner's own other
// projects (any type) as proof-of-work, shown as a samples strip on
// the gig's detail page. price_usd = 0 means "Message to inquire"
// only; > 0 additionally offers a payable deposit/booking fee via
// the existing purchase flow (see PROJECT_TYPE_HINTS.gig).
// role_id is required going forward (see AKO_DYNAMIC_PROFILE_PORTFOLIOS
// spec) — it's what lets this Gig surface as a dynamic profile category
// (e.g. a Cinematographer gig → the profile's "Film" tab). Optional only
// in the type because a handful of pre-migration gigs have it null.
interface GigDetailsInput {
  role_id?: string;
  tagline?: string;
  delivery_estimate?: string;
  sample_project_ids?: string[];
  revisions_included?: number;
  deliverables?: string[];
  faq?: { question: string; answer: string }[];
}

interface RoomDetailsInput {
  start_date?: string;
  end_date?: string;
}

// A 'book' offers a link, an uploaded PDF, or is written entirely
// in-app (content_source picks exactly one, mirroring media's
// link-or-upload split — see project_book_details_content_matches_source
// in the migration). allow_download / allow_read_in_app are only
// meaningful when content_source = 'upload'. is_own_work = false means
// the host is publishing someone else's work with credit — the
// server (trg_enforce_book_no_monetization) rejects any nonzero price
// in that case, not just this form. 'authored' books are created here
// as an empty draft (same as course) and built afterward in the Book
// builder (useBookBuilder.ts) — this input just reserves book_type/
// is_own_work/author fields for them.
interface BookDetailsInput {
  book_type: "book" | "article";
  content_source: "link" | "upload" | "authored";
  author_name?: string;
  is_own_work: boolean;
  source_credit?: string;
  external_url?: string;
  file_path?: string;
  allow_download?: boolean;
  allow_read_in_app?: boolean;
  page_count?: number;
}

interface CreateProjectInput {
  title: string;
  description?: string;
  external_url?: string;
  file_path?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  project_type: ProjectType;
  price_usd: number;
  promo_price_usd?: number | null;
  status?: ProjectStatus;   // defaults to 'active' (publish immediately) if omitted
  is_private?: boolean;     // defaults to false (listed/discoverable) if omitted
  // Which page this project is attributed to, if posted in page mode —
  // see PROJECT_TYPE_ACCESS above for which types this is required/
  // disallowed for. RLS (projects_page_authorship_migration.sql)
  // enforces the caller is actually an active member of this page —
  // this is never trusted client-side alone.
  posted_as_page_id?: string;
  topic_ids?: string[];
  event_details?: EventDetailsInput;
  meeting_details?: MeetingDetailsInput;
  media_details?: MediaDetailsInput;
  gig_details?: GigDetailsInput;
  room_details?: RoomDetailsInput;
  book_details?: BookDetailsInput;
}

export function useCreateProject() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      topic_ids,
      event_details,
      meeting_details,
      media_details,
      gig_details,
      room_details,
      book_details,
      ...input
    }: CreateProjectInput) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("projects")
        .insert({ ...input, owner_id: user.id })
        .select()
        .single();
      if (error) throw error;

      if (topic_ids && topic_ids.length > 0) {
        const rows = topic_ids.map((interest_id) => ({ project_id: data.id, interest_id }));
        const { error: topicsError } = await supabase.from("project_topics").insert(rows);
        // The project itself is already created at this point — a
        // topic-write failure shouldn't silently produce an
        // untagged project the owner thinks is tagged, so surface it.
        if (topicsError) throw topicsError;
      }

      // Type-specific detail row. Same reasoning as topics above: the
      // project row already exists, so a failure here needs to surface
      // rather than leave a silently incomplete Event/Meeting/Media.
      if (input.project_type === "event" && event_details) {
        const { error: detailsError } = await supabase
          .from("project_event_details")
          .insert({ project_id: data.id, ...event_details });
        if (detailsError) throw detailsError;
      }
      if (input.project_type === "meeting" && meeting_details) {
        const { error: detailsError } = await supabase
          .from("project_meeting_details")
          .insert({ project_id: data.id, ...meeting_details });
        if (detailsError) throw detailsError;
      }
      if (input.project_type === "media" && media_details) {
        const { error: detailsError } = await supabase
          .from("project_media_details")
          .insert({ project_id: data.id, ...media_details });
        if (detailsError) throw detailsError;
      }
      if (input.project_type === "gig" && gig_details) {
        const { sample_project_ids, ...gigRow } = gig_details;
        const { error: detailsError } = await supabase
          .from("project_gig_details")
          .insert({ project_id: data.id, ...gigRow });
        if (detailsError) throw detailsError;

        if (sample_project_ids && sample_project_ids.length > 0) {
          const rows = sample_project_ids.map((sample_project_id, i) => ({
            gig_project_id: data.id,
            sample_project_id,
            sort_order: i,
          }));
          const { error: samplesError } = await supabase.from("project_gig_samples").insert(rows);
          if (samplesError) throw samplesError;
        }
      }
      if (input.project_type === "room") {
        // Always create the details row, even with no dates set yet —
        // it's also where the group chat's conversation_id and
        // moderation toggles live, so a Cohort should never be
        // without one.
        const { error: detailsError } = await supabase
          .from("project_room_details")
          .insert({ project_id: data.id, ...room_details });
        if (detailsError) throw detailsError;
      }
      if (input.project_type === "book" && book_details) {
        const { error: detailsError } = await supabase
          .from("project_book_details")
          .insert({ project_id: data.id, ...book_details });
        if (detailsError) throw detailsError;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      queryClient.invalidateQueries({ queryKey: ["page-projects"] });
    },
  });
}

interface CreatePitchProjectInput {
  title: string;
  description?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  is_private?: boolean;
  posted_as_page_id?: string;
  goal_amount_usd: number;
  topic_ids?: string[];
}

// Pitch is created through its own RPC, not the shared insert above —
// a Pitch is really two projects (the pitch itself + an auto-
// provisioned, private update Room every supporter joins on backing)
// plus a project_pitch_details row, and doing that as three
// sequential client-side inserts risks an orphaned Room if a later
// step fails. create_pitch_project (ako_projects_v8_pitch.sql) does
// all three in one transaction instead.
export function useCreatePitchProject() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ topic_ids, ...input }: CreatePitchProjectInput) => {
      const { data, error } = await supabase.rpc("create_pitch_project", {
        p_title: input.title,
        p_description: input.description ?? null,
        p_thumbnail_url: input.thumbnail_url ?? null,
        p_thumbnail_width: input.thumbnail_width ?? null,
        p_thumbnail_height: input.thumbnail_height ?? null,
        p_is_private: input.is_private ?? false,
        p_posted_as_page_id: input.posted_as_page_id ?? null,
        p_goal_amount_usd: input.goal_amount_usd,
      });
      if (error) throw error;

      const pitchProjectId = data as string;

      if (topic_ids && topic_ids.length > 0) {
        const rows = topic_ids.map((interest_id) => ({ project_id: pitchProjectId, interest_id }));
        const { error: topicsError } = await supabase.from("project_topics").insert(rows);
        if (topicsError) throw topicsError;
      }

      return pitchProjectId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      queryClient.invalidateQueries({ queryKey: ["page-projects"] });
    },
  });
}


interface UpdateProjectInput {
  id: string;
  title?: string;
  description?: string | null;
  external_url?: string | null;
  file_path?: string | null;
  thumbnail_url?: string | null;
  thumbnail_width?: number | null;
  thumbnail_height?: number | null;
  project_type?: ProjectType;
  price_usd?: number;
  promo_price_usd?: number | null;
  status?: ProjectStatus;
  is_private?: boolean;
  // undefined = leave topics untouched (e.g. a status-only change).
  // An array — including [] — replaces the full topic set.
  topic_ids?: string[];
}

// Full edit — content fields, price, and optionally status all in
// one save from the Edit page.
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ id, topic_ids, ...patch }: UpdateProjectInput) => {
      const { data, error } = await supabase
        .from("projects")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      if (topic_ids !== undefined) {
        const { error: deleteError } = await supabase
          .from("project_topics")
          .delete()
          .eq("project_id", id);
        if (deleteError) throw deleteError;

        if (topic_ids.length > 0) {
          const rows = topic_ids.map((interest_id) => ({ project_id: id, interest_id }));
          const { error: insertError } = await supabase.from("project_topics").insert(rows);
          if (insertError) throw insertError;
        }
      }

      return data as Project;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      queryClient.invalidateQueries({ queryKey: ["page-projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", data.id] });
      queryClient.invalidateQueries({ queryKey: ["project-topics", data.id] });
      queryClient.invalidateQueries({ queryKey: ["project-detail", data.id] });
      queryClient.invalidateQueries({ queryKey: ["similar-projects"] });
    },
  });
}

// --------------------------------------------------------
// Public project links (custom URLs / slugs) — see
// AKO_CUSTOM_PROJECT_LINKS_AND_PUBLIC_SLUGS.md and
// src/lib/projectLinks.ts for the URL-building side of this. Slugs
// are globally unique (not per-creator) — see the
// global_project_slugs migration. All the actual
// validation/uniqueness/history bookkeeping lives server-side in
// check_project_slug_available / set_project_slug /
// resolve_project_slug — these hooks are thin wrappers.
// --------------------------------------------------------

// Debounced-by-the-caller live availability check, same pattern as
// CreatePage.tsx's username check — UX only. set_project_slug is what
// actually enforces this server-side, so a stale "available" here
// (someone else claims it in the gap between typing and saving)
// still surfaces as a clear error from the mutation below.
export function useCheckProjectSlugAvailable(
  slug: string,
  excludeProjectId: string | undefined
) {
  const normalized = normalizeProjectSlug(slug);
  return useQuery({
    queryKey: ["project-slug-available", normalized, excludeProjectId],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("check_project_slug_available", {
        p_slug: normalized,
        p_exclude_project_id: excludeProjectId ?? null,
      });
      if (error) throw error;
      return data as boolean;
    },
    enabled: isValidProjectSlugFormat(normalized),
    staleTime: 0,
  });
}

// A handful of available alternatives to offer when the requested
// custom URL is taken — "calling" (taken) -> "calling-ava",
// "avacalling", "calling0001", etc. Purely a suggestion; the
// available-check above (and set_project_slug) remain authoritative.
export function useSuggestProjectSlugAlternatives(
  slug: string,
  username: string | undefined,
  enabled: boolean
) {
  const normalized = normalizeProjectSlug(slug);
  return useQuery({
    queryKey: ["project-slug-suggestions", normalized, username],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("suggest_project_slug_alternatives", {
        p_slug: normalized,
        p_username: username ?? null,
        p_limit: 4,
      });
      if (error) throw error;
      return (data as string[]) ?? [];
    },
    enabled: enabled && isValidProjectSlugFormat(normalized),
    staleTime: 0,
  });
}

export function useSetProjectSlug() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ projectId, slug }: { projectId: string; slug: string }) => {
      const { data, error } = await supabase.rpc("set_project_slug", {
        p_project_id: projectId,
        p_slug: normalizeProjectSlug(slug),
      });
      if (error) throw new Error(error.message);
      return data as Project;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project", data.id] });
      queryClient.invalidateQueries({ queryKey: ["project-detail", data.id] });
      queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      queryClient.invalidateQueries({ queryKey: ["page-projects"] });
    },
  });
}

// Resolves a public /:slug address — see ProjectBySlug.tsx, the only
// caller. Slugs are global, so this needs nothing but the slug
// itself. A stale/retired slug still resolves (to the same project,
// with its current slug attached) so the caller can redirect to the
// up-to-date link; a slug that never existed, or points at something
// the viewer can't see, comes back as `null` either way — that
// ambiguity is intentional server-side (see resolve_project_slug's
// comment).
export function useResolveProjectSlug(slug: string | undefined) {
  return useQuery({
    queryKey: ["resolve-project-slug", slug],
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase.rpc("resolve_project_slug", {
        p_slug: slug,
      });
      if (error) throw error;
      const rows = data as Project[];
      return rows?.[0] ?? null;
    },
    enabled: !!slug,
  });
}

// Quick status-only transition — used by the kebab menu on
// ProjectCard for one-tap Publish / Unpublish / Archive / Restore,
// without opening the full edit form. The sync_project_status
// trigger (from the migration) keeps is_active in lockstep with
// whatever status is written here.
export function useSetProjectStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    // Drives LoadingOverlay (see meta.blocking there) — was missing
    // entirely before, so archiving/restoring a project via the
    // kebab menu gave no loading feedback at all, on top of the
    // premature-settle issue fixed by the awaited onSuccess below.
    meta: { blocking: true },
    mutationFn: async ({ id, status }: { id: string; status: ProjectStatus }) => {
      const { error } = await supabase.from("projects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    // Awaited so the mutation (and therefore the overlay) doesn't
    // settle until the list that's supposed to lose/gain this project
    // has actually refetched — see useDeletePost's onSuccess in
    // usePosts.ts for the full reasoning; same fix, same bug.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-projects"] }),
        queryClient.invalidateQueries({ queryKey: ["page-projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project"] }),
      ]);
    },
  });
}


/**
 * Hard-deletes a project via the delete-project edge function.
 * Goes through an edge function rather than direct RLS because it
 * needs to distinguish "no purchases, delete succeeded" from "this
 * project has purchase history and can't be removed" and return a
 * clear message for the latter rather than a raw FK error.
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (projectId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-project", {
        body: { project_id: projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    // Awaited — same reasoning as useSetProjectStatus/useDeletePost:
    // without this, the overlay could close a beat before the
    // deleted project actually drops out of the list.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["page-projects"] });
    },
  });
}

export function useHasPurchased(projectId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["has-purchased", projectId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("purchases")
        .select("id")
        .eq("project_id", projectId)
        .eq("buyer_id", user.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });
}

export function usePurchaseProject() {
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (projectId: string) => {
      const { data, error } = await supabase.functions.invoke("purchase-project", {
        body: { project_id: projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.purchase;
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["has-purchased", projectId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      play("unlock-success");
    },
  });
}

// Gigs go through their own edge function rather than purchase-project
// directly — a gig "purchase" is a booking-fee deposit that also needs
// to drop the buyer straight into a conversation with the host, which
// none of the other project types need. book-gig calls purchase-project
// internally for the actual money movement, then creates/reuses the
// direct conversation and seeds an opening message. See book-gig/index.ts.
export function useBookGig() {
  const queryClient = useQueryClient();
  const { play } = useSound();

  return useMutation({
    meta: { blocking: true },
    mutationFn: async (projectId: string): Promise<{ conversationId: string }> => {
      const { data, error } = await supabase.functions.invoke("book-gig", {
        body: { project_id: projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { conversationId: data.conversation_id };
    },
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["has-purchased", projectId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      play("unlock-success");
    },
  });
}

/**
 * Fetches a short-lived signed URL for a project's hosted file.
 * The edge function itself is the access gate (owner/free/purchased) —
 * this hook just calls it and surfaces the result or the rejection.
 *
 * `kind` tells the edge function which stored path to sign:
 *  - "file"  → projects.file_path            (File-type projects)
 *  - "audio" → project_media_details.audio_file_path
 *  - "video" → project_media_details.video_file_path
 *  - "image" → project_media_details.image_file_path
 *  - "book"  → project_book_details.file_path (content_source='upload' Book projects)
 * Defaults to "file" for existing call sites. NOTE: the deployed
 * get-project-file function needs to be updated to branch on this —
 * see the note in project-types/MediaFields.tsx / README.
 *
 * `action` only matters for kind: "book" — a book's uploaded PDF can
 * be allowed for download, in-app reading, both, or neither
 * (allow_download / allow_read_in_app), independently. The edge
 * function checks the matching column for whichever action was
 * requested, in addition to the usual owner/free/purchased gate.
 */
export function useGetProjectFile() {
  return useMutation({
    mutationFn: async ({
      projectId,
      kind = "file",
      action = "download",
    }: {
      projectId: string;
      kind?: "file" | "audio" | "video" | "image" | "book";
      action?: "download" | "stream";
    }): Promise<string> => {
      const { data, error } = await supabase.functions.invoke("get-project-file", {
        body: { project_id: projectId, kind, action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.url;
    },
  });
}

// --------------------------------------------------------
// Topic tags (project_topics) — mirrors post_topics. Fetched
// separately from the project row itself so the Edit form can
// prefill its topic picker independently of the rest of hydration.
// --------------------------------------------------------
export function useProjectTopics(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-topics", projectId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("project_topics")
        .select("interest_id")
        .eq("project_id", projectId);
      if (error) throw error;
      return data.map((row) => row.interest_id);
    },
    enabled: !!projectId,
  });
}

// --------------------------------------------------------
// Project detail page — the project itself plus its creator's byline
// (avatar, name, tier, job/hobby tags) and its topic tags, so a
// visitor landing on a shared project link can tap through to the
// creator's profile and see what it's tagged under.
// --------------------------------------------------------
export type ProjectWithOwner = Project & {
  owner: AuthorSummary;
  // Set when the project was created in page mode (see
  // CreateProject.tsx / projects_page_authorship_migration.sql).
  // When present, the byline should show this in place of owner —
  // brand/org name where a name would go, "Brand"/"Organization"
  // where a job/hobby line would go — not "owner posted as page".
  posted_as_page: PageSummary | null;
  topics: { id: string; name: string }[];
};

const PROJECT_WITH_OWNER_SELECT = `*, owner:profiles!projects_owner_id_fkey(id, username, display_name, avatar_url, tier, ${PROFILE_ROLES_SELECT}), posted_as_page:pages(id, username, name, avatar_url, page_type, is_verified), topics:project_topics(interest:interests(id, name))`;

export function useProjectDetail(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: async (): Promise<ProjectWithOwner> => {
      const { data, error } = await supabase
        .from("projects")
        .select(PROJECT_WITH_OWNER_SELECT)
        .eq("id", projectId)
        .single();
      if (error) throw error;

      const raw = data as any;
      const { profile_roles, ...owner } = raw.owner;
      return {
        ...raw,
        owner: { ...owner, roles: toProfileRoles(profile_roles) },
        posted_as_page: raw.posted_as_page ?? null,
        topics: (raw.topics ?? []).map((t: any) => t.interest),
      };
    },
    enabled: !!projectId,
  });
}

/**
 * "Similar projects" for the detail page, ranked by three signals:
 * same creator, same project_type, and shared topics (project_topics).
 * Returned as three separate rails rather than one merged/scored
 * list — a real relevance score across signals needs an RPC to be
 * meaningful; naively interleaving three client-side arrays would
 * just be theater. Some overlap between rails is expected and fine
 * (a project can legitimately be both "from this creator" and "on
 * this topic") — same tradeoff most feeds make.
 */
export function useSimilarProjects(
  project:
    | (Pick<Project, "id" | "owner_id" | "project_type"> & { topics?: { id: string }[] })
    | undefined
) {
  return useQuery({
    queryKey: ["similar-projects", project?.id],
    queryFn: async (): Promise<{
      moreFromCreator: Project[];
      moreOfType: Project[];
      moreOnTopic: Project[];
    }> => {
      const topicIds = (project!.topics ?? []).map((t) => t.id);

      // is_private = false on every branch here — these rails are
      // discovery surfaces, exactly what a private project must stay
      // out of (see the is_private note on the Project type above).
      const [creatorRes, typeRes, topicLinkRes] = await Promise.all([
        supabase
          .from("projects")
          .select("*")
          .eq("owner_id", project!.owner_id)
          .eq("status", "active")
          .eq("is_private", false)
          .neq("id", project!.id)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("projects")
          .select("*")
          .eq("project_type", project!.project_type)
          .eq("status", "active")
          .eq("is_private", false)
          .neq("id", project!.id)
          .neq("owner_id", project!.owner_id) // avoid duplicating the "more from creator" list
          .order("created_at", { ascending: false })
          .limit(6),
        topicIds.length > 0
          ? supabase
              .from("project_topics")
              .select("project_id")
              .in("interest_id", topicIds)
              .neq("project_id", project!.id)
          : Promise.resolve({ data: [] as { project_id: string }[], error: null }),
      ]);
      if (creatorRes.error) throw creatorRes.error;
      if (typeRes.error) throw typeRes.error;
      if (topicLinkRes.error) throw topicLinkRes.error;

      let moreOnTopic: Project[] = [];
      const topicProjectIds = Array.from(
        new Set((topicLinkRes.data ?? []).map((row) => row.project_id))
      );
      if (topicProjectIds.length > 0) {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .in("id", topicProjectIds)
          .eq("status", "active")
          .eq("is_private", false)
          .order("created_at", { ascending: false })
          .limit(6);
        if (error) throw error;
        moreOnTopic = data;
      }

      return { moreFromCreator: creatorRes.data, moreOfType: typeRes.data, moreOnTopic };
    },
    enabled: !!project,
  });
}
