// src/components/post/ProjectMiniCard.tsx
// Compact project tile for shelves and grids (profile Projects tab, "more from…").
import { ImageIcon } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { PROJECT_TYPE_LABELS, type Project } from "@/hooks/useProjects";
import { getProjectPath } from "@/lib/projectLinks";
import { useTheme } from "@/theme/ThemeProvider";

export function ProjectMiniCard({ project, showStatus = false, width }: { project: Project; showStatus?: boolean; width?: number }) {
  const { colors } = useTheme();
  const statusLabel = !showStatus
    ? null
    : project.status === "draft"
      ? "Draft"
      : project.status === "cancelled"
        ? "Cancelled"
        : project.is_private
          ? "Private"
          : null;

  return (
    <Pressable
      onPress={() => router.push(getProjectPath(project) as Href)}
      accessibilityRole="link"
      className="overflow-hidden rounded-2xl border border-border/60 bg-surface active:opacity-90"
      style={{
        width: width ?? "100%",
        shadowColor: `rgb(${colors.shadowInkRgb})`,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View className="aspect-square w-full items-center justify-center overflow-hidden bg-canvas">
        {statusLabel ? (
          <View className="absolute left-2 top-2 z-10 rounded-full bg-ink/75 px-2 py-0.5">
            <Text className="text-[11px] font-medium text-canvas">{statusLabel}</Text>
          </View>
        ) : null}
        {project.thumbnail_url ? (
          <Image source={{ uri: project.thumbnail_url }} contentFit="cover" transition={150} style={{ width: "100%", height: "100%" }} />
        ) : (
          <Icon as={ImageIcon} size={24} className="text-ink-muted" />
        )}
      </View>
      <View className="p-3">
        <Text numberOfLines={1} className="text-sm font-medium text-ink">
          {project.title}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted">{PROJECT_TYPE_LABELS[project.project_type]}</Text>
      </View>
    </Pressable>
  );
}

/** Two-column grid (web: grid-cols-2). */
export function ProjectMiniGrid({ projects, showStatus = false }: { projects: Project[]; showStatus?: boolean }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {projects.map((project) => (
        <View key={project.id} style={{ width: "48%" }}>
          <ProjectMiniCard project={project} showStatus={showStatus} />
        </View>
      ))}
    </View>
  );
}
