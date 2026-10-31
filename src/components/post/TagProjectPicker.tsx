// src/components/post/TagProjectPicker.tsx
// Pick one of your published projects, or one you forked, to tag on a post.
import { isFileType } from "@/lib/fileProject";
import { FileFolderIcon } from "@/components/project/FileFolderArt";
import { thumbBoxStyle } from "@/lib/thumbnailSpec";
import { ImageIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useSheet } from "@/components/ui/Sheet";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { runAfterDismiss } from "@/hooks/useBackDismiss";
import { useMyTaggableForkedProjects } from "@/hooks/useAffiliates";
import { PROJECT_TYPE_LABELS, useUserProjects } from "@/hooks/useProjects";

function Rows({ userId, onSelect }: { userId: string; onSelect: (projectId: string, title: string) => void }) {
  const { close } = useSheet();
  const { data: ownProjects, isLoading: loadingOwn } = useUserProjects(userId, false);
  const { data: forked, isLoading: loadingForked } = useMyTaggableForkedProjects();
  const isLoading = loadingOwn || loadingForked;
  // Own projects first, then forked ones (create-post accepts both; forks carry the poster's affiliate link).
  const ownIds = new Set((ownProjects ?? []).map((p) => p.id));
  const projects = [
    ...(ownProjects ?? []).map((p) => ({ ...p, isFork: false })),
    ...(forked ?? []).filter((p) => !ownIds.has(p.id)).map((p) => ({ ...p, isFork: true })),
  ] as { id: string; title: string; thumbnail_url: string | null; project_type: keyof typeof PROJECT_TYPE_LABELS; isFork: boolean }[];

  if (isLoading) return <Text className="py-6 text-center text-sm text-ink-muted">Loading…</Text>;
  if (projects.length === 0) {
    return <Text className="px-4 py-6 text-center text-sm text-ink-muted">No projects to tag yet.</Text>;
  }

  return (
    <View>
      {projects.map((project) => (
        <Pressable
          key={project.id}
          onPress={() => runAfterDismiss(close, () => onSelect(project.id, project.title))}
          accessibilityRole="button"
          className="flex-row items-center gap-2.5 px-1 py-2.5 active:bg-canvas"
        >
          <View style={thumbBoxStyle(project, 40)} className="shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-canvas">
            {isFileType(project.project_type) ? (
              <FileFolderIcon size={40} fill />
            ) : project.thumbnail_url ? (
              <Image source={{ uri: project.thumbnail_url }} contentFit="cover" style={{ width: "100%", height: "100%" }} />
            ) : (
              <Icon as={ImageIcon} size={14} className="text-ink-muted" />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">{PROJECT_TYPE_LABELS[project.project_type]}{project.isFork ? " · Forked" : ""}</Text>
            <Text numberOfLines={1} className="text-sm font-medium text-ink">
              {project.title}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function TagProjectPicker({
  userId,
  onSelect,
  onClose,
}: {
  userId: string;
  onSelect: (projectId: string, title: string) => void;
  onClose: () => void;
}) {
  return (
    <SheetFrame title="Tag a project" onClose={onClose} zIndex={60} accessibilityLabel="Tag a project">
      <Rows userId={userId} onSelect={onSelect} />
    </SheetFrame>
  );
}
