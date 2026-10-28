// src/components/course/QuizPlayer.tsx
// Learner's side of a quiz lesson: answer, submit, see what was right. Passing marks the lesson complete.
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { gradeQuiz, parseQuiz } from "@/lib/courseTypes";

export function QuizPlayer({ data, completed, onPassed }: { data: unknown; completed: boolean; onPassed: () => void }) {
  const quiz = useMemo(() => parseQuiz(data), [data]);
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [submitted, setSubmitted] = useState(false);

  if (quiz.questions.length === 0) return <Text className="text-sm text-ink-muted">This quiz has no questions yet.</Text>;

  const result = gradeQuiz(quiz, answers);
  const allAnswered = quiz.questions.every((q) => answers[q.id] !== undefined);
  const reset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <View className="mt-2 gap-4">
      {completed && !submitted ? (
        <View className="flex-row items-center gap-1.5">
          <Icon as={CheckCircle2} size={15} className="text-accent" />
          <Text className="text-sm font-medium text-accent">You passed this quiz. Retake it any time.</Text>
        </View>
      ) : null}

      {quiz.questions.map((q, qi) => (
        <View key={q.id} className="rounded-2xl border border-border bg-surface p-4">
          <Text className="mb-3 text-[15px] font-semibold leading-snug text-ink">
            {qi + 1}. {q.prompt}
          </Text>
          <View className="gap-2">
            {q.options.map((o, oi) => {
              const picked = answers[q.id] === oi;
              const right = submitted && oi === q.correct;
              const wrong = submitted && picked && oi !== q.correct;
              return (
                <Pressable
                  key={oi}
                  disabled={submitted}
                  onPress={() => setAnswers({ ...answers, [q.id]: oi })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked }}
                  className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                    right ? "border-accent bg-accent-soft" : wrong ? "border-danger" : picked ? "border-accent bg-accent-soft/60" : "border-border bg-canvas"
                  }`}
                >
                  <View className={`h-[18px] w-[18px] items-center justify-center rounded-full border ${picked || right ? "border-accent" : "border-border"}`}>
                    {picked || right ? <View className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </View>
                  <Text className="min-w-0 flex-1 text-sm text-ink">{o}</Text>
                  {right ? <Icon as={CheckCircle2} size={16} className="text-accent" /> : null}
                  {wrong ? <Icon as={XCircle} size={16} className="text-danger" /> : null}
                </Pressable>
              );
            })}
          </View>
          {submitted && q.explanation && answers[q.id] !== q.correct ? <Text className="mt-2.5 text-[13px] text-ink-muted">{q.explanation}</Text> : null}
        </View>
      ))}

      {submitted ? (
        <View className={`rounded-2xl p-4 ${result.passed ? "bg-accent-soft" : "border border-border bg-surface"}`}>
          <Text className="font-display text-lg font-bold text-ink">
            {result.correct} of {result.total} right · {result.pct}%
          </Text>
          <Text className="mt-0.5 text-sm text-ink-muted">{result.passed ? "Passed." : `You need ${quiz.pass_mark}% to pass.`}</Text>
          {!result.passed || completed ? (
            <Pressable onPress={reset} accessibilityRole="button" className="mt-3 flex-row items-center gap-1.5 self-start rounded-xl bg-cta px-4 py-2">
              <Icon as={RotateCcw} size={14} className="text-white" />
              <Text className="text-sm font-semibold text-white">{result.passed ? "Retake" : "Try again"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setSubmitted(true);
            if (gradeQuiz(quiz, answers).passed && !completed) onPassed();
          }}
          disabled={!allAnswered}
          accessibilityRole="button"
          className={`h-12 items-center justify-center rounded-2xl bg-cta ${allAnswered ? "" : "opacity-40"}`}
        >
          <Text className="text-[15px] font-semibold text-white">Submit answers</Text>
        </Pressable>
      )}
    </View>
  );
}
