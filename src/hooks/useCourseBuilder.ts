// src/hooks/useCourseBuilder.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface CourseLesson {
  id: string;
  module_id: string;
  title: string;
  content: string | null;
  media_url: string | null;
  // Requires the is_free_preview column added by the
  // ako_projects_v4_course_progress migration. Defaulted with `?? false`
  // wherever a lesson is read, so existing rows (or a DB that hasn't run
  // the migration yet) just read as "not previewable" instead of crashing.
  is_free_preview: boolean;
  sort_order: number;
}

export interface CourseModule {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  lessons: CourseLesson[];
}

// One query, assembled client-side into modules-with-lessons — this
// is a builder/player screen, not an infinite feed, so there's no
// pagination concern that would push us toward separate queries.
export function useCourseModules(projectId: string | undefined) {
  return useQuery({
    queryKey: ["course-modules", projectId],
    queryFn: async (): Promise<CourseModule[]> => {
      const { data: modules, error: modulesError } = await supabase
        .from("course_modules")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (modulesError) throw modulesError;

      const { data: lessons, error: lessonsError } = await supabase
        .from("course_lessons")
        .select("*")
        .in("module_id", (modules ?? []).map((m) => m.id))
        .order("sort_order", { ascending: true });
      if (lessonsError) throw lessonsError;

      return (modules ?? []).map((m) => ({
        ...m,
        lessons: (lessons ?? [])
          .filter((l) => l.module_id === m.id)
          .map((l) => ({ ...l, is_free_preview: l.is_free_preview ?? false })) as CourseLesson[],
      }));
    },
    enabled: !!projectId,
  });
}

function invalidateCourse(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["course-modules", projectId] });
}

export function useAddModule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ title, sortOrder }: { title: string; sortOrder: number }) => {
      const { error } = await supabase
        .from("course_modules")
        .insert({ project_id: projectId, title, sort_order: sortOrder });
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useUpdateModuleTitle(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ moduleId, title }: { moduleId: string; title: string }) => {
      const { error } = await supabase.from("course_modules").update({ title }).eq("id", moduleId);
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

// Reordering is a simple adjacent swap (move up/down) rather than
// drag-and-drop — same amount of end-user control for a curriculum
// that's usually a handful of sections, without a drag library.
export function useMoveModule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      modules,
      moduleId,
      direction,
    }: {
      modules: CourseModule[];
      moduleId: string;
      direction: "up" | "down";
    }) => {
      const idx = modules.findIndex((m) => m.id === moduleId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= modules.length) return;
      const a = modules[idx];
      const b = modules[swapIdx];
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("course_modules").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("course_modules").update({ sort_order: a.sort_order }).eq("id", b.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useDeleteModule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (moduleId: string) => {
      // Lessons under this module have no ON DELETE CASCADE in the
      // migration, so remove them first or the FK will reject this.
      await supabase.from("course_lessons").delete().eq("module_id", moduleId);
      const { error } = await supabase.from("course_modules").delete().eq("id", moduleId);
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export interface LessonInput {
  moduleId: string;
  title: string;
  content?: string;
  mediaUrl?: string;
  isFreePreview?: boolean;
  sortOrder: number;
}

export function useAddLesson(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: LessonInput) => {
      const { error } = await supabase.from("course_lessons").insert({
        module_id: input.moduleId,
        title: input.title,
        content: input.content ?? null,
        media_url: input.mediaUrl ?? null,
        is_free_preview: input.isFreePreview ?? false,
        sort_order: input.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export interface LessonEditInput {
  lessonId: string;
  title: string;
  content?: string;
  mediaUrl?: string;
  isFreePreview: boolean;
}

export function useUpdateLesson(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: LessonEditInput) => {
      const { error } = await supabase
        .from("course_lessons")
        .update({
          title: input.title,
          content: input.content ?? null,
          media_url: input.mediaUrl ?? null,
          is_free_preview: input.isFreePreview,
        })
        .eq("id", input.lessonId);
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useDeleteLesson(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("course_lessons").delete().eq("id", lessonId);
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useMoveLesson(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      lessons,
      lessonId,
      direction,
    }: {
      lessons: CourseLesson[];
      lessonId: string;
      direction: "up" | "down";
    }) => {
      const idx = lessons.findIndex((l) => l.id === lessonId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= lessons.length) return;
      const a = lessons[idx];
      const b = lessons[swapIdx];
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("course_lessons").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("course_lessons").update({ sort_order: a.sort_order }).eq("id", b.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

// Publishing just means setting the project active with published_at
// set — no separate "course_status" to manage. The purchase edge
// function is what actually enforces "can't buy before this is set";
// this hook only flips it.
export function usePublishCourse(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({ status: "active", published_at: new Date().toISOString() })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-detail", projectId] });
    },
  });
}

// ---------------------------------------------------------------
// Progress tracking — the Udemy-style "checkmark per completed
// lecture" + overall course progress. Backed by course_lesson_progress
// from the ako_projects_v4_course_progress migration; that table does
// not exist until that migration is run. The query below treats a
// missing-table error as "no progress yet" rather than crashing the
// whole course page, so the course is still usable (just without
// persisted progress) before the migration lands.
// ---------------------------------------------------------------

export function useCourseProgress(projectId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["course-progress", projectId, userId],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("course_lesson_progress")
        .select("lesson_id")
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) {
        console.warn("course_lesson_progress unavailable — has the migration run yet?", error);
        return new Set<string>();
      }
      return new Set((data ?? []).map((r) => r.lesson_id as string));
    },
    enabled: !!projectId && !!userId,
  });
}

export function useSetLessonComplete(projectId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: string; completed: boolean }) => {
      if (!userId) throw new Error("Sign in to track your progress.");
      if (completed) {
        const { error } = await supabase
          .from("course_lesson_progress")
          .upsert(
            { project_id: projectId, lesson_id: lessonId, user_id: userId },
            { onConflict: "lesson_id,user_id" }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("course_lesson_progress")
          .delete()
          .eq("lesson_id", lessonId)
          .eq("user_id", userId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course-progress", projectId, userId] }),
  });
}
