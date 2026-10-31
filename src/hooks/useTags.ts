// src/hooks/useTags.ts
//
// The tag system's read side. "Interests", "topics" and "tags" are one thing (public.interests): people choose
// them (user_interests), content carries them (post_topics, project_topics, page_interests), hashtags resolve
// to them (hashtags.interest_id), and tag_relations connects them to each other. Everything here is a thin
// wrapper over the database functions that do the ranking, so web and native behave identically.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import type { PageSearchResult } from "./useSearch";

/** A tag as the UI needs to refer to it. `slug` is what goes in URLs. */
export interface TagRef {
  id: string;
  name: string;
  slug: string;
}

/** A tag offered as a chip. `reason` says why: yours, connected to yours, or simply popular. */
export interface TagChip extends TagRef {
  category_id: string | null;
  reason: "mine" | "related" | "popular";
  /** Projects + pages + people carrying it — chips with nothing behind them are never offered. */
  item_count: number;
}

/** Stable key for a set of tag ids (order-independent), for react-query keys. */
export function tagKey(ids: readonly string[] | null | undefined): string {
  return [...(ids ?? [])].sort().join(",");
}

/** Chips for the Discover page: the viewer's own interests first, then tags connected to them, then popular ones. */
export function useSuggestedTags(limit = 16) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["suggested-tags", user?.id, limit],
    queryFn: async (): Promise<TagChip[]> => {
      const { data, error } = await supabase.rpc("suggest_tags", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as TagChip[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

/** Resolves the slugs in a URL (?tag=a,b) to tags, in the same order. */
export function useTagsBySlug(slugs: string[]) {
  return useQuery({
    queryKey: ["tags-by-slug", slugs.join(",")],
    queryFn: async (): Promise<TagRef[]> => {
      const { data, error } = await supabase.from("interests").select("id, name, slug").eq("is_active", true).in("slug", slugs);
      if (error) throw error;
      const bySlug = new Map((data ?? []).map((t) => [t.slug as string, t as TagRef]));
      return slugs.flatMap((s) => (bySlug.has(s) ? [bySlug.get(s)!] : []));
    },
    enabled: slugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

/** A page as returned by tag-matched discovery — same shape as a page search result. */
export type TagPage = PageSearchResult;

/** Pages carrying these tags (or strongly connected ones), best match first. */
export async function fetchTagPages(ids: string[], offset: number, limit: number): Promise<TagPage[]> {
  const { data, error } = await supabase.rpc("discover_pages", { p_interest_ids: ids, p_offset: offset, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as TagPage[];
}

export function useTagPages(ids: string[], limit = 8) {
  return useQuery({
    queryKey: ["tag-pages", tagKey(ids), limit],
    queryFn: () => fetchTagPages(ids, 0, limit),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export interface TagPerson {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  tier: string | null;
  follower_count: number;
}

/** People who chose these tags (or strongly connected ones). Their interest lists stay private. */
export function useTagPeople(ids: string[], limit = 10) {
  return useQuery({
    queryKey: ["tag-people", tagKey(ids), limit],
    queryFn: async (): Promise<TagPerson[]> => {
      const { data, error } = await supabase.rpc("discover_people", { p_interest_ids: ids, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as TagPerson[];
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Tags connected to the given ones — offered when a filter comes up empty, so there's always a next step. */
export function useRelatedTags(ids: string[], limit = 8) {
  return useQuery({
    queryKey: ["related-tags", tagKey(ids), limit],
    queryFn: async (): Promise<TagRef[]> => {
      const { data, error } = await supabase.rpc("related_tags", { p_interest_ids: ids, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as TagRef[];
    },
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export interface TagScope {
  project: string[];
  page: string[];
  post: string[];
  person: string[];
}

/** Every project/page/post/person carrying these tags — what search is narrowed to while a tag is selected. */
export function useTagScope(ids: string[]) {
  return useQuery({
    queryKey: ["tag-scope", tagKey(ids)],
    queryFn: async (): Promise<TagScope> => {
      const { data, error } = await supabase.rpc("tag_entity_ids", { p_interest_ids: ids });
      if (error) throw error;
      const scope: TagScope = { project: [], page: [], post: [], person: [] };
      for (const row of (data ?? []) as Array<{ kind: keyof TagScope; entity_id: string }>) scope[row.kind]?.push(row.entity_id);
      return scope;
    },
    enabled: ids.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

/** Topics a piece of text is about, for suggesting tags while writing. Matches tag names and aliases. */
export function useTopicSuggestions(text: string, limit = 3) {
  const trimmed = text.trim();
  return useQuery({
    queryKey: ["topic-suggestions", trimmed.slice(0, 400), limit],
    queryFn: async (): Promise<TagRef[]> => {
      const { data, error } = await supabase.rpc("suggest_topics_for_text", { p_text: trimmed.slice(0, 2000), p_limit: limit });
      if (error) throw error;
      return (data ?? []) as TagRef[];
    },
    enabled: trimmed.length >= 20,
    staleTime: 60 * 1000,
  });
}

/** Tags matching what's being typed in search (name, slug or alias), so a topic can be picked as a filter. */
export function useTagSearch(query: string, limit = 5) {
  const q = query.trim().toLowerCase().replace(/[,{}()"%\\]/g, " ").replace(/\s+/g, " ").trim();
  return useQuery({
    queryKey: ["tag-search", q, limit],
    queryFn: async (): Promise<TagRef[]> => {
      const { data, error } = await supabase
        .from("interests")
        .select("id, name, slug")
        .eq("is_active", true)
        .or(`name.ilike.%${q}%,slug.ilike.%${q.replace(/ /g, "-")}%,aliases.cs.{"${q}"}`)
        .order("sort_order")
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as TagRef[];
    },
    enabled: q.length >= 2,
    staleTime: 10 * 60 * 1000,
  });
}
