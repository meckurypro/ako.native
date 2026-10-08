// src/components/project/book/BookBuilder.tsx
// Owner's view of an authored book: cover, ordered chapters / front-and-back-matter
// sections, inline editor, publish.
import { ChevronDown, ChevronUp, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  BOOK_SECTION_INFO,
  OPTIONAL_SECTION_ORDER,
  useAddChapter,
  useDeleteChapter,
  useMoveChapter,
  usePublishBook,
  useUpdateChapter,
  type BookChapter,
  type BookChapterKind,
} from "@/hooks/useBookBuilder";
import { useUpdateProject } from "@/hooks/useProjects";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { haptics } from "@/lib/haptics";
import { pickSingleImage } from "@/lib/pickImage";
import { useTheme } from "@/theme/ThemeProvider";

interface BookBuilderProps {
  projectId: string;
  project: { title: string; thumbnail_url: string | null; published_at: string | null };
  chapters: BookChapter[];
  publishBook: ReturnType<typeof usePublishBook>;
}

export function BookBuilder({ projectId, project, chapters, publishBook }: BookBuilderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const addChapter = useAddChapter(projectId);
  const updateChapter = useUpdateChapter(projectId);
  const moveChapter = useMoveChapter(projectId);
  const deleteChapter = useDeleteChapter(projectId);
  const uploadThumbnail = useUploadProjectThumbnail();
  const updateProject = useUpdateProject();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addingSectionPicker, setAddingSectionPicker] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BookChapter | null>(null);

  const usedKinds = new Set(chapters.map((c) => c.kind));
  const availableOptionalSections = OPTIONAL_SECTION_ORDER.filter((k) => !usedKinds.has(k));
  const coverBusy = uploadThumbnail.isPending || updateProject.isPending;

  function startEdit(chapter: BookChapter) {
    setEditingId(chapter.id);
    setDraftTitle(chapter.title);
    setDraftContent(chapter.content ?? "");
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await updateChapter.mutateAsync({ chapterId: editingId, title: draftTitle.trim() || "Untitled", content: draftContent });
      setEditingId(null);
      haptics.light();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  const nextSortOrder = chapters.length > 0 ? chapters[chapters.length - 1].sort_order + 1 : 0;

  async function handleAddChapter() {
    try {
      const created = await addChapter.mutateAsync({
        kind: "chapter",
        title: `Chapter ${chapters.filter((c) => c.kind === "chapter").length + 1}`,
        sortOrder: nextSortOrder,
      });
      startEdit(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add chapter.");
    }
  }

  async function handleAddSection(kind: BookChapterKind) {
    try {
      const created = await addChapter.mutateAsync({ kind, title: BOOK_SECTION_INFO[kind].label, sortOrder: nextSortOrder });
      setAddingSectionPicker(false);
      startEdit(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add section.");
    }
  }

  async function handleCover() {
    try {
      const file = await pickSingleImage({ aspect: [2, 3] });
      if (!file) return;
      const uploaded = await uploadThumbnail.mutateAsync(file);
      // The web builder uploads but never writes the URL back, so the cover was lost on reload; save it here.
      await updateProject.mutateAsync({ id: projectId, thumbnail_url: uploaded.url, thumbnail_width: uploaded.width, thumbnail_height: uploaded.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover upload failed.");
    }
  }

  async function handlePublish() {
    if (chapters.length === 0) {
      setError("Add at least one chapter before publishing.");
      return;
    }
    try {
      await publishBook.mutateAsync();
      haptics.success();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish.");
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader
        title={project.title}
        bar
        right={
          !project.published_at ? (
            <Button size="sm" onPress={handlePublish} loading={publishBook.isPending}>
              Publish
            </Button>
          ) : (
            <Text className="text-xs text-ink-muted">Published</Text>
          )
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 96 }}>
        <Pressable
          onPress={handleCover}
          disabled={coverBusy}
          accessibilityRole="button"
          accessibilityLabel={project.thumbnail_url ? "Change cover" : "Add cover"}
          className={`mb-6 w-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface ${coverBusy ? "opacity-50" : ""}`}
          style={{ aspectRatio: 2 / 3 }}
        >
          {project.thumbnail_url ? (
            <Image source={project.thumbnail_url} contentFit="cover" className="h-full w-full" />
          ) : (
            <View className="items-center gap-1">
              <Icon as={ImageIcon} size={20} className="text-ink-muted" />
              <Text className="text-[11px] text-ink-muted">{coverBusy ? "Uploading…" : "Add cover"}</Text>
            </View>
          )}
        </Pressable>

        {error && <Text className="mb-4 text-sm text-danger">{error}</Text>}

        <View className="mb-4 gap-2">
          {chapters.map((chapter, i) => (
            <View key={chapter.id} className="rounded-xl border border-border p-3">
              {editingId === chapter.id ? (
                <View className="gap-2">
                  <TextInput
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder="Title"
                    placeholderTextColor={colors.inkMuted}
                    className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm font-medium text-ink"
                    style={{ fontFamily: "Inter_500Medium" }}
                    accessibilityLabel="Chapter title"
                  />
                  <TextInput
                    value={draftContent}
                    onChangeText={setDraftContent}
                    placeholder={BOOK_SECTION_INFO[chapter.kind].hint}
                    placeholderTextColor={colors.inkMuted}
                    multiline
                    textAlignVertical="top"
                    className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
                    style={{ fontFamily: "Inter_400Regular", minHeight: 240 }}
                    accessibilityLabel="Chapter text"
                  />
                  <View className="flex-row items-center gap-2">
                    <Button size="sm" onPress={saveEdit} loading={updateChapter.isPending}>
                      Save
                    </Button>
                    <Pressable onPress={() => setEditingId(null)} accessibilityRole="button" className="px-3 py-1.5">
                      <Text className="text-sm text-ink-muted">Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center gap-2">
                  <View className="shrink-0">
                    <Pressable onPress={() => moveChapter.mutate({ chapters, chapterId: chapter.id, direction: "up" })} disabled={i === 0} accessibilityLabel="Move up" hitSlop={6} className={i === 0 ? "opacity-20" : ""}>
                      <Icon as={ChevronUp} size={14} className="text-ink-muted" />
                    </Pressable>
                    <Pressable
                      onPress={() => moveChapter.mutate({ chapters, chapterId: chapter.id, direction: "down" })}
                      disabled={i === chapters.length - 1}
                      accessibilityLabel="Move down"
                      hitSlop={6}
                      className={i === chapters.length - 1 ? "opacity-20" : ""}
                    >
                      <Icon as={ChevronDown} size={14} className="text-ink-muted" />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => startEdit(chapter)} accessibilityRole="button" className="min-w-0 flex-1">
                    <Text className="text-xs uppercase tracking-wide text-ink-muted">{chapter.kind === "chapter" ? "Chapter" : BOOK_SECTION_INFO[chapter.kind].label}</Text>
                    <Text numberOfLines={1} className="text-sm font-medium text-ink">
                      {chapter.title}
                    </Text>
                    {!chapter.content?.trim() && <Text className="text-xs text-accent">Empty — tap to write</Text>}
                  </Pressable>
                  <Pressable onPress={() => startEdit(chapter)} accessibilityLabel="Edit" hitSlop={8} className="shrink-0">
                    <Icon as={Pencil} size={16} className="text-ink-muted" />
                  </Pressable>
                  <Pressable onPress={() => setPendingDelete(chapter)} accessibilityLabel="Remove" hitSlop={8} className="shrink-0">
                    <Icon as={Trash2} size={16} className="text-danger" />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleAddChapter}
          disabled={addChapter.isPending}
          accessibilityRole="button"
          className={`mb-3 w-full flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 ${addChapter.isPending ? "opacity-50" : ""}`}
        >
          <Icon as={Plus} size={16} className="text-accent" />
          <Text className="text-sm font-medium text-accent">Add chapter</Text>
        </Pressable>

        {availableOptionalSections.length > 0 && (
          <View>
            <Pressable onPress={() => setAddingSectionPicker((v) => !v)} accessibilityRole="button" className="w-full flex-row items-center justify-center gap-1.5 rounded-xl py-2.5">
              <Icon as={Plus} size={14} className="text-ink-muted" />
              <Text className="text-sm font-medium text-ink-muted">Add a section (foreword, epilogue, etc.)</Text>
            </Pressable>
            {addingSectionPicker && (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {availableOptionalSections.map((kind) => (
                  <Pressable key={kind} onPress={() => handleAddSection(kind)} accessibilityRole="button" className="rounded-full border border-border px-3 py-1.5">
                    <Text className="text-xs text-ink-muted">{BOOK_SECTION_INFO[kind].label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {pendingDelete && (
        <ConfirmDialog
          title="Remove this section?"
          description={`“${pendingDelete.title}” will be removed. This can't be undone.`}
          confirmLabel="Remove"
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            deleteChapter.mutate(target.id, { onError: (e) => setError(e instanceof Error ? e.message : "Couldn't remove.") });
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}
