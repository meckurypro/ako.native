// src/components/post/TaggedProjectEmbed.tsx
// Subtle project tag at the bottom of a post: thumbnail + title, tap to open it.
import { ImageIcon } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ProjectType } from "@/hooks/useProjects";
import { getProjectPath } from "@/lib/projectLinks";

export interface TaggedProjectSummary {
  id: string;
  title: string;
  thumbnail_url: string | null;
  project_type: ProjectType;
  price_usd: number;
  promo_price_usd: number | null;
  status: "active" | "draft" | "archived" | "cancelled";
  slug?: string | null;
  posted_as_page?: { username: string } | null;
  owner: {
    username: string;
    display_name: string;
  };
}

export function TaggedProjectEmbed({ project }: { project: TaggedProjectSummary | null | undefined }) {
  if (!project) return null;

  if (project.status !== "active") {
    return (
      <View className="mt-3 rounded-xl border border-border/60 bg-surface/70 px-3.5 py-2.5">
        <Text className="text-sm text-ink-muted">This tagged project is no longer available.</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(getProjectPath(project) as Href)}
      accessibilityRole="link"
      className="mt-3 flex-row items-center gap-2.5 rounded-xl border border-border/60 bg-surface/60 px-2.5 py-2 active:bg-surface/80"
    >
      <View className="h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-surface/80">
        {project.thumbnail_url ? (
          <Image source={{ uri: project.thumbnail_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
        ) : (
          <Icon as={ImageIcon} size={16} className="text-ink-muted" />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-ink">
          {project.title}
        </Text>
      </View>
    </Pressable>
  );
}
