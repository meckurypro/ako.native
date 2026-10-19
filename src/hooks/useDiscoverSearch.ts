// src/hooks/useDiscoverSearch.ts
//
// Data for the Discover search screen's two "before you've finished typing"
// states: Trending (shown on tap, with no query) and tag autocomplete (shown
// while typing). Both read the existing public `hashtags` table — no new
// backend. Hashtags lead to posts, so only full accounts use these; restricted
// (consumer-only) accounts get project-based suggestions instead.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface HashtagSuggestion {
  id: string;
  tag: string;
  usage_count: number;
}

const TRENDING_LIMIT = 6;
const SUGGESTION_LIMIT = 3;

/** Most-used hashtags, busiest first. */
export function useTrendingHashtags(enabled = true) {
  return useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: async (): Promise<HashtagSuggestion[]> => {
      const { data, error } = await supabase
        .from("hashtags")
        .select("id, tag, usage_count")
        .gt("usage_count", 0)
        .order("usage_count", { ascending: false })
        .limit(TRENDING_LIMIT);
      if (error) throw error;
      return (data ?? []) as HashtagSuggestion[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Hashtags starting with what's been typed (a leading "#" is ignored). */
export function useHashtagSuggestions(query: string, enabled = true) {
  const term = query.trim().replace(/^#/, "").toLowerCase();
  return useQuery({
    queryKey: ["hashtag-suggestions", term],
    queryFn: async (): Promise<HashtagSuggestion[]> => {
      const likeEscaped = term.replace(/[\\%_]/g, "\\$&");
      const { data, error } = await supabase
        .from("hashtags")
        .select("id, tag, usage_count")
        .ilike("tag", `${likeEscaped}%`)
        .order("usage_count", { ascending: false })
        .limit(SUGGESTION_LIMIT);
      if (error) throw error;
      return (data ?? []) as HashtagSuggestion[];
    },
    enabled: enabled && term.length >= 2,
    staleTime: 60 * 1000,
  });
}
