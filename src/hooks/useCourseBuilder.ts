// src/hooks/useCourseBuilder.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { removeCourseVideos } from "../lib/courseVideo";
import { moveItem, orderWrites, safeHttpUrl } from "../lib/courseTypes";
import type { LessonType } from "../lib/courseTypes";

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
  // Added by ako_course_builder_v2.sql. Rows read before the migration fall back via `?? ` in useCourseModules.
  lesson_type: LessonType;
  /** Object path in the private course-videos bucket (an uploaded video). media_url holds a pasted link instead. */
  video_path: string | null;
  video_width: number | null;
  video_height: number | null;
  video_duration: number | null;
  /** Quiz: {questions, pass_mark}. Other types: null. */
  data: unknown | null;
}

export interface CourseModule {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  // True for the locked "Foreword" module the database builds from approved forewords: movable, never editable or
  // deletable here, and its single lesson is read-only too.
  is_foreword_managed?: boolean;
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

      // Someone who hasn't bought gets no module rows back (RLS). They still see the outline — titles and types only —
      // through course_outline(); lessons flagged as free previews then come back in full from the lessons query.
      type OutlineRow = {
        module_id: string; module_title: string; module_sort: number;
        lesson_id: string | null; lesson_title: string | null; lesson_sort: number | null;
        lesson_type: string | null; video_duration: number | null; is_free_preview: boolean;
      };
      let outline: OutlineRow[] = [];
      if ((modules ?? []).length === 0) {
        const { data: rows } = await supabase.rpc("course_outline", { p_project_id: projectId });
        outline = (rows ?? []) as OutlineRow[];
      }
      const moduleIds = (modules ?? []).length > 0 ? (modules ?? []).map((m) => m.id) : Array.from(new Set(outline.map((r) => r.module_id)));

      const { data: lessons, error: lessonsError } = await supabase
        .from("course_lessons")
        .select("*")
        .in("module_id", moduleIds)
        .order("sort_order", { ascending: true });
      if (lessonsError) throw lessonsError;

      const normalise = (l: Record<string, any>) =>
        ({
          ...l,
          is_free_preview: l.is_free_preview ?? false,
          lesson_type: l.lesson_type ?? (l.media_url || l.video_path ? "video" : "text"),
          video_path: l.video_path ?? null,
          video_width: l.video_width ?? null,
          video_height: l.video_height ?? null,
          video_duration: l.video_duration ?? null,
          data: l.data ?? null,
        }) as CourseLesson;

      if ((modules ?? []).length > 0) {
        return (modules ?? []).map((m) => ({
          ...m,
          lessons: (lessons ?? []).filter((l) => l.module_id === m.id).map(normalise),
        }));
      }

      const byModule = new Map<string, OutlineRow[]>();
      for (const r of outline) byModule.set(r.module_id, [...(byModule.get(r.module_id) ?? []), r]);
      const full = new Map((lessons ?? []).map((l) => [l.id as string, l]));
      return Array.from(byModule.entries()).map(([id, rows]) => ({
        id,
        project_id: projectId as string,
        title: rows[0].module_title,
        sort_order: rows[0].module_sort,
        is_foreword_managed: false,
        lessons: rows
          .filter((r) => r.lesson_id)
          .map((r) =>
            // Previews arrive whole; every other lesson is a locked placeholder (no content, link or video path).
            full.has(r.lesson_id as string)
              ? normalise(full.get(r.lesson_id as string)!)
              : normalise({
                  id: r.lesson_id,
                  module_id: id,
                  title: r.lesson_title ?? "",
                  content: null,
                  media_url: null,
                  sort_order: r.lesson_sort ?? 0,
                  is_free_preview: false,
                  lesson_type: r.lesson_type,
                  video_duration: r.video_duration,
                }),
          ),
      })) as CourseModule[];
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

// Adds several sections in ONE insert, so a failure can't leave half of them behind (a retry would then duplicate
// the ones that did land). Used by the setup wizard.
export function useAddModules(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ titles, startOrder }: { titles: string[]; startOrder: number }) => {
      if (titles.length === 0) return;
      const { error } = await supabase
        .from("course_modules")
        .insert(titles.map((title, i) => ({ project_id: projectId, title, sort_order: startOrder + i })));
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
      const to = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || to < 0 || to >= modules.length) return;
      // Write the new index of every row whose stored position differs, not a swap of the two positions: a swap
      // does nothing when both rows hold the same value, which is what a delete used to leave behind.
      const writes = orderWrites(moveItem(modules, idx, to));
      const results = await Promise.all(
        writes.map((w) => supabase.from("course_modules").update({ sort_order: w.sort_order }).eq("id", w.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useDeleteModule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (moduleId: string) => {
      const { data: vids } = await supabase.from("course_lessons").select("video_path").eq("module_id", moduleId);
      // The lessons go with the section (course_lessons.module_id is ON DELETE CASCADE). They used to be deleted
      // first with the error ignored, which could leave a section standing with its lessons already gone.
      const { error } = await supabase.from("course_modules").delete().eq("id", moduleId);
      if (error) throw error;
      void removeCourseVideos((vids ?? []).map((v) => v.video_path as string | null));
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export interface LessonMediaInput {
  lessonType: LessonType;
  /** Quiz definition; null for other types. */
  data?: unknown | null;
  videoPath?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoDuration?: number | null;
}

export interface LessonInput extends LessonMediaInput {
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
        lesson_type: input.lessonType,
        data: input.data ?? null,
        video_path: input.videoPath ?? null,
        video_width: input.videoWidth ?? null,
        video_height: input.videoHeight ?? null,
        video_duration: input.videoDuration ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export interface LessonEditInput extends LessonMediaInput {
  lessonId: string;
  title: string;
  content?: string;
  mediaUrl?: string;
  isFreePreview: boolean;
  /** The video the lesson had before this edit, so a replaced or removed upload can be cleaned up. */
  previousVideoPath?: string | null;
  /** Moves the lesson to another section (appended at the end). */
  moduleId?: string;
  sortOrder?: number;
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
          lesson_type: input.lessonType,
          data: input.data ?? null,
          video_path: input.videoPath ?? null,
          video_width: input.videoWidth ?? null,
          video_height: input.videoHeight ?? null,
          video_duration: input.videoDuration ?? null,
          ...(input.moduleId ? { module_id: input.moduleId, sort_order: input.sortOrder ?? 0 } : {}),
        })
        .eq("id", input.lessonId);
      if (error) throw error;
      // A replaced or removed upload is no longer referenced by anything.
      if (input.previousVideoPath && input.previousVideoPath !== (input.videoPath ?? null)) {
        void removeCourseVideos([input.previousVideoPath]);
      }
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

export function useDeleteLesson(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (lessonId: string) => {
      const { data: row } = await supabase.from("course_lessons").select("video_path").eq("id", lessonId).maybeSingle();
      const { error } = await supabase.from("course_lessons").delete().eq("id", lessonId);
      if (error) throw error;
      void removeCourseVideos([row?.video_path as string | null | undefined]);
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
      const to = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || to < 0 || to >= lessons.length) return;
      const writes = orderWrites(moveItem(lessons, idx, to));
      const results = await Promise.all(
        writes.map((w) => supabase.from("course_lessons").update({ sort_order: w.sort_order }).eq("id", w.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

// Saves a whole new order in one go (the reorder screen). Sections get their position in the list; every lesson gets
// its section and its position inside it, so a lesson dragged into another section moves there too. Only rows that
// actually changed are written.
export interface OutlineDraft {
  id: string;
  lessons: { id: string }[];
}

export function useSaveOutline(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ draft, current }: { draft: OutlineDraft[]; current: CourseModule[] }) => {
      const writes: PromiseLike<{ error: unknown }>[] = [];
      // Compare against the positions actually stored, not against list indices: when stored positions are gappy
      // or duplicated an index comparison skips rows that still need renumbering.
      const lessonNow = new Map<string, { moduleId: string; sortOrder: number }>();
      current.forEach((m) => m.lessons.forEach((l) => lessonNow.set(l.id, { moduleId: m.id, sortOrder: l.sort_order })));
      draft.forEach((m, mi) => {
        const was = current.find((c) => c.id === m.id);
        if (was && was.sort_order !== mi) {
          writes.push(supabase.from("course_modules").update({ sort_order: mi }).eq("id", m.id));
        }
        m.lessons.forEach((l, li) => {
          const prev = lessonNow.get(l.id);
          if (!prev || prev.moduleId !== m.id || prev.sortOrder !== li) {
            writes.push(supabase.from("course_lessons").update({ module_id: m.id, sort_order: li }).eq("id", l.id));
          }
        });
      });
      const results = await Promise.all(writes);
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
    },
    onSuccess: () => invalidateCourse(queryClient, projectId),
  });
}

// ---------------------------------------------------------------
// Course details — what learners will get, what they need first, who it's for.
// One row per course in course_details (ako_course_builder_v2.sql), readable by anyone signed in (it's the
// browsing info shown before anyone pays), writable by the owner.
// ---------------------------------------------------------------

export interface CourseDetails {
  project_id: string;
  subtitle: string | null;
  level: "beginner" | "intermediate" | "advanced" | "all" | null;
  language: string;
  objectives: string[];
  requirements: string[];
  audience: string[];
  /** Promo video: an upload (private bucket) or a pasted link. Shown to anyone deciding whether to buy. */
  promo_video_path: string | null;
  promo_url: string | null;
  promo_width: number | null;
  promo_height: number | null;
  promo_duration: number | null;
}

export function useCourseDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["course-details", projectId],
    queryFn: async (): Promise<CourseDetails | null> => {
      const { data, error } = await supabase.from("course_details").select("*").eq("project_id", projectId).maybeSingle();
      if (error) {
        console.warn("course_details unavailable — has the migration run yet?", error);
        return null;
      }
      return data
        ? { ...data, objectives: data.objectives ?? [], requirements: data.requirements ?? [], audience: data.audience ?? [], language: data.language ?? "English", promo_video_path: data.promo_video_path ?? null, promo_url: data.promo_url ?? null, promo_width: data.promo_width ?? null, promo_height: data.promo_height ?? null, promo_duration: data.promo_duration ?? null }
        : null;
    },
    enabled: !!projectId,
  });
}

export type CourseDetailsInput = Omit<CourseDetails, "project_id">;

export function useSaveCourseDetails(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (input: CourseDetailsInput & { previousPromoPath?: string | null }) => {
      const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
      const { error } = await supabase.from("course_details").upsert(
        {
          project_id: projectId,
          subtitle: input.subtitle?.trim() || null,
          level: input.level,
          language: input.language.trim() || "English",
          objectives: clean(input.objectives),
          requirements: clean(input.requirements),
          audience: clean(input.audience),
          promo_video_path: input.promo_video_path,
          promo_url: input.promo_video_path ? null : safeHttpUrl(input.promo_url),
          promo_width: input.promo_video_path ? input.promo_width : null,
          promo_height: input.promo_video_path ? input.promo_height : null,
          promo_duration: input.promo_video_path ? input.promo_duration : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" }
      );
      if (error) throw error;
      if (input.previousPromoPath && input.previousPromoPath !== input.promo_video_path) void removeCourseVideos([input.previousPromoPath]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course-details", projectId] }),
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
    // Awaited so the blocking overlay holds until the project (and
    // every list showing it) has refetched as published — the caller
    // navigates away right after this resolves.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", projectId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["project-detail", projectId], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["user-projects"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["page-projects"], refetchType: "all" }),
      ]);
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

// `record` = false for someone only previewing the course (a foreword invitee): the lesson flow carries on as normal
// but nothing is written, so a preview never turns into progress or enrollment.
export function useSetLessonComplete(projectId: string, userId: string | undefined, record = true) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: string; completed: boolean }) => {
      if (!record) return;
      if (!userId) throw new Error("Sign in to track your progress.");
      if (completed) {
        const { error } = await supabase
          .from("course_lesson_progress")
          .upsert(
            { project_id: projectId, lesson_id: lessonId, user_id: userId },
            // Already completed (re-watched video, double tap, second device)? Leave the row as it is.
            { onConflict: "lesson_id,user_id", ignoreDuplicates: true }
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

// ---------------------------------------------------------------
// Resume point — where the learner stopped. One row per learner per course (course_resume): the lesson, how far
// down it they had scrolled (fraction 0..1 of the scrollable length) and, for directly hosted video, the
// playback second. Separate from course_lesson_progress, which only records *completed* lessons.
// ---------------------------------------------------------------

export interface CourseResume {
  lesson_id: string | null;
  scroll_fraction: number | null;
  media_seconds: number | null;
}

export function useCourseResume(projectId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["course-resume", projectId, userId],
    queryFn: async (): Promise<CourseResume | null> => {
      const { data, error } = await supabase
        .from("course_resume")
        .select("lesson_id, scroll_fraction, media_seconds")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("course_resume unavailable", error);
        return null;
      }
      return data ? { lesson_id: data.lesson_id, scroll_fraction: data.scroll_fraction == null ? null : Number(data.scroll_fraction), media_seconds: data.media_seconds == null ? null : Number(data.media_seconds) } : null;
    },
    enabled: !!projectId && !!userId,
    // Only read when the course opens; the saves below write to the cache themselves, so a refetch must not
    // replace the position the learner is at with an older server copy mid-lesson.
    staleTime: Infinity,
  });
}

export function useSaveCourseResume(projectId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { lessonId: string; scrollFraction: number; mediaSeconds?: number | null }) => {
      if (!userId) return;
      const { error } = await supabase.from("course_resume").upsert(
        {
          project_id: projectId,
          user_id: userId,
          lesson_id: v.lessonId,
          scroll_fraction: Math.min(1, Math.max(0, v.scrollFraction)),
          media_seconds: v.mediaSeconds == null ? null : Math.max(0, v.mediaSeconds),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,project_id" }
      );
      if (error) throw error;
    },
    onMutate: (v) => {
      queryClient.setQueryData<CourseResume>(["course-resume", projectId, userId], {
        lesson_id: v.lessonId,
        scroll_fraction: v.scrollFraction,
        media_seconds: v.mediaSeconds ?? null,
      });
    },
  });
}
