// src/hooks/useDiscoverBrowse.ts
//
// Data + display rules for the structured Discover page: one short, swipeable row
// per kind of content (events, courses, books, …), each with a "More" door into a
// full, paginated list of just that kind. Restricted and full accounts read the
// same data through the same hooks — projects are publicly readable (RLS:
// is_active = true), and a private project is never listed here.
//
// Time-bound kinds (events, live meetings, cohorts) list only what is still ahead,
// soonest first. Everything else is ranked by likes, then recency.
import { useInfiniteQuery, useQueries } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { formatUsd } from "../lib/money";
import { getEffectivePrice, isProjectFree, type Project, type ProjectType } from "./useProjects";
import type { PageSearchResult } from "./useSearch";

/** Tiles per row on Discover. One extra row is fetched to know whether "More" has anywhere to go. */
export const RAIL_SIZE = 10;
/** Tiles per page on the "More" screen. */
export const MORE_PAGE_SIZE = 18;

export interface DiscoverSection {
  type: ProjectType;
  title: string;
}

// Order = order on the page. Titles follow the app's own labels (a "room" project is called a Cohort everywhere).
export const DISCOVER_SECTIONS: DiscoverSection[] = [
  { type: "event", title: "Events" },
  { type: "course", title: "Courses" },
  { type: "book", title: "Books" },
  { type: "room", title: "Cohorts" },
  { type: "meeting", title: "Live meetings" },
  { type: "media", title: "Audio & video" },
  { type: "gig", title: "Gigs" },
  { type: "pitch", title: "Pitches" },
  { type: "file", title: "Files" },
  { type: "url", title: "Links" },
];

export type DiscoverSectionKey = ProjectType | "pages";

export function getDiscoverSectionTitle(key: string): string | null {
  if (key === "pages") return "Pages";
  return DISCOVER_SECTIONS.find((s) => s.type === key)?.title ?? null;
}

export interface DiscoverItem {
  project: Project;
  /** Event date / meeting time / cohort start — only for the time-bound kinds. */
  when: string | null;
}

export interface DiscoverPage {
  items: DiscoverItem[];
  /** Rows the first query returned, before hidden/private projects were dropped. A full page means there may be more. */
  rawCount: number;
}

type TimedType = "event" | "meeting" | "room";
const TIMED: Record<TimedType, { table: string; col: string }> = {
  event: { table: "project_event_details", col: "event_date" },
  meeting: { table: "project_meeting_details", col: "scheduled_at" },
  room: { table: "project_room_details", col: "start_date" },
};

function isTimed(type: ProjectType): type is TimedType {
  return type === "event" || type === "meeting" || type === "room";
}

export async function fetchDiscoverPage(type: ProjectType, from: number, to: number): Promise<DiscoverPage> {
  if (isTimed(type)) {
    const { table, col } = TIMED[type];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    let q: any = supabase.from(table).select(`project_id, ${col}`);
    if (type === "event") q = q.gte("event_date", now);
    // A meeting that is live right now is still worth showing even though it has already started.
    if (type === "meeting") q = q.in("status", ["scheduled", "live"]).or(`scheduled_at.gte.${now},status.eq.live`);
    // A cohort is worth showing until it ends, not only until it starts.
    if (type === "room") q = q.gte("end_date", today);
    const { data: rows, error } = await q.order(col, { ascending: true }).range(from, to);
    if (error) throw error;

    const list = (rows ?? []) as Array<Record<string, any>>;
    if (list.length === 0) return { items: [], rawCount: 0 };

    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .in(
        "id",
        list.map((r) => r.project_id)
      )
      .eq("status", "active")
      .eq("is_active", true)
      .eq("is_private", false);
    if (projectsError) throw projectsError;

    const byId = new Map(((projects ?? []) as Project[]).map((p) => [p.id, p]));
    const items = list.flatMap((r) => {
      const project = byId.get(r.project_id);
      return project ? [{ project, when: (r[col] as string | null) ?? null }] : [];
    });
    return { items, rawCount: list.length };
  }

  let q = supabase
    .from("projects")
    .select("*")
    .eq("project_type", type)
    .eq("status", "active")
    .eq("is_active", true)
    .eq("is_private", false);
  // A course can't be bought until it is published, so it isn't discoverable before then either.
  if (type === "course") q = q.not("published_at", "is", null);
  const { data, error } = await q
    .order("like_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const projects = (data ?? []) as Project[];
  return { items: projects.map((project) => ({ project, when: null })), rawCount: projects.length };
}

export interface DiscoverRailData {
  section: DiscoverSection;
  items: DiscoverItem[];
  hasMore: boolean;
}

/**
 * Every Discover row at once. Kinds with nothing to show are left out, so the page only lists what exists.
 * (The admin per-type switch in project_type_settings governs *creating* new projects of a kind, not whether
 * existing public ones are visible — so it is deliberately not consulted here.)
 */
export function useDiscoverRails(): { rails: DiscoverRailData[]; isLoading: boolean } {
  const sections = DISCOVER_SECTIONS;

  const results = useQueries({
    queries: sections.map((s) => ({
      queryKey: ["discover-rail", s.type],
      queryFn: () => fetchDiscoverPage(s.type, 0, RAIL_SIZE),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const rails: DiscoverRailData[] = [];
  sections.forEach((section, i) => {
    const data = results[i]?.data;
    // A row that failed to load is simply absent — one bad query must not take the page down.
    if (!data || data.items.length === 0) return;
    rails.push({ section, items: data.items.slice(0, RAIL_SIZE), hasMore: data.rawCount > RAIL_SIZE });
  });
  return { rails, isLoading: results.some((r) => r.isLoading) };
}

/** The "More" screen for one kind of project: pages of MORE_PAGE_SIZE, loaded on request. */
export function useDiscoverMore(type: ProjectType, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["discover-more", type],
    queryFn: ({ pageParam }) => fetchDiscoverPage(type, pageParam, pageParam + MORE_PAGE_SIZE - 1),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.rawCount >= MORE_PAGE_SIZE ? all.length * MORE_PAGE_SIZE : undefined),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

const PAGE_RESULT_SELECT = "id, name, username, tagline, avatar_url, page_type, is_verified, follower_count";

/** The "More" screen for pages: every active page, biggest first. */
export function useDiscoverPagesMore(enabled = true) {
  return useInfiniteQuery({
    queryKey: ["discover-more", "pages"],
    queryFn: async ({ pageParam }): Promise<PageSearchResult[]> => {
      const { data, error } = await supabase
        .from("pages")
        .select(PAGE_RESULT_SELECT)
        .eq("is_active", true)
        .order("follower_count", { ascending: false })
        .range(pageParam, pageParam + MORE_PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as PageSearchResult[];
    },
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length >= MORE_PAGE_SIZE ? all.length * MORE_PAGE_SIZE : undefined),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Tile text
// ---------------------------------------------------------------------------

function formatWhen(value: string): string {
  // A bare date ("2026-11-03", cohorts) is a calendar day, not an instant — don't let the timezone shift it.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** The one muted line under a tile: when it happens, or what it costs. null = nothing worth saying. */
export function discoverTileMeta({ project, when }: DiscoverItem): string | null {
  const type = project.project_type;
  if (when && (type === "event" || type === "meeting")) return formatWhen(when) || null;
  if (when && type === "room") {
    const today = new Date().toISOString().slice(0, 10);
    return when <= today ? "Ongoing" : `Starts ${formatWhen(when)}`;
  }
  // Pitches have no price tag (backers choose any amount), and a free gig isn't a selling point.
  if (type === "pitch") return null;
  if (isProjectFree(project)) return type === "gig" ? null : "Free";
  return formatUsd(getEffectivePrice(project));
}
