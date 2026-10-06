// src/screens/ProjectBySlug.tsx
// Short links like /my-project-title resolve to a project, then show it. A stale
// slug (the creator renamed it) redirects to the canonical one.
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/Text";
import { useResolveProjectSlug } from "@/hooks/useProjects";
import { getProjectPath, normalizeProjectSlug } from "@/lib/projectLinks";
import { ProjectDetail } from "./ProjectDetail";

export function ProjectBySlug() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const { data: project, isLoading, isError } = useResolveProjectSlug(slug);

  const isStaleSlug = !!project && !!slug && normalizeProjectSlug(project.slug ?? "") !== normalizeProjectSlug(slug);

  useEffect(() => {
    if (project && isStaleSlug) router.replace(getProjectPath(project) as Href);
  }, [project, isStaleSlug]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 24 }}>
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (isError || !project || isStaleSlug) {
    if (isStaleSlug) return null;
    return (
      <View className="flex-1 bg-canvas px-4" style={{ paddingTop: insets.top + 24 }}>
        <Text className="text-ink-muted">This project couldn't be found.</Text>
      </View>
    );
  }

  return <ProjectDetail resolvedProjectId={project.id} />;
}
