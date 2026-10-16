// src/components/project/book/BookBuilder.tsx
// Owner's view of an authored book: cover, ordered chapters / front-and-back-matter
// sections, inline editor, publish.
import { ChevronDown, ChevronUp, Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAvoider } from "@/components/ui/KeyboardAvoider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditorToolbar } from "@/components/ui/EditorToolbar";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  BOOK_SECTION_INFO,
  OPTIONAL_SECTION_ORDER,
  usePublishBook,
  type BookChapter,
  type BookChapterKind,
} from "@/hooks/useBookBuilder";
import { useBookDraft } from "@/hooks/useBookDraft";
import { useUpdateProject } from "@/hooks/useProjects";
import { useReturnAfterSave } from "@/hooks/useReturnAfterSave";
import { useToast } from "@/components/ui/Toast";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { haptics } from "@/lib/haptics";
import { pickSingleImage } from "@/lib/pickImage";
import { BookChapterEditor } from "./BookChapterEditor";
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
  const uploadThumbnail = useUploadProjectThumbnail();
  const updateProject = useUpdateProject();
  const returnAfterSave = useReturnAfterSave();
  const toast = useToast();
  const navigation = useNavigation();

  // Everything below edits a local draft; nothing is stored until Save.
  const draft = useBookDraft(projectId, chapters);
  const list = draft.chapters;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingSectionPicker, setAddingSectionPicker] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [leaveAction, setLeaveAction] = useState<unknown>(null);

  // Block leaving (header back, Android back, swipe back) while changes are unsaved.
  const dirtyRef = useRef(false);
  dirtyRef.current = draft.isDirty;
  useEffect(() => {
    return navigation.addListener("beforeRemove", (e: { preventDefault: () => void; data: { action: unknown } }) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      setLeaveAction(e.data.action);
    });
  }, [navigation]);

  function leave(action: unknown) {
    dirtyRef.current = false;
    setLeaveAction(null);
    navigation.dispatch(action as Parameters<typeof navigation.dispatch>[0]);
  }

  const usedKinds = new Set(list.map((c) => c.kind));
  const availableOptionalSections = OPTIONAL_SECTION_ORDER.filter((k) => !usedKinds.has(k));
  const coverBusy = uploadThumbnail.isPending || updateProject.isPending;

  async function handleSave() {
    setError(null);
    try {
      await draft.save();
      haptics.light();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  async function handleSaveAndLeave() {
    if (!leaveAction) return;
    try {
      await draft.save();
      leave(leaveAction);
    } catch (err) {
      setLeaveAction(null);
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  function handleAddChapter() {
    const created = draft.add("chapter", `Chapter ${list.filter((c) => c.kind === "chapter").length + 1}`);
    setEditingId(created.id);
  }

  function handleAddSection(kind: BookChapterKind) {
    const created = draft.add(kind, BOOK_SECTION_INFO[kind].label);
    setAddingSectionPicker(false);
    setEditingId(created.id);
  }

  function handleRemove(chapter: BookChapter) {
    if (editingId === chapter.id) setEditingId(null);
    draft.remove(chapter.id);
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
    if (draft.isDirty) {
      setError("Save your changes before publishing.");
      return;
    }
    if (chapters.length === 0) {
      setError("Add at least one chapter before publishing.");
      return;
    }
    try {
      await publishBook.mutateAsync();
      haptics.success();
      toast("Book published.", { variant: "success" });
      // Back to wherever the builder was opened from, refreshed.
      await returnAfterSave({ fallback: `/books/${projectId}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish.");
    }
  }

  return (
    <KeyboardAvoider className="flex-1 bg-canvas">
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
      <View className="flex-row items-center justify-between border-b border-border bg-canvas px-4 py-2">
        <EditorToolbar
          onUndo={draft.undo}
          onRedo={draft.redo}
          canUndo={draft.canUndo}
          canRedo={draft.canRedo}
          onSave={handleSave}
          saving={draft.saving}
          dirty={draft.isDirty}
          onCancel={draft.isDirty ? () => setConfirmDiscard(true) : undefined}
        />
      </View>
      {draft.isDirty && <Text className="bg-accent-soft px-4 py-1.5 text-xs text-accent">Unsaved changes — tap Save to apply them.</Text>}
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
          {list.map((chapter, i) => (
            <View key={chapter.id} className="rounded-xl border border-border p-3">
              {editingId === chapter.id ? (
                <View className="gap-2">
                  <TextInput
                    value={chapter.title}
                    onChangeText={(title) => draft.edit(chapter.id, { title })}
                    placeholder="Title"
                    placeholderTextColor={colors.inkMuted}
                    className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm font-medium text-ink"
                    style={{ fontFamily: "Inter_500Medium" }}
                    accessibilityLabel="Chapter title"
                  />
                  <BookChapterEditor
                    kind={chapter.kind}
                    title={chapter.title}
                    content={chapter.content ?? ""}
                    onChange={(content) => draft.edit(chapter.id, { content })}
                  />
                  <Pressable onPress={() => setEditingId(null)} accessibilityRole="button" hitSlop={8} className="self-start px-1 py-1.5">
                    <Text className="text-sm font-medium text-accent">Done</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="flex-row items-center gap-2">
                  <View className="shrink-0">
                    <Pressable onPress={() => draft.move(chapter.id, "up")} disabled={i === 0} accessibilityLabel="Move up" hitSlop={6} className={i === 0 ? "opacity-20" : ""}>
                      <Icon as={ChevronUp} size={14} className="text-ink-muted" />
                    </Pressable>
                    <Pressable
                      onPress={() => draft.move(chapter.id, "down")}
                      disabled={i === list.length - 1}
                      accessibilityLabel="Move down"
                      hitSlop={6}
                      className={i === list.length - 1 ? "opacity-20" : ""}
                    >
                      <Icon as={ChevronDown} size={14} className="text-ink-muted" />
                    </Pressable>
                  </View>
                  <Pressable onPress={() => setEditingId(chapter.id)} accessibilityRole="button" className="min-w-0 flex-1">
                    <Text className="text-xs uppercase tracking-wide text-ink-muted">{chapter.kind === "chapter" ? "Chapter" : BOOK_SECTION_INFO[chapter.kind].label}</Text>
                    <Text numberOfLines={1} className="text-sm font-medium text-ink">
                      {chapter.title}
                    </Text>
                    {!chapter.content?.trim() && <Text className="text-xs text-accent">Empty — tap to write</Text>}
                  </Pressable>
                  <Pressable onPress={() => setEditingId(chapter.id)} accessibilityLabel="Edit" hitSlop={8} className="shrink-0">
                    <Icon as={Pencil} size={16} className="text-ink-muted" />
                  </Pressable>
                  <Pressable onPress={() => handleRemove(chapter)} accessibilityLabel="Remove" hitSlop={8} className="shrink-0">
                    <Icon as={Trash2} size={16} className="text-danger" />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleAddChapter}
          disabled={draft.saving}
          accessibilityRole="button"
          className={`mb-3 w-full flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 ${draft.saving ? "opacity-50" : ""}`}
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

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard all changes?"
          description="Moves, deletions and edits made since your last save will be lost."
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirmDiscard(false);
            setEditingId(null);
            draft.discard();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}

      {leaveAction != null && (
        <UnsavedChangesDialog
          saving={draft.saving}
          onSave={handleSaveAndLeave}
          onDiscard={() => leave(leaveAction)}
          onStay={() => setLeaveAction(null)}
        />
      )}
    </KeyboardAvoider>
  );
}
