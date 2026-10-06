// src/components/project/ProjectRail.tsx
// Titled horizontal shelf of mini project cards.
import { ScrollView, View } from "react-native";

import { ProjectMiniCard } from "@/components/post/ProjectMiniCard";
import { Text } from "@/components/ui/Text";
import type { Project } from "@/hooks/useProjects";

export function ProjectRail({ title, projects }: { title: string; projects: Project[] }) {
  if (projects.length === 0) return null;
  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-lg font-semibold tracking-tight text-ink">{title}</Text>
      {/* Bleeds to the screen edges so the shelf scrolls off-screen naturally. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerClassName="gap-3 px-4 pb-1">
        {projects.map((p) => (
          <ProjectMiniCard key={p.id} project={p} />
        ))}
      </ScrollView>
    </View>
  );
}
