// src/components/course/LessonEditor.tsx
// Create or edit one lesson: pick a type (video, reading, quiz, assignment), fill in its fields, choose its section and
// whether it's a free preview. Mirrors the web editor, including the rules for what makes a lesson "complete".
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  FileText,
  ListChecks,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { EditorToolbar } from "@/components/ui/EditorToolbar";
import { SelectField } from "@/components/ui/SelectField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import {
  LESSON_TYPES,
  MAX_QUIZ_OPTIONS,
  MIN_QUIZ_OPTIONS,
  cleanQuiz,
  emptyQuestion,
  isQuestionComplete,
  lessonTypeLabel,
  videoLinkProblem,
  type LessonType,
  type QuizData,
} from "@/lib/courseTypes";
import { removeCourseVideos } from "@/lib/courseVideo";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { EMPTY_VIDEO, LessonVideoField, type VideoValue } from "./LessonVideoField";

export interface LessonFormValue {
  lessonType: LessonType;
  title: string;
  content: string;
  quiz: QuizData;
  isFreePreview: boolean;
  /** Section the lesson belongs to. Changing it moves the lesson to the end of that section. */
  moduleId: string;
}

export interface LessonSubmit extends LessonFormValue {
  video: VideoValue;
}

const TYPE_ICON: Record<LessonType, typeof Video> = { video: Video, text: FileText, quiz: ListChecks, assignment: ClipboardList };
export const PASS_MARKS = [50, 60, 70, 80, 90, 100];

const inputClass = "w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink";
const inputStyle = { fontFamily: "Inter_400Regular" } as const;

function QuizEditor({ quiz, onChange }: { quiz: QuizData; onChange: (q: QuizData) => void }) {
  const { colors } = useTheme();
  const setQuestion = (i: number, patch: Partial<QuizData["questions"][number]>) =>
    onChange({ ...quiz, questions: quiz.questions.map((q, qi) => (qi === i ? { ...q, ...patch } : q)) });

  return (
    <View className="gap-3">
      {quiz.questions.map((q, qi) => (
        <View key={q.id} className="rounded-xl border border-border bg-canvas p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-muted">Question {qi + 1}</Text>
            <Pressable
              onPress={() => onChange({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qi) })}
              accessibilityRole="button"
              accessibilityLabel="Delete question"
              hitSlop={8}
            >
              <Icon as={Trash2} size={14} className="text-danger" />
            </Pressable>
          </View>
          <TextInput
            value={q.prompt}
            onChangeText={(prompt) => setQuestion(qi, { prompt })}
            placeholder="Question"
            placeholderTextColor={colors.inkMuted}
            className={inputClass}
            style={inputStyle}
            accessibilityLabel={`Question ${qi + 1}`}
          />
          <View className="mt-2 gap-1.5">
            {q.options.map((o, oi) => (
              <View key={oi} className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => setQuestion(qi, { correct: oi })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: q.correct === oi }}
                  accessibilityLabel={`Mark option ${oi + 1} as the answer`}
                  hitSlop={8}
                  className={`h-5 w-5 items-center justify-center rounded-full border-2 ${q.correct === oi ? "border-accent" : "border-border"}`}
                >
                  {q.correct === oi ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                </Pressable>
                <TextInput
                  value={o}
                  onChangeText={(text) => setQuestion(qi, { options: q.options.map((x, i) => (i === oi ? text : x)) })}
                  placeholder={`Option ${oi + 1}`}
                  placeholderTextColor={colors.inkMuted}
                  className={`min-w-0 flex-1 ${inputClass}`}
                  style={inputStyle}
                  accessibilityLabel={`Option ${oi + 1}`}
                />
                {q.options.length > MIN_QUIZ_OPTIONS && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove option"
                    hitSlop={8}
                    onPress={() =>
                      setQuestion(qi, {
                        options: q.options.filter((_, i) => i !== oi),
                        correct: q.correct === oi ? 0 : q.correct > oi ? q.correct - 1 : q.correct,
                      })
                    }
                  >
                    <Icon as={X} size={14} className="text-ink-muted" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
          {q.options.length < MAX_QUIZ_OPTIONS && (
            <Pressable onPress={() => setQuestion(qi, { options: [...q.options, ""] })} accessibilityRole="button" className="mt-1.5 flex-row items-center gap-1 self-start">
              <Icon as={Plus} size={12} className="text-accent" />
              <Text className="text-xs font-medium text-accent">Add option</Text>
            </Pressable>
          )}
          <TextInput
            value={q.explanation ?? ""}
            onChangeText={(explanation) => setQuestion(qi, { explanation })}
            placeholder="Why it's right (optional)"
            placeholderTextColor={colors.inkMuted}
            className={`mt-2 ${inputClass}`}
            style={inputStyle}
            accessibilityLabel="Explanation"
          />
          {q.prompt.trim() && !isQuestionComplete(q) ? <Text className="mt-1.5 text-xs text-danger">Needs two options and a marked answer.</Text> : null}
        </View>
      ))}
      <Pressable
        onPress={() => onChange({ ...quiz, questions: [...quiz.questions, emptyQuestion()] })}
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5"
      >
        <Icon as={Plus} size={14} className="text-accent" />
        <Text className="text-sm font-medium text-accent">Add question</Text>
      </Pressable>
      <SelectField
        label="Pass mark"
        value={String(quiz.pass_mark)}
        options={PASS_MARKS.map((p) => ({ value: String(p), label: `${p}%` }))}
        onChange={(v) => onChange({ ...quiz, pass_mark: Number(v) })}
      />
    </View>
  );
}

export function LessonEditor({
  projectId,
  initial,
  initialVideo,
  isNew,
  sections,
  suggestFreePreview = false,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  projectId: string;
  initial: LessonFormValue;
  initialVideo: VideoValue;
  isNew: boolean;
  /** Sections the lesson can live in (the locked Foreword section is left out). */
  sections: { id: string; title: string }[];
  /** True while the course has no free preview yet: a new video lesson then starts as one. */
  suggestFreePreview?: boolean;
  submitLabel: string;
  pending: boolean;
  onSubmit: (value: LessonSubmit) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [typeChosen, setTypeChosen] = useState(!isNew);
  const history = useUndoRedo(initial);
  const value = history.value;
  const setValue = history.set;
  const [video, setVideo] = useState<VideoValue>(initialVideo);
  const [uploading, setUploading] = useState(false);
  const savedPath = initialVideo.videoPath;

  const type = value.lessonType;
  const completeQuestions = value.quiz.questions.filter(isQuestionComplete).length;
  const linkProblem = type === "video" && !video.videoPath ? videoLinkProblem(video.mediaUrl) : null;
  const missing: string | null = !value.title.trim()
    ? "Add a title."
    : uploading
      ? "Wait for the upload to finish."
      : type === "video" && !video.videoPath && !video.mediaUrl.trim()
        ? "Add a video."
        : linkProblem
          ? linkProblem
          : type === "text" && !value.content.trim()
            ? "Write the lesson."
            : type === "assignment" && !value.content.trim()
              ? "Describe the task."
              : type === "quiz" && completeQuestions === 0
                ? "Add a question."
                : null;

  const submit = () => {
    if (missing || pending) return;
    const quiz = type === "quiz" ? cleanQuiz(value.quiz) : value.quiz;
    // A video uploaded in this form that the lesson won't keep (the type was switched away from video before saving)
    // would otherwise sit in storage with nothing pointing at it.
    if (type !== "video" && video.videoPath && video.videoPath !== savedPath) void removeCourseVideos([video.videoPath]);
    onSubmit({ ...value, quiz, video });
    history.markSaved();
  };

  const cancel = () => {
    // A video uploaded in this form and never saved is thrown away with it.
    if (video.videoPath && video.videoPath !== savedPath) void removeCourseVideos([video.videoPath]);
    onCancel();
  };

  if (!typeChosen) {
    return (
      <View className="mt-2 rounded-xl border border-border bg-canvas p-3">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-sm font-medium text-ink">What kind of lesson?</Text>
          <Pressable onPress={cancel} accessibilityRole="button" hitSlop={8}>
            <Text className="text-xs text-ink-muted">Cancel</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {LESSON_TYPES.map(({ type: t, label, hint }) => (
            <Pressable
              key={t}
              onPress={() => {
                haptics.light();
                setValue({ ...value, lessonType: t, isFreePreview: t === "video" && suggestFreePreview }, { step: true });
                setTypeChosen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${hint}`}
              className="min-w-[45%] flex-1 items-start gap-1 rounded-xl border border-border bg-surface p-3 active:opacity-70"
            >
              <Icon as={TYPE_ICON[t]} size={18} className="text-accent" />
              <Text className="text-sm font-semibold text-ink">{label}</Text>
              <Text className="text-xs text-ink-muted">{hint}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="mt-2 gap-2">
      <View className="flex-row items-center gap-1.5">
        {isNew && (
          <Pressable onPress={() => setTypeChosen(false)} accessibilityRole="button" accessibilityLabel="Change lesson type" hitSlop={8}>
            <Icon as={ArrowLeft} size={14} className="text-ink-muted" />
          </Pressable>
        )}
        <Icon as={TYPE_ICON[type]} size={13} className="text-accent" />
        <Text className="text-xs font-medium text-accent">{lessonTypeLabel(type)}</Text>
      </View>

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

      {type === "video" && <LessonVideoField projectId={projectId} value={video} savedPath={savedPath} onChange={setVideo} onBusyChange={setUploading} />}

      {type === "quiz" && <QuizEditor quiz={value.quiz} onChange={(quiz) => setValue({ ...value, quiz })} />}

      <TextInput
        placeholder={
          type === "assignment"
            ? "What should learners do?"
            : type === "text"
              ? "Lesson text\nTip: # heading, - list, 1. steps, > note, ``` code ```, **bold**, `code`"
              : type === "quiz"
                ? "Intro (optional)"
                : "Notes (optional)"
        }
        placeholderTextColor={colors.inkMuted}
        value={value.content}
        onChangeText={(content) => setValue({ ...value, content })}
        multiline
        textAlignVertical="top"
        className={inputClass}
        style={[inputStyle, { minHeight: type === "text" || type === "assignment" ? 140 : 70 }]}
        accessibilityLabel={type === "assignment" ? "Assignment instructions" : "Lesson text"}
      />

      {sections.length > 1 && (
        <SelectField
          label="Section"
          value={value.moduleId}
          options={sections.map((s) => ({ value: s.id, label: s.title }))}
          onChange={(moduleId) => setValue({ ...value, moduleId }, { step: true })}
        />
      )}

      <Pressable
        onPress={() => setValue({ ...value, isFreePreview: !value.isFreePreview })}
        accessibilityRole="switch"
        accessibilityState={{ checked: value.isFreePreview }}
        className={`flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 ${value.isFreePreview ? "border-accent bg-accent" : "border-border bg-surface"}`}
      >
        <Icon as={Eye} size={12} className={value.isFreePreview ? "text-canvas" : "text-ink-muted"} />
        <Text className={`text-xs font-medium ${value.isFreePreview ? "text-canvas" : "text-ink-muted"}`}>Free preview</Text>
      </Pressable>

      {missing && value.title.trim() !== "" ? <Text className="text-xs text-ink-muted">{missing}</Text> : null}

      <View className="mt-0.5">
        <EditorToolbar
          onUndo={history.undo}
          onRedo={history.redo}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onSave={submit}
          saving={pending}
          dirty={history.isDirty || isNew || video.videoPath !== savedPath || video.mediaUrl !== initialVideo.mediaUrl}
          canSave={!missing}
          saveLabel={submitLabel}
          onCancel={cancel}
        />
      </View>
    </View>
  );
}

export { EMPTY_VIDEO };
