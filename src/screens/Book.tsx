// src/screens/Book.tsx
// Authored-book screens. /books/:id is the book AS A READER SEES IT — for everyone, the creator included (a creator
// who opens their own book's link, or finds it in Discover, reads it like any visitor): buyers get the reader,
// everyone else the locked/buy view. The builder lives at /books/:id/edit (BookEdit below), reached only from the
// creator's own profile → Projects. (Uploaded-PDF books use the separate BookReader.)
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

import { BookBuilder } from "@/components/project/book/BookBuilder";
import { BookLockedView } from "@/components/project/book/BookLockedView";
import { BookReaderSkeleton } from "@/components/project/book/BookReaderSkeleton";
import { BookReflowReader } from "@/components/project/book/BookReflowReader";
import { OfflineUnavailable } from "@/components/project/OfflineUnavailable";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useLoadingBudget } from "@/hooks/useLoadingBudget";
import { useSeedOfflineProject } from "@/hooks/useSeedOfflineProject";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useRecordFreeProjectOpen } from "@/hooks/useProjectAccess";
import { useBookChapters, usePublishBook } from "@/hooks/useBookBuilder";
import { useIsProjectMember } from "@/hooks/useProjectMembers";
import { getProjectUrl } from "@/lib/projectLinks";
import { getEffectivePrice, isProjectFree, useHasPurchased, useProject, usePurchaseProject } from "@/hooks/useProjects";

export function Book() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const online = useIsOnline();
  // A saved copy opens from here whichever way the person arrived (see the hook), not only from the Library row.
  useSeedOfflineProject(projectId);

  const { data: project } = useProject(projectId);
  const ownership = useProjectOwnership();
  const isOwner = ownership.isOwner(project);
  const isCreator = !!user && project?.owner_id === user.id;
  const isFree = !!project && isProjectFree(project);
  const hasPurchasedQuery = useHasPurchased(projectId ?? "");
  const isMemberQuery = useIsProjectMember(projectId ?? "", project?.is_private ?? false);
  const privacyBlocked = !!project?.is_private && !isOwner && !isMemberQuery.data;
  const hasAccess = !privacyBlocked && (isOwner || isFree || !!hasPurchasedQuery.data);
  useRecordFreeProjectOpen(project, { isOwner: isCreator, enabled: !privacyBlocked });

  const chaptersQuery = useBookChapters(projectId);
  const chapters = chaptersQuery.data;
  const purchaseProject = usePurchaseProject();

  const ordered = useMemo(() => (chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order), [chapters]);

  // Both waits are capped (see useLoadingBudget): on a dead-but-"connected" network a query reports loading until the OS
  // times the request out, and the saved-copy seeding (useSeedOfflineProject) fills the cache after a few seconds.
  // A buyer's access resolves after the project does; without this a paid book flashes its locked view first.
  const accessPending = useLoadingBudget(!isOwner && !isFree && hasPurchasedQuery.isLoading);
  const chaptersPending = useLoadingBudget(chaptersQuery.isLoading, 8000);

  if (!project && !online) return <OfflineUnavailable projectId={projectId} />;

  // Wait for the acting identity: until it resolves isOwner is false, which would flash the locked view at the creator.
  if (!project || ownership.loading || accessPending) return <BookReaderSkeleton title={project?.title} thumbnailUrl={project?.thumbnail_url} />;

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

  // Don't open the reader on an empty chapter list ("0 sections · about 0 min read"): wait for the text.
  if (chaptersPending) return <BookReaderSkeleton title={project.title} thumbnailUrl={project.thumbnail_url} />;

  return (
    <BookReflowReader
      projectId={project.id}
      title={project.title}
      chapters={ordered}
      userId={user?.id}
      thumbnailUrl={project.thumbnail_url}
      shareUrl={getProjectUrl(project)}
    />
  );
}

/** The builder: owner only. Anyone else who lands here (a stale link, a switched identity) is sent to the reader. */
export function BookEdit() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const online = useIsOnline();
  const { data: project } = useProject(projectId);
  const ownership = useProjectOwnership();
  const { data: chapters } = useBookChapters(projectId);
  const publishBook = usePublishBook(projectId ?? "");
  const ordered = useMemo(() => (chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order), [chapters]);

  // Editing needs a connection; say so instead of spinning.
  if (!project && !online) return <OfflineUnavailable projectId={projectId} />;

  if (!project || ownership.loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }
  if (!ownership.isOwner(project)) return <Redirect href={`/books/${project.id}` as Href} />;
  return <BookBuilder projectId={project.id} project={project} chapters={ordered} publishBook={publishBook} />;
}
