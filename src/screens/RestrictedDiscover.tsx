// src/screens/RestrictedDiscover.tsx
// Discover for restricted (consumer-only) accounts.
// The same TikTok-style search as full accounts (see DiscoverShell), scoped down, over two browse
// sections: Projects to explore and Pages to follow.
// Discover is for finding projects and pages — never people or posts.
import { View } from "react-native";

import { DiscoverShell } from "@/components/discover/DiscoverShell";
import { SectionHeader } from "@/components/discover/SectionHeader";
import { PageRow } from "@/components/post/PageRow";
import { ProjectMiniGrid } from "@/components/post/ProjectMiniCard";
import { Text } from "@/components/ui/Text";
import { useSuggestedPages, useSuggestedProjects } from "@/hooks/useSearch";

export function RestrictedDiscover() {
  const { data: suggestedProjects, isLoading: suggestedProjectsLoading, refetch: refetchProjects } = useSuggestedProjects();
  const { data: suggestedPages, isLoading: suggestedPagesLoading, refetch: refetchPages } = useSuggestedPages();

  const browse = (
    <>
      <View className="mb-9">
        <SectionHeader title="Projects to explore" subtitle="Popular and recent work from across Akọ." />
        {suggestedProjectsLoading ? (
          <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
        ) : suggestedProjects && suggestedProjects.length > 0 ? (
          <ProjectMiniGrid projects={suggestedProjects} />
        ) : (
          <Text className="py-4 text-sm text-ink-muted">No projects to show right now.</Text>
        )}
      </View>

      <View>
        <SectionHeader title="Pages to follow" subtitle="Organisations, brands and products worth a look." />
        {suggestedPagesLoading ? (
          <Text className="py-4 text-sm text-ink-muted">Loading…</Text>
        ) : suggestedPages && suggestedPages.length > 0 ? (
          suggestedPages.map((p) => (
            <View key={p.id} className="border-b border-border">
              <PageRow page={p} />
            </View>
          ))
        ) : (
          <Text className="py-4 text-sm text-ink-muted">No pages to suggest right now.</Text>
        )}
      </View>
    </>
  );

  return (
    <DiscoverShell
      scope="discover"
      placeholder="Search pages and projects"
      accessibilityLabel="Search pages and projects"
      browse={browse}
      refreshers={[refetchProjects, refetchPages]}
    />
  );
}
