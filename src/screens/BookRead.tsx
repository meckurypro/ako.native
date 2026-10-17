// src/screens/BookRead.tsx
// /projects/:id/read — reading a book from the project page. An uploaded PDF reads as reflowable chapters (the same
// reader as a book written in Akọ) once its text has been extracted; the owner's first open triggers that extraction.
// A PDF with no text layer (a scan) or one the extractor can't handle has nothing to reflow, so it says so plainly.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useBookChapters, useExtractBookPdf } from "@/hooks/useBookBuilder";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useBookDetails } from "@/hooks/useProjectTypeDetails";
import { useProject } from "@/hooks/useProjects";
import { useSmartBack } from "@/hooks/useSmartBack";
import { Book } from "@/screens/Book";

export function BookRead() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const back = useSmartBack();
  const { data: project } = useProject(projectId);
  const { data: details } = useBookDetails(projectId);
  const chaptersQuery = useBookChapters(projectId);
  const extract = useExtractBookPdf(projectId ?? "");
  const ownership = useProjectOwnership();
  const tried = useRef(false);

  const isOwner = !!user && ownership.isOwner(project);
  const canRead = !!details?.allow_read_in_app;
  const hasChapters = (chaptersQuery.data?.length ?? 0) > 0;
  const needsExtract = isOwner && canRead && details?.content_source === "upload" && chaptersQuery.isSuccess && !hasChapters;

  useEffect(() => {
    if (!needsExtract || tried.current) return;
    tried.current = true;
    extract.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsExtract]);

  const loading =
    !project || !details || chaptersQuery.isLoading || ownership.loading || (needsExtract && !extract.isError && (extract.isIdle || extract.isPending));

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-6" style={{ paddingTop: insets.top }}>
        <ActivityIndicator />
        <Text className="mt-3 text-center text-ink">{needsExtract ? "Preparing your book for reading…" : "Loading…"}</Text>
        {needsExtract ? <Text className="mt-1 text-center text-sm text-ink-muted">This only happens once and can take a moment for long books.</Text> : null}
      </View>
    );
  }

  if (hasChapters && canRead) return <Book />;

  const message = !canRead
    ? "The host made this book available for download only, not for reading in the app."
    : isOwner
      ? "This PDF has no selectable text (it may be a scan), so it can't be shown as readable pages."
      : "This book isn't ready to read in the app yet. Try again later, or ask the host.";

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Text className="text-center text-ink">{message}</Text>
      <Button size="sm" variant="secondary" onPress={back}>
        Back
      </Button>
    </View>
  );
}
