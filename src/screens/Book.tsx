// src/screens/Book.tsx
// Authored-book screen: owners get the builder, buyers the reader, everyone
// else the locked/buy view. (Uploaded-PDF books use the separate BookReader.)
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

import { BookBuilder } from "@/components/project/book/BookBuilder";
import { BookLockedView } from "@/components/project/book/BookLockedView";
import { BookReflowReader } from "@/components/project/book/BookReflowReader";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useBookChapters, usePublishBook } from "@/hooks/useBookBuilder";
import { useIsProjectMember } from "@/hooks/useProjectMembers";
import { getEffectivePrice, isProjectFree, useHasPurchased, useProject, usePurchaseProject } from "@/hooks/useProjects";

export function Book() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();

  const { data: project } = useProject(projectId);
  const isOwner = !!user && project?.owner_id === user.id;
  const isFree = !!project && isProjectFree(project);
  const hasPurchasedQuery = useHasPurchased(projectId ?? "");
  const isMemberQuery = useIsProjectMember(projectId ?? "", project?.is_private ?? false);
  const privacyBlocked = !!project?.is_private && !isOwner && !isMemberQuery.data;
  const hasAccess = !privacyBlocked && (isOwner || isFree || !!hasPurchasedQuery.data);

  const { data: chapters } = useBookChapters(projectId);
  const publishBook = usePublishBook(projectId ?? "");
  const purchaseProject = usePurchaseProject();

  const ordered = useMemo(() => (chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order), [chapters]);

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (isOwner) return <BookBuilder projectId={project.id} project={project} chapters={ordered} publishBook={publishBook} />;

  if (!hasAccess) {
    return (
      <BookLockedView
        title={project.title}
        thumbnailUrl={project.thumbnail_url}
        price={getEffectivePrice(project)}
        onBuy={async () => {
          await purchaseProject.mutateAsync(project.id);
        }}
        buying={purchaseProject.isPending}
      />
    );
  }

  return <BookReflowReader projectId={project.id} title={project.title} chapters={ordered} userId={user?.id} />;
}
