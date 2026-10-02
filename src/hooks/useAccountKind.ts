// src/hooks/useAccountKind.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

/**
 * A username on its own doesn't say whether it belongs to a personal
 * profile (/profile/:username) or an organization/brand page
 * (/page/:username) — and now that @mentions can target either (see
 * useMentions.ts), rendering one back out needs to know which. Checks
 * profiles first since that's the overwhelmingly common case, only
 * falling through to pages if no profile owns that username.
 *
 * Defaults to "profile" while loading and for a username that matches
 * neither (a stale mention on a renamed/deleted account) — that's
 * exactly the link every @mention already pointed to before pages
 * could be tagged at all, so an unresolved or dead handle degrades to
 * the same harmless 404 it always would have, never a crash.
 *
 * Cached long (usernames essentially never change which account type
 * owns them) and shared across every mention of the same handle on
 * a page, so a post with 5 mentions of the same account only looks
 * it up once.
 */
export function useAccountKind(username: string) {
  return useQuery({
    queryKey: ["account-kind", username],
    queryFn: async (): Promise<"profile" | "page"> => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .eq("is_deleted", false)
        .maybeSingle();
      return profile ? "profile" : "page";
    },
    staleTime: 30 * 60 * 1000,
  });
}
