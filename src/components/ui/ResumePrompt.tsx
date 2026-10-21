// src/components/ui/ResumePrompt.tsx
// Shown when someone reopens a book or course they had started: pick up where they stopped, or begin again.
// Dismissing it (scrim tap, Android Back) means *Continue* — closing a dialog must never throw progress away.
import { BookOpen } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Modal } from "./Modal";
import { Icon } from "./styled";
import { Text } from "./Text";

interface ResumePromptProps {
  /** What they're returning to, e.g. “Chapter 3 · The long road”. */
  where: string;
  /** How far in, 0–100 (omitted when unknown). */
  percent?: number | null;
  onContinue: () => void;
  onStartOver: () => void;
  /** “book” | “course” — only changes the wording. */
  kind?: "book" | "course";
}

export function ResumePrompt({ where, percent, onContinue, onStartOver, kind = "book" }: ResumePromptProps) {
  const title = kind === "course" ? "Continue where you stopped?" : "Continue reading?";
  return (
    <Modal onClose={onContinue} title={title}>
      <View className="flex-row items-start gap-4">
        <View className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-overlay-surface-raised">
          <Icon as={BookOpen} size={19} className="text-overlay-accent" />
        </View>
        <View className="min-w-0 flex-1 pt-0.5">
          <Text className="text-sm leading-relaxed text-overlay-ink-muted">
            You were at {where}
            {percent != null ? ` (${Math.round(percent)}% through)` : ""}.
          </Text>
        </View>
      </View>

      <View className="mt-7 gap-3">
        <Pressable onPress={onContinue} accessibilityRole="button" className="items-center rounded-full bg-overlay-accent py-3 active:opacity-80">
          <Text className="text-sm font-medium text-overlay-surface">Continue</Text>
        </Pressable>
        <Pressable onPress={onStartOver} accessibilityRole="button" className="items-center rounded-full bg-overlay-surface-raised py-3 active:opacity-80">
          <Text className="text-sm font-medium text-overlay-ink">Start from the beginning</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
