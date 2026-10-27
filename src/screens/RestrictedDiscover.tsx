// src/screens/RestrictedDiscover.tsx
// Discover for restricted (consumer-only) accounts: the same structured page as everyone else — a
// swipeable row per kind of content, then Pages — minus the people section. Never people or posts.
// Same TikTok-style search as full accounts (see DiscoverShell), scoped down.
import { DiscoverBrowse } from "@/components/discover/DiscoverBrowse";
import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { useSuggestedPages } from "@/hooks/useSearch";

export function RestrictedDiscover() {
  const { refetch: refetchPages } = useSuggestedPages();
  // The type rows are queries on screen too: pull-to-refresh refetches every query currently on screen
  // (see usePullToRefresh), so only the page suggestions need listing explicitly.

  return (
    <DiscoverShell
      scope="discover"
      placeholder="Search pages and projects"
      accessibilityLabel="Search pages and projects"
      browse={<DiscoverBrowse />}
      refreshers={[refetchPages]}
    />
  );
}
