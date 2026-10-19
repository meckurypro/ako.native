// src/components/comments/StanceFilter.tsx
import { Pressable, ScrollView } from "react-native";

import { Text } from "@/components/ui/Text";
import type { StanceFilter as Filter } from "@/hooks/useComments";
import { formatCompactCount } from "@/lib/formatStats";
import type { Stance } from "@/types/database";
import { STANCE_ORDER, STANCE_TONE } from "./stance";

export type StanceCounts = Record<Stance, number>;

/**
 * "All · Support 4 · Disagree 1 · Pushback 2" — plain text tabs, the active one underlined in its own stance
 * colour. Only offered when at least two stances have replies; with one there's nothing to filter between.
 */
export function StanceFilterBar({
  counts,
  total,
  value,
  onChange,
}: {
  counts: StanceCounts;
  total: number;
  value: Filter;
  onChange: (next: Filter) => void;
}) {
  const present = STANCE_ORDER.filter((s) => counts[s] > 0);
  if (present.length < 2) return null;

  const tab = "-mb-px border-b-2 py-2.5";
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      className="flex-grow-0 border-b border-border"
      contentContainerClassName="items-center gap-5"
    >
      <Pressable
        onPress={() => onChange("all")}
        accessibilityRole="tab"
        accessibilityState={{ selected: value === "all" }}
        className={`${tab} ${value === "all" ? "border-ink" : "border-transparent"}`}
      >
        <Text className={`text-sm ${value === "all" ? "font-medium text-ink" : "text-ink-muted"}`}>
          All <Text className="text-xs text-ink-muted">{formatCompactCount(total)}</Text>
        </Text>
      </Pressable>
      {present.map((s) => {
        const tone = STANCE_TONE[s];
        const active = value === s;
        return (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`${tab} ${active ? tone.underline : "border-transparent"}`}
          >
            <Text className={`text-sm ${active ? `font-medium ${tone.text}` : "text-ink-muted"}`}>
              {tone.noun} <Text className={`text-xs ${active ? tone.text : "text-ink-muted"}`}>{formatCompactCount(counts[s])}</Text>
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
