// src/components/course/LessonReader.tsx
// Focused reading view for one lesson: breadcrumb, title, media, formatted content, and a sticky
// bar with Back / "Complete & continue" so the next step is always one tap away.
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, Circle, Clock, Eye, Lock } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LessonMedia } from "@/components/project/LessonMedia";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { CourseLesson } from "@/hooks/useCourseBuilder";
import { parseLesson, readMinutes } from "@/lib/lessonFormat";

import { LessonRenderer } from "./LessonRenderer";
import { ProgressBar } from "./ProgressBar";

interface LessonReaderProps {
  lesson: CourseLesson;
  /** null for the locked Foreword module, which isn't numbered like the course's own modules. */
  moduleNumber: number | null;
  moduleTitle: string;
  lessonNumber: string;
  position: number;
  total: number;
  pct: number;
  hasAccess: boolean;
  completed: boolean;
  pending: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  nextLocked: boolean;
  onOutline: () => void;
  onPrev: () => void;
  onPrimary: () => void;
  onToggleComplete: () => void;
  onWatched: () => void;
  /** Where the learner stopped in THIS lesson, to jump back to (null/undefined = open at the top). */
  resumeAt?: { scrollFraction: number | null; mediaSeconds: number | null } | null;
  /** Called (debounced, and on leaving) with the current position. Omit when progress isn't being tracked. */
  onPosition?: (p: { lessonId: string; scrollFraction: number; mediaSeconds: number | null }) => void;
}

const POSITION_DEBOUNCE_MS = 1200;

export function LessonReader(props: LessonReaderProps) {
  const { lesson, hasAccess, completed, hasNext, nextLocked } = props;
  const insets = useSafeAreaInsets();
  const emoji = useMemo(() => parseLesson(lesson.content).emoji, [lesson.content]);
  const minutes = lesson.media_url ? null : readMinutes(lesson.content);
  const isLast = !hasNext;

  // ── Position tracking: how far down the lesson (and, for hosted video, how far into it) the learner is. ──
  const { onPosition } = props;
  const scrollRef = useRef<ScrollView>(null);
  const viewportH = useRef(0);
  const contentH = useRef(0);
  const pendingFraction = useRef<number | null>(null);
  const fractionRef = useRef(0);
  const mediaRef = useRef<number | null>(null);
  const unsaved = useRef<{ lessonId: string; scrollFraction: number; mediaSeconds: number | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pending = unsaved.current;
    unsaved.current = null;
    if (pending) onPosition?.(pending);
  }, [onPosition]);
  const queue = useCallback(() => {
    if (!onPosition) return;
    unsaved.current = { lessonId: lesson.id, scrollFraction: fractionRef.current, mediaSeconds: mediaRef.current };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, POSITION_DEBOUNCE_MS);
  }, [onPosition, lesson.id, flush]);

  // A new lesson: send the old lesson's last position first, then start tracking the new one from its resume point.
  const resumeFraction = props.resumeAt?.scrollFraction ?? null;
  const resumeSeconds = props.resumeAt?.mediaSeconds ?? null;
  useEffect(() => {
    pendingFraction.current = resumeFraction != null && resumeFraction > 0.01 ? resumeFraction : null;
    fractionRef.current = resumeFraction ?? 0;
    mediaRef.current = resumeSeconds;
    viewportH.current = 0;
    contentH.current = 0;
    return flush;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return () => sub.remove();
  }, [flush]);

  const applyPendingScroll = useCallback(() => {
    const fraction = pendingFraction.current;
    if (fraction == null || viewportH.current === 0 || contentH.current === 0) return;
    const range = contentH.current - viewportH.current;
    pendingFraction.current = null;
    if (range > 0) scrollRef.current?.scrollTo({ y: fraction * range, animated: false });
  }, []);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    // Until the saved position has been applied the scroller sits at the top: that isn't progress.
    if (pendingFraction.current != null) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const range = contentSize.height - layoutMeasurement.height;
    fractionRef.current = range > 0 ? Math.min(1, Math.max(0, contentOffset.y / range)) : 0;
    queue();
  }
  const handleMediaTime = useCallback(
    (seconds: number) => {
      mediaRef.current = seconds;
      queue();
    },
    [queue]
  );

  const primary = !hasAccess
    ? hasNext && !nextLocked
      ? "Next lesson"
      : "Unlock the full course"
    : isLast
      ? completed
        ? "Back to the course"
        : "Finish the course"
      : completed
        ? "Next lesson"
        : "Complete & continue";

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-border bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
        <View className="mb-2.5 flex-row items-center justify-between">
          <Pressable onPress={props.onOutline} accessibilityRole="button" accessibilityLabel="Back to the lesson list" hitSlop={10} className="flex-row items-center gap-1">
            <Icon as={ArrowLeft} size={20} className="text-ink" />
            <Text className="text-[13px] font-medium text-ink-muted">All lessons</Text>
          </Pressable>
          <Text className="text-[12px] font-medium text-ink-muted">
            {props.position} of {props.total} · {props.pct}%
          </Text>
        </View>
        <ProgressBar pct={props.pct} height={5} />
      </View>

      {/* key remounts the scroller per lesson: every lesson opens at the top, with a soft fade. */}
      <Animated.View key={lesson.id} entering={FadeIn.duration(220)} className="flex-1">
        <ScrollView showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          onLayout={(e) => {
            viewportH.current = e.nativeEvent.layout.height;
            applyPendingScroll();
          }}
          onContentSizeChange={(_w, h) => {
            contentH.current = h;
            applyPendingScroll();
          }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 110 }}
        >
          <Text className="mb-2 text-[11px] font-bold uppercase text-accent" style={{ letterSpacing: 1 }}>
            {props.moduleNumber === null ? "Foreword" : `Module ${props.moduleNumber} · Lesson ${props.lessonNumber}`}
          </Text>
          <View className="mb-3 flex-row items-start gap-3">
            {emoji ? (
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </View>
            ) : null}
            <Text selectable className="min-w-0 flex-1 font-display text-[24px] font-bold text-ink" style={{ lineHeight: 30 }}>
              {lesson.title}
            </Text>
          </View>
          <View className="mb-5 flex-row flex-wrap items-center gap-x-4 gap-y-1">
            {minutes !== null ? (
              <View className="flex-row items-center gap-1.5">
                <Icon as={Clock} size={13} className="text-ink-muted" />
                <Text className="text-[12.5px] text-ink-muted">{minutes} min read</Text>
              </View>
            ) : null}
            {!hasAccess && lesson.is_free_preview ? (
              <View className="flex-row items-center gap-1.5">
                <Icon as={Eye} size={13} className="text-accent" />
                <Text className="text-[12.5px] font-medium text-accent">Free preview</Text>
              </View>
            ) : null}
            {completed ? (
              <View className="flex-row items-center gap-1.5">
                <Icon as={CheckCircle2} size={13} className="text-accent" />
                <Text className="text-[12.5px] font-medium text-accent">Completed</Text>
              </View>
            ) : null}
          </View>

          {lesson.media_url ? <LessonMedia url={lesson.media_url} onWatched={props.onWatched} startAt={resumeSeconds} onTime={onPosition ? handleMediaTime : undefined} /> : null}
          {lesson.content ? (
            <LessonRenderer content={lesson.content} />
          ) : !lesson.media_url ? (
            <Text className="text-ink-muted">No content yet.</Text>
          ) : null}

          {hasAccess ? (
            <Pressable
              onPress={props.onToggleComplete}
              disabled={props.pending}
              accessibilityRole="button"
              className={`mt-6 flex-row items-center gap-2 self-start ${props.pending ? "opacity-50" : ""}`}
            >
              <Icon as={completed ? CheckCircle2 : Circle} size={16} className={completed ? "text-accent" : "text-ink-muted"} />
              <Text className={`text-[13px] font-medium ${completed ? "text-accent" : "text-ink-muted"}`}>
                {completed ? "Completed. Tap to mark as not done" : "Mark as complete"}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View
        className="absolute inset-x-0 bottom-0 flex-row items-center gap-3 border-t border-border bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          onPress={props.onPrev}
          disabled={!props.hasPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous lesson"
          className={`h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface ${props.hasPrev ? "" : "opacity-30"}`}
        >
          <Icon as={ChevronLeft} size={22} className="text-ink" />
        </Pressable>
        <Pressable
          onPress={props.onPrimary}
          disabled={props.pending}
          accessibilityRole="button"
          className={`h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-accent active:bg-accent-hover ${props.pending ? "opacity-60" : ""}`}
        >
          {!hasAccess && !(hasNext && !nextLocked) ? <Icon as={Lock} size={16} className="text-canvas" /> : null}
          <Text className="text-[15px] font-semibold text-canvas">{primary}</Text>
          {hasAccess && !isLast ? <Icon as={ArrowRight} size={18} className="text-canvas" /> : null}
        </Pressable>
      </View>
    </View>
  );
}
