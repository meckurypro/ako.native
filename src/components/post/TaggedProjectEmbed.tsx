// src/components/post/TaggedProjectEmbed.tsx
// Project tag at the bottom of a post: a title strip with an oversized, perspective-tilted thumbnail resting on it. Tap to open.
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { isBookType } from "@/lib/bookCover";
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
      <View className="mt-3 rounded-xl border border-border-a60 bg-surface-a70 px-3.5 py-2.5">
        <Text className="text-sm text-ink-muted">This tagged project is no longer available.</Text>
      </View>
    );
  }

  // The strip is only as tall as the title needs; the thumbnail is deliberately oversized, overflows it above
  // and below, and is tilted in perspective like a physical card resting on the post. The Pressable's own height
  // holds the whole thumbnail, so the overflow reserves its space and stays tappable.
  const book = isBookType(project.project_type);
  const thumbW = book ? 84 : 96;
  const thumbH = book ? 120 : 96;
  const outerH = thumbH + 8;

  return (
    <Pressable
      onPress={() => router.push(getProjectPath(project) as Href)}
      accessibilityRole="link"
      accessibilityLabel={project.title}
      className="mt-3 justify-center active:opacity-80"
      style={{ height: outerH }}
    >
      <View
        className="min-h-[60px] w-full flex-row items-center justify-center rounded-xl border border-border-a60 bg-surface-a60 py-2 pr-4"
        style={{ paddingLeft: thumbW + 24 }}
      >
        {/* Bold, centred, two lines max. */}
        <Text numberOfLines={2} className="flex-1 text-center text-base font-bold leading-[21px] text-ink">
          {project.title}
        </Text>
      </View>

      <View
        pointerEvents="none"
        className="absolute rounded-lg bg-surface"
        style={{
          left: 12,
          top: (outerH - thumbH) / 2,
          width: thumbW,
          height: thumbH,
          transform: [{ perspective: 600 }, { rotateY: "16deg" }, { rotateX: "4deg" }, { rotateZ: "-6deg" }],
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 7 },
          elevation: 8,
        }}
      >
        <View className="h-full w-full items-center justify-center overflow-hidden rounded-lg border border-white-a25">
          {isFileType(project.project_type) ? (
            <FileFolderIcon />
          ) : project.thumbnail_url ? (
            <Image source={{ uri: project.thumbnail_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
          ) : (
            <Icon as={ImageIcon} size={22} className="text-ink-muted" />
          )}
        </View>
      </View>
    </Pressable>
  );
}
