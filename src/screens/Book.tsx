// src/screens/Book.tsx
// Authored-book screens. /books/:id is the book AS A READER SEES IT — for everyone, the creator included (a creator
// who opens their own book's link, or finds it in Discover, reads it like any visitor): buyers get the reader,
// everyone else the locked/buy view. The builder lives at /books/:id/edit (BookEdit below), reached only from the
// creator's own profile → Projects. (Uploaded-PDF books use the separate BookReader.)
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

import { BookBuilder } from "@/components/project/book/BookBuilder";
import { ForewordPreviewBar } from "@/components/project/ForewordPreviewBar";
import { useForewordPreview } from "@/hooks/useForewords";
import { BookLockedView } from "@/components/project/book/BookLockedView";
import { OfferNudgeSheet } from "@/components/project/OfferNudgeSheet";
import { BookReaderSkeleton } from "@/components/project/book/BookReaderSkeleton";
import { BookReflowReader } from "@/components/project/book/BookReflowReader";
import { OfflineUnavailable } from "@/components/project/OfflineUnavailable";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useOfferNudge } from "@/hooks/useOffers";
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
  // Someone invited to write a foreword may read the book first — a draft, a private or a paid one — while the invite
  // is open (and after they've written). The database grants the rows; this only decides which screen to show.
  const foreword = useForewordPreview(projectId);
  const isPreviewer = foreword.canPreview && !isCreator;
  const privacyBlocked = !!project?.is_private && !isOwner && !isMemberQuery.data && !isPreviewer;
  const hasAccess = !privacyBlocked && (isOwner || isFree || !!hasPurchasedQuery.data || isPreviewer);
  // A preview isn't a reader opening the book, so it stays out of their Library and the access count.
  useRecordFreeProjectOpen(project, { isOwner: isCreator, enabled: !privacyBlocked && !isPreviewer });

  const chaptersQuery = useBookChapters(projectId);
  const chapters = chaptersQuery.data;
  const purchaseProject = usePurchaseProject();
  // If this book is part of one of the creator's offers, Buy suggests the bundle first.
  const offerNudge = useOfferNudge(projectId ?? "");
  const toast = useToast();

  const ordered = useMemo(() => (chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order), [chapters]);

  // Both waits are capped (see useLoadingBudget): on a dead-but-"connected" network a query reports loading until the OS
  // times the request out, and the saved-copy seeding (useSeedOfflineProject) fills the cache after a few seconds.
  // A buyer's access resolves after the project does; without this a paid book flashes its locked view first.
  const accessPending = useLoadingBudget(!isOwner && !isFree && (hasPurchasedQuery.isLoading || foreword.isLoading));
  const chaptersPending = useLoadingBudget(chaptersQuery.isLoading, 8000);

  if (!project && !online) return <OfflineUnavailable projectId={projectId} />;

  // Wait for the acting identity: until it resolves isOwner is false, which would flash the locked view at the creator.
  if (!project || ownership.loading || accessPending) return <BookReaderSkeleton title={project?.title} thumbnailUrl={project?.thumbnail_url} />;

  if (!hasAccess) {
    return (
      <>
        <BookLockedView
          title={project.title}
          thumbnailUrl={project.thumbnail_url}
          price={getEffectivePrice(project)}
          onBuy={async () => {
            if (await offerNudge.offerBeforeBuy()) return;
            await purchaseProject.mutateAsync(project.id);
          }}
          buying={purchaseProject.isPending || offerNudge.checking}
        />
        {offerNudge.offers ? (
          <OfferNudgeSheet
            projectId={project.id}
            projectTitle={project.title}
            singlePrice={getEffectivePrice(project)}
            offers={offerNudge.offers}
            onBuySingle={() => {
              purchaseProject
                .mutateAsync(project.id)
                .catch((err) => toast(err instanceof Error ? err.message : "Couldn't complete purchase.", { variant: "error" }));
            }}
            onClose={offerNudge.close}
          />
        ) : null}
      </>
    );
  }

  // Don't open the reader on an empty chapter list ("0 sections · about 0 min read"): wait for the text.
  if (chaptersPending) return <BookReaderSkeleton title={project.title} thumbnailUrl={project.thumbnail_url} />;

  return (
    <View className="flex-1">
      <BookReflowReader
        projectId={project.id}
        title={project.title}
        chapters={ordered}
        userId={user?.id}
        thumbnailUrl={project.thumbnail_url}
        shareUrl={getProjectUrl(project)}
      />
      <ForewordPreviewBar projectId={project.id} isOwner={isOwner} />
    </View>
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
