// src/hooks/useDiscoverBrowse.ts
//
// Data + display rules for the structured Discover page: one short, swipeable row
// per kind of content (events, courses, books, …), each with a "More" door into a
// full, paginated list of just that kind. Restricted and full accounts read the
// same data through the same hooks — projects are publicly readable (RLS:
// is_active = true), and a private project is never listed here.
//
// Time-bound kinds (events, live meetings, cohorts) list only what is still ahead.
// Everything is ranked by relevance to the viewer's interests first, then popularity (likes).
// A project needs a title, description and thumbnail to be listed, and Files are never listed here.
import type { GroupKind } from "../lib/groups";
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
  /** Unique per row, and what the "More" link carries. Same as `type` except for the two group rows. */
  key: string;
  type: ProjectType;
  title: string;
  /** Group rows only: a community and a cohort are separate rows over the same project type. */
  kind?: GroupKind;
}

// Order = order on the page. Titles follow the app's own labels (a "room" project is a Group: a Community or a Cohort).
export const DISCOVER_SECTIONS: DiscoverSection[] = [
  { key: "event", type: "event", title: "Events" },
  { key: "course", type: "course", title: "Courses" },
  { key: "book", type: "book", title: "Books" },
  { key: "community", type: "room", kind: "community", title: "Communities" },
  { key: "cohort", type: "room", kind: "cohort", title: "Cohorts" },
  { key: "meeting", type: "meeting", title: "Live meetings" },
  { key: "media", type: "media", title: "Audio & video" },
  { key: "gig", type: "gig", title: "Talents" },
  { key: "pitch", type: "pitch", title: "Pitches" },
  { key: "url", type: "url", title: "Links" },
];

/** A section by its key. The old /topics/room link (before groups had two kinds) lands on Communities. */
export function getDiscoverSection(key: string): DiscoverSection | null {
  const k = key === "room" ? "community" : key;
  return DISCOVER_SECTIONS.find((s) => s.key === k) ?? null;
}

export type DiscoverSectionKey = string;

export function getDiscoverSectionTitle(key: string): string | null {
  if (key === "pages") return "Pages";
  return getDiscoverSection(key)?.title ?? null;
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

export async function fetchDiscoverPage(type: ProjectType, from: number, to: number, kind?: GroupKind): Promise<DiscoverPage> {
  // Ranking and eligibility live in the database (discover_projects): relevance to the viewer's interests first, then
  // popularity; only projects with a title, description and thumbnail; only what is still ahead for time-bound kinds.
  const { data, error } = await supabase.rpc("discover_projects", {
    p_type: type,
    p_offset: from,
    p_limit: to - from + 1,
    p_kind: kind ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ project: Project; when_at: string | null }>;
  return { items: rows.map((r) => ({ project: r.project, when: r.when_at })), rawCount: rows.length };
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
      queryKey: ["discover-rail", s.key],
      queryFn: () => fetchDiscoverPage(s.type, 0, RAIL_SIZE, s.kind),
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
export function useDiscoverMore(sectionKey: string, enabled = true) {
  const section = getDiscoverSection(sectionKey);
  return useInfiniteQuery({
    queryKey: ["discover-more", section?.key ?? sectionKey],
    queryFn: ({ pageParam }) => fetchDiscoverPage((section?.type ?? sectionKey) as ProjectType, pageParam, pageParam + MORE_PAGE_SIZE - 1, section?.kind),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.rawCount >= MORE_PAGE_SIZE ? all.length * MORE_PAGE_SIZE : undefined),
    staleTime: 5 * 60 * 1000,
    enabled: enabled && !!section,
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
  // Pitches have no price tag (backers choose any amount), and a free talent isn't a selling point.
  if (type === "pitch") return null;
  if (isProjectFree(project)) return type === "gig" ? null : "Free";
  return formatUsd(getEffectivePrice(project));
}
