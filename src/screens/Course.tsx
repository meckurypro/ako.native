// src/screens/Course.tsx
// Course viewer + builder. Owners edit the curriculum in place; buyers (or anyone,
// for free-preview lessons) play lessons and track progress.
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  FileText,
  Lock,
  PartyPopper,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedDoorway } from "@/components/project/FeedDoorway";
import { LessonMedia } from "@/components/project/LessonMedia";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import {
  useAddLesson,
  useAddModule,
  useCourseModules,
  useCourseProgress,
  useDeleteLesson,
  useDeleteModule,
  useMoveLesson,
  useMoveModule,
  usePublishCourse,
  useSetLessonComplete,
  useUpdateLesson,
  useUpdateModuleTitle,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";
import { useFeedDoorway } from "@/hooks/useFeedDoorway";
import { isProjectFree, useHasPurchased, useProject } from "@/hooks/useProjects";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const AUTO_COMPLETE_MS = 4000;

interface LessonFormValue {
  title: string;
  content: string;
  mediaUrl: string;
  isFreePreview: boolean;
}

function LessonForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: LessonFormValue;
  submitLabel: string;
  pending: boolean;
  onSubmit: (value: LessonFormValue) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initial);
  const inputClass = "w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink";
  const inputStyle = { fontFamily: "Inter_400Regular" } as const;
  const canSubmit = !!value.title.trim() && !pending;

  return (
    <View className="mt-2 gap-1.5">
      <TextInput
        placeholder="Lesson title"
        placeholderTextColor={colors.inkMuted}
        value={value.title}
        onChangeText={(title) => setValue({ ...value, title })}
        className={inputClass}
        style={inputStyle}
        returnKeyType="next"
        accessibilityLabel="Lesson title"
      />
      <TextInput
        placeholder="Video link (YouTube, Vimeo, or a direct video URL) — optional"
        placeholderTextColor={colors.inkMuted}
        value={value.mediaUrl}
        onChangeText={(mediaUrl) => setValue({ ...value, mediaUrl })}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        className={inputClass}
        style={inputStyle}
        accessibilityLabel="Video link"
      />
      <TextInput
        placeholder="Article text / lesson notes (optional)"
        placeholderTextColor={colors.inkMuted}
        value={value.content}
        onChangeText={(content) => setValue({ ...value, content })}
        multiline
        textAlignVertical="top"
        className={inputClass}
        style={[inputStyle, { minHeight: 68 }]}
        accessibilityLabel="Lesson notes"
      />
      <Pressable
        onPress={() => setValue({ ...value, isFreePreview: !value.isFreePreview })}
        accessibilityRole="switch"
        accessibilityState={{ checked: value.isFreePreview }}
        className={`flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 ${
          value.isFreePreview ? "border-accent bg-accent" : "border-border bg-surface"
        }`}
      >
        <Icon as={Eye} size={12} className={value.isFreePreview ? "text-canvas" : "text-ink-muted"} />
        <Text className={`text-xs font-medium ${value.isFreePreview ? "text-canvas" : "text-ink-muted"}`}>Free preview</Text>
      </Pressable>
      <View className="mt-0.5 flex-row items-center gap-4">
        <Pressable onPress={() => canSubmit && onSubmit(value)} disabled={!canSubmit} accessibilityRole="button" hitSlop={8} className={canSubmit ? "" : "opacity-50"}>
          <Text className="text-xs font-medium text-accent">{pending ? "Saving…" : submitLabel}</Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}>
          <Text className="text-xs text-ink-muted">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

type PendingDelete = { kind: "module" | "lesson"; id: string; label: string } | null;

export function Course() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { colors } = useTheme();
  const { user } = useAuth();

  const { data: project } = useProject(projectId);
  const isOwner = !!user && project?.owner_id === user.id;
  const isFree = !!project && isProjectFree(project);
  const hasPurchasedQuery = useHasPurchased(projectId ?? "");
  const hasAccess = isOwner || isFree || !!hasPurchasedQuery.data;

  const { data: modules } = useCourseModules(projectId);
  const progressQuery = useCourseProgress(projectId, user?.id);
  const completedIds = useMemo(() => progressQuery.data ?? new Set<string>(), [progressQuery.data]);
  const setLessonComplete = useSetLessonComplete(projectId ?? "", user?.id);

  const addModule = useAddModule(projectId ?? "");
  const updateModuleTitle = useUpdateModuleTitle(projectId ?? "");
  const moveModule = useMoveModule(projectId ?? "");
  const deleteModule = useDeleteModule(projectId ?? "");
  const addLesson = useAddLesson(projectId ?? "");
  const updateLesson = useUpdateLesson(projectId ?? "");
  const deleteLesson = useDeleteLesson(projectId ?? "");
  const moveLesson = useMoveLesson(projectId ?? "");
  const publishCourse = usePublishCourse(projectId ?? "");

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editingModuleTitle, setEditingModuleTitle] = useState("");
  const [lessonDraftFor, setLessonDraftFor] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const flatLessons = useMemo(() => (modules ?? []).flatMap((m) => m.lessons), [modules]);
  const totalLessons = flatLessons.length;
  const completedCount = flatLessons.filter((l) => completedIds.has(l.id)).length;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const allComplete = totalLessons > 0 && completedCount === totalLessons;
  const courseDoorway = useFeedDoorway("course_complete");

  // Land on the first lesson the learner hasn't finished.
  useEffect(() => {
    if (selectedLessonId || !hasAccess || flatLessons.length === 0 || progressQuery.isLoading) return;
    const firstIncomplete = flatLessons.find((l) => !completedIds.has(l.id));
    setSelectedLessonId((firstIncomplete ?? flatLessons[0]).id);
  }, [hasAccess, flatLessons, progressQuery.isLoading, selectedLessonId, completedIds]);

  const selectedLesson = flatLessons.find((l) => l.id === selectedLessonId) ?? null;
  const canOpen = useCallback((lesson: CourseLesson) => hasAccess || lesson.is_free_preview, [hasAccess]);
  const selectedIndex = selectedLesson ? flatLessons.findIndex((l) => l.id === selectedLesson.id) : -1;
  const prevLesson = selectedIndex > 0 ? flatLessons[selectedIndex - 1] : null;
  const nextLesson = selectedIndex >= 0 && selectedIndex < flatLessons.length - 1 ? flatLessons[selectedIndex + 1] : null;

  // Text-only lessons count as done after a short read; lessons with media complete when the media ends.
  const markComplete = setLessonComplete.mutate;
  useEffect(() => {
    if (!selectedLesson || !hasAccess || selectedLesson.media_url) return;
    if (completedIds.has(selectedLesson.id)) return;
    const timer = setTimeout(() => markComplete({ lessonId: selectedLesson.id, completed: true }), AUTO_COMPLETE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLesson?.id, hasAccess]);

  const fail = useCallback((e: unknown) => toast(e instanceof Error && e.message ? e.message : "Something went wrong.", { variant: "error" }), [toast]);

  function toggleModuleCollapsed(moduleId: string) {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  async function handleAddModule() {
    const title = newModuleTitle.trim();
    if (!title) return;
    try {
      await addModule.mutateAsync({ title, sortOrder: modules?.length ?? 0 });
      setNewModuleTitle("");
      haptics.light();
    } catch (e) {
      fail(e);
    }
  }

  function selectLesson(lesson: CourseLesson) {
    if (!canOpen(lesson)) return;
    haptics.selection();
    setSelectedLessonId(lesson.id);
  }

  function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    const mutation = target.kind === "module" ? deleteModule : deleteLesson;
    mutation.mutate(target.id, { onError: fail });
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  const modulesList = modules ?? [];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title={project.title} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
      >
        {isOwner && (
          <View className="mb-4 flex-row items-center justify-between rounded-xl bg-accent-soft/60 p-3">
            {project.published_at ? (
              <View className="flex-row items-center gap-1.5">
                <Icon as={CheckCircle2} size={14} className="text-accent" />
                <Text className="text-sm text-accent">Published</Text>
              </View>
            ) : (
              <Text className="flex-1 pr-2 text-sm text-ink-muted">Draft — not visible to buyers yet</Text>
            )}
            {!project.published_at && (
              <Pressable
                onPress={() => publishCourse.mutate(undefined, { onSuccess: () => haptics.success(), onError: fail })}
                disabled={publishCourse.isPending || modulesList.length === 0}
                accessibilityRole="button"
                className={`rounded-full bg-accent px-3 py-1.5 ${publishCourse.isPending || modulesList.length === 0 ? "opacity-50" : ""}`}
              >
                <Text className="text-xs font-medium text-canvas">{publishCourse.isPending ? "Publishing…" : "Publish"}</Text>
              </Pressable>
            )}
          </View>
        )}

        {hasAccess && totalLessons > 0 && (
          <View className="mb-4">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-xs text-ink-muted">
                {completedCount}/{totalLessons} lessons complete
              </Text>
              <Text className="text-xs text-ink-muted">{progressPct}%</Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-border">
              <View className="h-full bg-accent" style={{ width: `${progressPct}%` }} />
            </View>
            {allComplete && (
              <View className="mt-2 flex-row items-center gap-1.5">
                <Icon as={PartyPopper} size={15} className="text-accent" />
                <Text className="text-sm font-medium text-accent">Course complete!</Text>
              </View>
            )}
            {allComplete && courseDoorway.visible && <FeedDoorway context="course_complete" onEnter={courseDoorway.markEnteredFeed} />}
          </View>
        )}

        {!hasAccess && (
          <View className="mb-5 mt-2 items-center gap-2 rounded-xl border border-border bg-surface p-4">
            <Icon as={Lock} size={22} className="text-ink-muted" />
            <Text className="text-center text-sm text-ink-muted">
              {flatLessons.some((l) => l.is_free_preview)
                ? "Preview a free lesson below, or buy the course to unlock everything."
                : "Buy this course from its project page to unlock every lesson."}
            </Text>
            <Pressable onPress={() => router.push(`/projects/${projectId}` as Href)} accessibilityRole="link" hitSlop={8}>
              <Text className="text-sm font-medium text-accent">Go to project page</Text>
            </Pressable>
          </View>
        )}

        {selectedLesson && canOpen(selectedLesson) && (
          <View className="mb-4 rounded-xl border border-border bg-surface p-3">
            <View className="mb-2 flex-row items-center justify-between gap-2">
              <Text className="min-w-0 flex-1 text-sm font-medium text-ink">{selectedLesson.title}</Text>
              {!hasAccess && selectedLesson.is_free_preview && (
                <View className="shrink-0 flex-row items-center gap-1">
                  <Icon as={Eye} size={12} className="text-accent" />
                  <Text className="text-xs font-medium text-accent">Preview</Text>
                </View>
              )}
            </View>

            {selectedLesson.media_url && (
              <LessonMedia
                url={selectedLesson.media_url}
                onWatched={() => {
                  if (hasAccess) markComplete({ lessonId: selectedLesson.id, completed: true });
                }}
              />
            )}
            {selectedLesson.content ? <Text selectable className="mb-2 text-sm text-ink">{selectedLesson.content}</Text> : null}
            {!selectedLesson.media_url && !selectedLesson.content && <Text className="mb-2 text-sm text-ink-muted">No content yet.</Text>}

            {hasAccess && (
              <Pressable
                onPress={() => markComplete({ lessonId: selectedLesson.id, completed: !completedIds.has(selectedLesson.id) })}
                disabled={setLessonComplete.isPending}
                accessibilityRole="button"
                className={`flex-row items-center gap-1.5 self-start ${setLessonComplete.isPending ? "opacity-50" : ""}`}
              >
                {completedIds.has(selectedLesson.id) ? (
                  <>
                    <Icon as={CheckCircle2} size={16} className="text-accent" />
                    <Text className="text-sm font-medium text-accent">Completed — mark incomplete</Text>
                  </>
                ) : (
                  <>
                    <Icon as={Circle} size={16} className="text-ink-muted" />
                    <Text className="text-sm font-medium text-ink-muted">Mark as complete</Text>
                  </>
                )}
              </Pressable>
            )}

            <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
              <Pressable onPress={() => prevLesson && selectLesson(prevLesson)} disabled={!prevLesson} accessibilityRole="button" hitSlop={8} className={prevLesson ? "" : "opacity-30"}>
                <Text className="text-xs font-medium text-ink-muted">← Previous</Text>
              </Pressable>
              <Pressable
                onPress={() => nextLesson && selectLesson(nextLesson)}
                disabled={!nextLesson || !canOpen(nextLesson)}
                accessibilityRole="button"
                hitSlop={8}
                className={nextLesson && canOpen(nextLesson) ? "" : "opacity-30"}
              >
                <Text className={`text-xs font-medium ${nextLesson && canOpen(nextLesson) ? "text-accent" : "text-ink-muted"}`}>Next →</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View className="gap-3">
          {modulesList.map((m, moduleIdx) => {
            const collapsed = collapsedModules.has(m.id);
            return (
              <View key={m.id} className="rounded-xl border border-border bg-surface p-3">
                <View className="mb-1.5 flex-row items-center justify-between gap-2">
                  {editingModuleId === m.id ? (
                    <View className="flex-1 flex-row items-center gap-2">
                      <TextInput
                        autoFocus
                        value={editingModuleTitle}
                        onChangeText={setEditingModuleTitle}
                        placeholderTextColor={colors.inkMuted}
                        className="flex-1 rounded-lg border border-border bg-canvas px-2 py-1 text-sm text-ink"
                        style={{ fontFamily: "Inter_400Regular" }}
                        returnKeyType="done"
                        onSubmitEditing={async () => {
                          if (!editingModuleTitle.trim()) return;
                          try {
                            await updateModuleTitle.mutateAsync({ moduleId: m.id, title: editingModuleTitle.trim() });
                            setEditingModuleId(null);
                          } catch (e) {
                            fail(e);
                          }
                        }}
                        accessibilityLabel="Section title"
                      />
                      <Pressable
                        onPress={async () => {
                          if (!editingModuleTitle.trim()) return;
                          try {
                            await updateModuleTitle.mutateAsync({ moduleId: m.id, title: editingModuleTitle.trim() });
                            setEditingModuleId(null);
                          } catch (e) {
                            fail(e);
                          }
                        }}
                        hitSlop={8}
                      >
                        <Text className="text-xs font-medium text-accent">Save</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditingModuleId(null)} hitSlop={8}>
                        <Text className="text-xs text-ink-muted">Cancel</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => toggleModuleCollapsed(m.id)} accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} className="min-w-0 flex-1 flex-row items-center gap-1.5">
                      <Icon as={collapsed ? ChevronDown : ChevronUp} size={14} className="text-ink-muted" />
                      <Text numberOfLines={1} className="shrink text-sm font-medium text-ink">
                        Section {moduleIdx + 1}: {m.title}
                      </Text>
                      <Text className="text-xs text-ink-muted">({m.lessons.length})</Text>
                    </Pressable>
                  )}

                  {isOwner && editingModuleId !== m.id && (
                    <View className="shrink-0 flex-row items-center gap-3">
                      <Pressable onPress={() => moveModule.mutate({ modules: modulesList, moduleId: m.id, direction: "up" })} disabled={moduleIdx === 0} accessibilityLabel="Move section up" hitSlop={6} className={moduleIdx === 0 ? "opacity-30" : ""}>
                        <Icon as={ChevronUp} size={14} className="text-ink-muted" />
                      </Pressable>
                      <Pressable
                        onPress={() => moveModule.mutate({ modules: modulesList, moduleId: m.id, direction: "down" })}
                        disabled={moduleIdx === modulesList.length - 1}
                        accessibilityLabel="Move section down"
                        hitSlop={6}
                        className={moduleIdx === modulesList.length - 1 ? "opacity-30" : ""}
                      >
                        <Icon as={ChevronDown} size={14} className="text-ink-muted" />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setEditingModuleId(m.id);
                          setEditingModuleTitle(m.title);
                        }}
                        accessibilityLabel="Rename section"
                        hitSlop={6}
                      >
                        <Icon as={Pencil} size={14} className="text-ink-muted" />
                      </Pressable>
                      <Pressable onPress={() => setPendingDelete({ kind: "module", id: m.id, label: m.title })} accessibilityLabel="Delete section" hitSlop={6}>
                        <Icon as={Trash2} size={14} className="text-danger" />
                      </Pressable>
                    </View>
                  )}
                </View>

                {!collapsed && (
                  <View className="mb-2 gap-1">
                    {m.lessons.map((l, lessonIdx) => {
                      const locked = !canOpen(l);
                      const complete = completedIds.has(l.id);
                      const isSelected = selectedLessonId === l.id;
                      if (editingLessonId === l.id) {
                        return (
                          <LessonForm
                            key={l.id}
                            initial={{ title: l.title, content: l.content ?? "", mediaUrl: l.media_url ?? "", isFreePreview: l.is_free_preview }}
                            submitLabel="Save lesson"
                            pending={updateLesson.isPending}
                            onCancel={() => setEditingLessonId(null)}
                            onSubmit={async (value) => {
                              try {
                                await updateLesson.mutateAsync({
                                  lessonId: l.id,
                                  title: value.title.trim(),
                                  content: value.content.trim() || undefined,
                                  mediaUrl: value.mediaUrl.trim() || undefined,
                                  isFreePreview: value.isFreePreview,
                                });
                                setEditingLessonId(null);
                              } catch (e) {
                                fail(e);
                              }
                            }}
                          />
                        );
                      }
                      return (
                        <View key={l.id} className={`flex-row items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 ${isSelected ? "border-accent bg-accent-soft/40" : "border-border"}`}>
                          <Pressable
                            onPress={() => hasAccess && markComplete({ lessonId: l.id, completed: !complete })}
                            disabled={!hasAccess}
                            accessibilityLabel={complete ? "Mark incomplete" : "Mark complete"}
                            hitSlop={8}
                            className="shrink-0"
                          >
                            {locked ? (
                              <Icon as={Lock} size={14} className="text-ink-muted" />
                            ) : complete ? (
                              <Icon as={CheckCircle2} size={14} className="text-accent" />
                            ) : (
                              <Icon as={Circle} size={14} className="text-ink-muted" />
                            )}
                          </Pressable>
                          <Pressable onPress={() => selectLesson(l)} disabled={locked} accessibilityRole="button" accessibilityState={{ disabled: locked, selected: isSelected }} className="min-w-0 flex-1 flex-row items-center gap-1.5">
                            <Icon as={l.media_url ? PlayCircle : FileText} size={13} className="text-ink-muted" />
                            <Text numberOfLines={1} className={`shrink text-sm ${locked ? "text-ink-muted" : "text-ink"}`}>
                              {lessonIdx + 1}. {l.title}
                            </Text>
                            {!hasAccess && l.is_free_preview && <Text className="text-[11px] font-medium text-accent">Preview</Text>}
                          </Pressable>
                          {isOwner && (
                            <View className="shrink-0 flex-row items-center gap-2.5 pr-1">
                              <Pressable onPress={() => moveLesson.mutate({ lessons: m.lessons, lessonId: l.id, direction: "up" })} disabled={lessonIdx === 0} accessibilityLabel="Move lesson up" hitSlop={6} className={lessonIdx === 0 ? "opacity-30" : ""}>
                                <Icon as={ChevronUp} size={13} className="text-ink-muted" />
                              </Pressable>
                              <Pressable
                                onPress={() => moveLesson.mutate({ lessons: m.lessons, lessonId: l.id, direction: "down" })}
                                disabled={lessonIdx === m.lessons.length - 1}
                                accessibilityLabel="Move lesson down"
                                hitSlop={6}
                                className={lessonIdx === m.lessons.length - 1 ? "opacity-30" : ""}
                              >
                                <Icon as={ChevronDown} size={13} className="text-ink-muted" />
                              </Pressable>
                              <Pressable onPress={() => setEditingLessonId(l.id)} accessibilityLabel="Edit lesson" hitSlop={6}>
                                <Icon as={Pencil} size={13} className="text-ink-muted" />
                              </Pressable>
                              <Pressable onPress={() => setPendingDelete({ kind: "lesson", id: l.id, label: l.title })} accessibilityLabel="Delete lesson" hitSlop={6}>
                                <Icon as={Trash2} size={13} className="text-danger" />
                              </Pressable>
                            </View>
                          )}
                        </View>
                      );
                    })}
                    {m.lessons.length === 0 && <Text className="pl-3 text-xs text-ink-muted">No lessons yet.</Text>}
                  </View>
                )}

                {isOwner && !collapsed &&
                  (lessonDraftFor === m.id ? (
                    <LessonForm
                      initial={{ title: "", content: "", mediaUrl: "", isFreePreview: m.lessons.length === 0 }}
                      submitLabel="Add lesson"
                      pending={addLesson.isPending}
                      onCancel={() => setLessonDraftFor(null)}
                      onSubmit={async (value) => {
                        try {
                          await addLesson.mutateAsync({
                            moduleId: m.id,
                            title: value.title.trim(),
                            content: value.content.trim() || undefined,
                            mediaUrl: value.mediaUrl.trim() || undefined,
                            isFreePreview: value.isFreePreview,
                            sortOrder: m.lessons.length,
                          });
                          setLessonDraftFor(null);
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    />
                  ) : (
                    <Pressable onPress={() => setLessonDraftFor(m.id)} accessibilityRole="button" className="mt-1 flex-row items-center gap-1 self-start">
                      <Icon as={Plus} size={12} className="text-accent" />
                      <Text className="text-xs font-medium text-accent">Add lesson</Text>
                    </Pressable>
                  ))}
              </View>
            );
          })}

          {isOwner && (
            <View className="flex-row gap-2">
              <TextInput
                placeholder="New section title"
                placeholderTextColor={colors.inkMuted}
                value={newModuleTitle}
                onChangeText={setNewModuleTitle}
                onSubmitEditing={handleAddModule}
                returnKeyType="done"
                className="flex-1 rounded-full border border-border bg-canvas px-4 py-2.5 text-sm text-ink"
                style={{ fontFamily: "Inter_400Regular" }}
                accessibilityLabel="New section title"
              />
              <Pressable
                onPress={handleAddModule}
                disabled={addModule.isPending || !newModuleTitle.trim()}
                accessibilityRole="button"
                className={`justify-center rounded-full bg-accent px-4 py-2.5 ${addModule.isPending || !newModuleTitle.trim() ? "opacity-50" : ""}`}
              >
                <Text className="text-sm font-medium text-canvas">Add</Text>
              </Pressable>
            </View>
          )}

          {!isOwner && modulesList.length === 0 && <Text className="text-sm text-ink-muted">No content yet — check back later.</Text>}
        </View>
      </ScrollView>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === "module" ? "Delete this section?" : "Delete this lesson?"}
          description={
            pendingDelete.kind === "module"
              ? `“${pendingDelete.label}” and every lesson inside it will be removed. This can't be undone.`
              : `“${pendingDelete.label}” will be removed. This can't be undone.`
          }
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}
