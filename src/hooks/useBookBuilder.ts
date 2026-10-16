// src/hooks/useBookBuilder.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

// Optional named front/back-matter sections the builder offers as
// toggles — adding one in is "turning it on", removing it is "turning
// it off". 'chapter' is the one kind a host adds freely, as many as
// they want, same as course lessons.
export type BookChapterKind =
  | "dedication"
  | "foreword"
  | "preface"
  | "introduction"
  | "prologue"
  | "chapter"
  | "epilogue"
  | "afterword"
  | "acknowledgments"
  | "about_author"
  | "appendix";

// Short guidance shown as a placeholder/hint in the builder for each
// optional section — "the app gives them the template to follow".
export const BOOK_SECTION_INFO: Record<
  BookChapterKind,
  { label: string; optional: boolean; hint: string }
> = {
  dedication: {
    label: "Dedication",
    optional: true,
    hint: "A short line dedicating the book to someone — often just a sentence.",
  },
  foreword: {
    label: "Foreword",
    optional: true,
    hint: "Usually written by someone other than you, introducing the book and why it matters.",
  },
  preface: {
    label: "Preface",
    optional: true,
    hint: "Your own note on why and how you wrote this book.",
  },
  introduction: {
    label: "Introduction",
    optional: true,
    hint: "Sets up what the reader is about to learn or experience.",
  },
  prologue: {
    label: "Prologue",
    optional: true,
    hint: "An opening scene or moment before Chapter One, common in fiction.",
  },
  chapter: {
    label: "Chapter",
    optional: false,
    hint: "Write your chapter here.",
  },
  epilogue: {
    label: "Epilogue",
    optional: true,
    hint: "A closing scene after the main story ends.",
  },
  afterword: {
    label: "Afterword",
    optional: true,
    hint: "Reflections after the main content — what happened since, or what you'd add today.",
  },
  acknowledgments: {
    label: "Acknowledgments",
    optional: true,
    hint: "Thank the people who helped make this happen.",
  },
  about_author: {
    label: "About the Author",
    optional: true,
    hint: "A short bio for the back of the book.",
  },
  appendix: {
    label: "Appendix",
    optional: true,
    hint: "Reference material, sources, or extra detail that supports the main text.",
  },
};

// Order these are conventionally offered in the builder's "add a
// section" list — chapters aren't in here since they're added
// directly via "+ Add chapter", not from this picker.
export const OPTIONAL_SECTION_ORDER: BookChapterKind[] = [
  "dedication",
  "foreword",
  "preface",
  "introduction",
  "prologue",
  "epilogue",
  "afterword",
  "acknowledgments",
  "about_author",
  "appendix",
];

export interface BookChapter {
  id: string;
  project_id: string;
  kind: BookChapterKind;
  title: string;
  content: string | null;
  sort_order: number;
}

export function useBookChapters(projectId: string | undefined) {
  return useQuery({
    queryKey: ["book-chapters", projectId],
    queryFn: async (): Promise<BookChapter[]> => {
      const { data, error } = await supabase
        .from("book_chapters")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookChapter[];
    },
    enabled: !!projectId,
  });
}

function invalidateBook(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["book-chapters", projectId] });
}

export function useAddChapter(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      kind,
      title,
      sortOrder,
    }: {
      kind: BookChapterKind;
      title: string;
      sortOrder: number;
    }) => {
      const { data, error } = await supabase
        .from("book_chapters")
        .insert({ project_id: projectId, kind, title, sort_order: sortOrder })
        .select()
        .single();
      if (error) throw error;
      return data as BookChapter;
    },
    onSuccess: () => invalidateBook(queryClient, projectId),
  });
}

export function useUpdateChapter(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      chapterId,
      title,
      content,
    }: {
      chapterId: string;
      title: string;
      content: string;
    }) => {
      const { error } = await supabase
        .from("book_chapters")
        .update({ title, content })
        .eq("id", chapterId);
      if (error) throw error;
    },
    onSuccess: () => invalidateBook(queryClient, projectId),
  });
}

// Reordering is a simple adjacent swap (move up/down), same as
// course modules/lessons — plenty of control for a book's chapter
// list without pulling in a drag-and-drop library.
export function useMoveChapter(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({
      chapters,
      chapterId,
      direction,
    }: {
      chapters: BookChapter[];
      chapterId: string;
      direction: "up" | "down";
    }) => {
      const idx = chapters.findIndex((c) => c.id === chapterId);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= chapters.length) return;
      const a = chapters[idx];
      const b = chapters[swapIdx];
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("book_chapters").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("book_chapters").update({ sort_order: a.sort_order }).eq("id", b.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
    },
    onSuccess: () => invalidateBook(queryClient, projectId),
  });
}

export function useDeleteChapter(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { blocking: true },
    mutationFn: async (chapterId: string) => {
      const { error } = await supabase.from("book_chapters").delete().eq("id", chapterId);
      if (error) throw error;
    },
    onSuccess: () => invalidateBook(queryClient, projectId),
  });
}

// Chapters added in the builder get a temporary id until the creator saves.
export const isTempChapterId = (id: string) => id.startsWith("tmp-");

// The builder works on a local draft (add / edit / move / delete are all staged);
// nothing touches the database until the creator taps Save. This applies the
// difference between what's stored and the draft: deletes, then edits + new
// order, then inserts (last, so a retry after a partial failure can't duplicate).
export function useSaveBookDraft(projectId: string) {
  return useMutation({
    meta: { blocking: true },
    mutationFn: async ({ original, draft }: { original: BookChapter[]; draft: BookChapter[] }): Promise<BookChapter[]> => {
      const draftIds = new Set(draft.map((c) => c.id));
      const removed = original.filter((c) => !draftIds.has(c.id)).map((c) => c.id);
      if (removed.length > 0) {
        const { error } = await supabase.from("book_chapters").delete().in("id", removed);
        if (error) throw error;
      }

      const byId = new Map(original.map((c) => [c.id, c]));
      const updates: PromiseLike<{ error: unknown }>[] = [];
      const inserts: { project_id: string; kind: BookChapterKind; title: string; content: string; sort_order: number }[] = [];
      draft.forEach((c, i) => {
        const title = c.title.trim() || "Untitled";
        const content = c.content ?? "";
        if (isTempChapterId(c.id)) {
          inserts.push({ project_id: projectId, kind: c.kind, title, content, sort_order: i });
          return;
        }
        const prev = byId.get(c.id);
        if (!prev) return;
        if (prev.title !== title || (prev.content ?? "") !== content || prev.sort_order !== i) {
          updates.push(supabase.from("book_chapters").update({ title, content, sort_order: i }).eq("id", c.id));
        }
      });
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      if (inserts.length > 0) {
        const { error } = await supabase.from("book_chapters").insert(inserts);
        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("book_chapters")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookChapter[];
    },
  });
}

// Publishing just means setting the project active with published_at
// set, same as Course — the purchase edge function is what actually
// enforces "can't buy before this is set".
export function usePublishBook(projectId: string) {
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
// Reading progress — shared table with PDF-mode books
// (book_reading_progress), but authored books only ever populate
// current_chapter_id/scroll_fraction, never current_page/total_pages.
// ---------------------------------------------------------------

export interface BookProgress {
  current_chapter_id: string | null;
  scroll_fraction: number | null;
}

export function useBookProgress(projectId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["book-progress", projectId, userId],
    queryFn: async (): Promise<BookProgress | null> => {
      const { data, error } = await supabase
        .from("book_reading_progress")
        .select("current_chapter_id, scroll_fraction")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.warn("book_reading_progress unavailable — has the migration run yet?", error);
        return null;
      }
      return data;
    },
    enabled: !!projectId && !!userId,
  });
}

// Debounced by the caller (BookReader/authored view) — not meant to
// fire on every scroll tick, same spirit as the PDF reader's own
// progress save.
export function useSaveBookProgress(projectId: string, userId: string | undefined) {
  return useMutation({
    mutationFn: async ({
      chapterId,
      scrollFraction,
    }: {
      chapterId: string;
      scrollFraction: number;
    }) => {
      if (!userId) return;
      const { error } = await supabase.from("book_reading_progress").upsert(
        {
          project_id: projectId,
          user_id: userId,
          current_chapter_id: chapterId,
          scroll_fraction: scrollFraction,
        },
        { onConflict: "user_id,project_id" }
      );
      if (error) throw error;
    },
  });
}

// ---------------------------------------------------------------
// Bookmarks — a saved spot (chapter + how far down) with a short text
// snippet so the Bookmarks list reads like Apple Books. Private to the
// reader (RLS: own rows only). See supabase/ako_book_bookmarks.sql.
// ---------------------------------------------------------------

export interface BookBookmark {
  id: string;
  project_id: string;
  chapter_id: string;
  scroll_fraction: number;
  snippet: string | null;
  created_at: string;
}

export function useBookBookmarks(projectId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["book-bookmarks", projectId, userId],
    queryFn: async (): Promise<BookBookmark[]> => {
      const { data, error } = await supabase
        .from("book_bookmarks")
        .select("id, project_id, chapter_id, scroll_fraction, snippet, created_at")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("book_bookmarks unavailable — has the migration run yet?", error);
        return [];
      }
      return (data ?? []).map((r) => ({ ...r, scroll_fraction: Number(r.scroll_fraction) })) as BookBookmark[];
    },
    enabled: !!projectId && !!userId,
  });
}

export function useAddBookBookmark(projectId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      chapterId,
      scrollFraction,
      snippet,
    }: {
      chapterId: string;
      scrollFraction: number;
      snippet: string;
    }) => {
      if (!userId) throw new Error("Sign in to save bookmarks.");
      const { data, error } = await supabase
        .from("book_bookmarks")
        .insert({
          project_id: projectId,
          user_id: userId,
          chapter_id: chapterId,
          scroll_fraction: Math.min(1, Math.max(0, scrollFraction)),
          snippet: snippet.slice(0, 160),
        })
        .select("id, project_id, chapter_id, scroll_fraction, snippet, created_at")
        .single();
      if (error) throw error;
      return { ...data, scroll_fraction: Number(data.scroll_fraction) } as BookBookmark;
    },
    // Optimistic: the ribbon fills the instant it's tapped; the refetch reconciles ids.
    onSuccess: (created) => {
      queryClient.setQueryData<BookBookmark[]>(["book-bookmarks", projectId, userId], (old) => [created, ...(old ?? [])]);
    },
  });
}

export function useDeleteBookBookmark(projectId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      const { error } = await supabase.from("book_bookmarks").delete().eq("id", bookmarkId);
      if (error) throw error;
      return bookmarkId;
    },
    onMutate: async (bookmarkId) => {
      const key = ["book-bookmarks", projectId, userId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<BookBookmark[]>(key);
      queryClient.setQueryData<BookBookmark[]>(key, (old) => (old ?? []).filter((b) => b.id !== bookmarkId));
      return { prev, key };
    },
    onError: (_e, _id, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
  });
}
