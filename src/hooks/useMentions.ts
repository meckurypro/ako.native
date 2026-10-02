// src/hooks/useMentions.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface MentionCandidate {
  /** Which table this came from — profiles route to /profile/:username,
   *  pages route to /page/:username. Kept on every candidate so
   *  MentionTextarea's suggestion list and formatText.tsx's renderer
   *  both know which without a second lookup. */
  kind: "profile" | "page";
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Suggests accounts to @mention as the user types after an "@" —
 * personal profiles AND organization/brand pages both, since a post,
 * comment, or bio should be able to tag either. Runs three queries in
 * parallel: the user's followings filtered by the query client-side
 * (small list, cheap), a broader profiles search, and a pages search
 * — then merges with followings first, per the product ask to
 * prioritize people the user already follows. Pages aren't boosted by
 * follow status the same way (that'd need a second followings query
 * against page_members/page follows) — they're ranked by search match
 * alone, appended after followed + searched profiles.
 * Query can be empty (just typed "@") to show followings alone.
 */
export function useMentionSuggestions(query: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["mention-suggestions", user?.id, query],
    queryFn: async (): Promise<MentionCandidate[]> => {
      if (!user) return [];

      const [followingRes, profileSearchRes, pageSearchRes] = await Promise.all([
        supabase
          .from("follows")
          .select(`following:profiles!follows_following_id_fkey(id, username, display_name, avatar_url)`)
          .eq("follower_id", user.id),
        query.trim().length > 0
          ? supabase
              .from("profiles")
              .select("id, username, display_name, avatar_url")
              .eq("is_deleted", false)
              .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
              .limit(15)
          : Promise.resolve({ data: [], error: null }),
        query.trim().length > 0
          ? supabase
              .from("pages")
              .select("id, username, name, avatar_url")
              .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
              .limit(8)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const followings: MentionCandidate[] = (followingRes.data ?? [])
        .map((row: any) => row.following)
        .filter((p: any) => p && matchesProfile(p, query))
        .map(toProfileCandidate);

      const searchedProfiles: MentionCandidate[] = (profileSearchRes.data ?? []).map(toProfileCandidate);
      const searchedPages: MentionCandidate[] = (pageSearchRes.data ?? []).map(toPageCandidate);

      const seen = new Set<string>(); // keyed by "kind:id" — a profile and a page can share a raw id space collision-free, but keep the kind in the key defensively anyway
      const merged: MentionCandidate[] = [];
      for (const c of [...followings, ...searchedProfiles, ...searchedPages]) {
        if (c.kind === "profile" && c.id === user.id) continue;
        const key = `${c.kind}:${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(c);
      }

      return merged.slice(0, 8);
    },
    enabled: !!user,
  });
}

function toProfileCandidate(p: any): MentionCandidate {
  return { kind: "profile", id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url };
}

function toPageCandidate(p: any): MentionCandidate {
  return { kind: "page", id: p.id, username: p.username, display_name: p.name, avatar_url: p.avatar_url };
}

function matchesProfile(p: { username: string; display_name: string }, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return p.username.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q);
}
