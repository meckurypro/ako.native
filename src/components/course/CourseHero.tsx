// src/components/course/CourseHero.tsx
// The warm welcome at the top of a course: where you are, how far you've come, and one clear next step.
import { ArrowRight, PartyPopper, Sparkles } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";

import { ProgressBar } from "./ProgressBar";

interface CourseHeroProps {
  pct: number;
  done: number;
  total: number;
  minutesLeft: number;
  /** Title of the lesson "Continue" will open (null once everything is done). */
  nextTitle: string | null;
  onContinue: () => void;
}

function timeLeft(minutes: number): string {
  if (minutes < 60) return `about ${Math.max(1, minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}

export function CourseHero({ pct, done, total, minutesLeft, nextTitle, onContinue }: CourseHeroProps) {
  const finished = total > 0 && done === total;
  const started = done > 0;

  const eyebrow = finished ? "Course complete" : started ? "Welcome back" : "Welcome";
  const headline = finished ? "You finished every lesson. Well done." : started ? `You're ${pct}% of the way there.` : "Ready when you are.";
  const sub = finished
    ? "Everything stays open. Revisit any lesson, any time."
    : `${done} of ${total} lessons done · ${timeLeft(minutesLeft)} to go`;
  const cta = finished ? "Review from the start" : started ? "Continue" : "Start the course";

  return (
    <View className="mb-5 rounded-3xl border border-border bg-accent-soft p-5">
      <View className="mb-1.5 flex-row items-center gap-1.5">
        <Icon as={finished ? PartyPopper : Sparkles} size={14} className="text-accent" />
        <Text className="text-[11px] font-bold uppercase text-accent" style={{ letterSpacing: 1 }}>
          {eyebrow}
        </Text>
      </View>
      <Text className="font-display text-[22px] font-bold text-ink" style={{ lineHeight: 28 }}>
        {headline}
      </Text>
      <Text className="mb-4 mt-1 text-[13px] text-ink-muted">{sub}</Text>
      <ProgressBar pct={pct} height={10} />
      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        className="mt-4 flex-row items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3.5 active:bg-accent-hover"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-canvas">{cta}</Text>
          {nextTitle && !finished ? (
            <Text numberOfLines={1} className="mt-0.5 text-[12.5px] text-canvas" style={{ opacity: 0.85 }}>
              {nextTitle}
            </Text>
          ) : null}
        </View>
        <Icon as={ArrowRight} size={20} className="text-canvas" />
      </Pressable>
    </View>
  );
}
