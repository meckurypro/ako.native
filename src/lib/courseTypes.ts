// src/lib/courseTypes.ts
// Pure helpers for course lesson types, quizzes and video metadata (no React, no platform APIs).
// KEEP IDENTICAL in ako (web) and ako.native — change both together.

export type LessonType = "video" | "text" | "quiz" | "assignment";

export const LESSON_TYPES: { type: LessonType; label: string; hint: string }[] = [
  { type: "video", label: "Video", hint: "Upload or link a video" },
  { type: "text", label: "Reading", hint: "Written lesson" },
  { type: "quiz", label: "Quiz", hint: "Questions with a pass mark" },
  { type: "assignment", label: "Assignment", hint: "A task to complete" },
];

export function lessonTypeLabel(t: LessonType): string {
  return LESSON_TYPES.find((x) => x.type === t)?.label ?? "Lesson";
}

/** Rows made before lesson types existed may come back without one. */
export function lessonTypeOf(l: { lesson_type?: string | null; media_url?: string | null; video_path?: string | null }): LessonType {
  const t = l.lesson_type;
  if (t === "video" || t === "text" || t === "quiz" || t === "assignment") return t;
  return l.media_url || l.video_path ? "video" : "text";
}

// ── Quiz ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** Index into options. */
  correct: number;
  explanation?: string;
}
export interface QuizData {
  questions: QuizQuestion[];
  /** Percent needed to pass, 1–100. */
  pass_mark: number;
}

export const DEFAULT_PASS_MARK = 70;
export const MAX_QUIZ_OPTIONS = 6;
export const MIN_QUIZ_OPTIONS = 2;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyQuestion(): QuizQuestion {
  return { id: newId(), prompt: "", options: ["", ""], correct: 0 };
}

export function parseQuiz(data: unknown): QuizData {
  const d = (data ?? {}) as Partial<QuizData>;
  const questions = Array.isArray(d.questions)
    ? d.questions
        .filter((q): q is QuizQuestion => !!q && typeof q.prompt === "string" && Array.isArray(q.options))
        .map((q) => ({
          id: q.id || newId(),
          prompt: q.prompt,
          options: q.options.map((o) => String(o)),
          correct: Number.isInteger(q.correct) ? q.correct : 0,
          explanation: q.explanation || undefined,
        }))
    : [];
  const pm = Number(d.pass_mark);
  return { questions, pass_mark: pm >= 1 && pm <= 100 ? Math.round(pm) : DEFAULT_PASS_MARK };
}

/** A question is usable once it has a prompt and at least two non-empty options with a valid answer. */
export function isQuestionComplete(q: QuizQuestion): boolean {
  const filled = q.options.filter((o) => o.trim());
  return !!q.prompt.trim() && filled.length >= MIN_QUIZ_OPTIONS && !!q.options[q.correct]?.trim();
}

/** Drop blank options (re-pointing the answer) and any question that isn't complete. */
export function cleanQuiz(quiz: QuizData): QuizData {
  const questions: QuizQuestion[] = [];
  for (const q of quiz.questions) {
    const keep: number[] = [];
    q.options.forEach((o, i) => o.trim() && keep.push(i));
    const cleaned: QuizQuestion = {
      ...q,
      prompt: q.prompt.trim(),
      options: keep.map((i) => q.options[i].trim()),
      correct: Math.max(0, keep.indexOf(q.correct)),
      explanation: q.explanation?.trim() || undefined,
    };
    if (keep.includes(q.correct) && isQuestionComplete(cleaned)) questions.push(cleaned);
  }
  return { questions, pass_mark: quiz.pass_mark };
}

export function gradeQuiz(quiz: QuizData, answers: Record<string, number | undefined>) {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q) => answers[q.id] === q.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, pct, passed: total > 0 && pct >= quiz.pass_mark };
}

// ── Video ─────────────────────────────────────────────────────────────────────────────────────────────────
export function isPortraitVideo(width?: number | null, height?: number | null): boolean {
  return !!width && !!height && height > width;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Minutes a lesson takes, for "time left" estimates. */
export function lessonMinutes(l: {
  lesson_type?: string | null;
  media_url?: string | null;
  video_path?: string | null;
  video_duration?: number | null;
  content?: string | null;
  data?: unknown;
}): number {
  const type = lessonTypeOf(l);
  if (type === "video") return l.video_duration ? Math.max(1, Math.round(l.video_duration / 60)) : 5;
  if (type === "quiz") return Math.max(2, Math.round(parseQuiz(l.data).questions.length * 0.75));
  if (type === "assignment") return 10;
  const words = (l.content ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

// ── Course details ────────────────────────────────────────────────────────────────────────────────────────
export const COURSE_LEVELS: { value: "beginner" | "intermediate" | "advanced" | "all"; label: string }[] = [
  { value: "all", label: "All levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
export const MIN_OBJECTIVES = 3;
export const MAX_OBJECTIVES = 8;
