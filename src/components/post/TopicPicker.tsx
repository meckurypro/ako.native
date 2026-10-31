// src/components/post/TopicPicker.tsx
// Optional topics for a post (max 5), as a collapsible two-level accordion:
// Topics ▸ Category ▸ interests.
import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { Collapsible } from "@/components/ui/Collapsible";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useCategories } from "@/hooks/useCategories";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMyInterestIds } from "@/hooks/useOnboarding";
import { useTopicSuggestions } from "@/hooks/useTags";
import { haptics } from "@/lib/haptics";

export const MAX_TOPICS = 5;

function Chevron({ open }: { open: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 300 }) }] }));
  return (
    <Animated.View style={style}>
      <Icon as={ChevronDown} size={16} className="text-ink-muted" />
    </Animated.View>
  );
}

export function TopicPicker({
  selected,
  onToggle,
  text = "",
}: {
  selected: Set<string>;
  onToggle: (interestId: string) => void;
  /** What's being written (post text, project title + description…). Used to suggest matching topics. */
  text?: string;
}) {
  const { data: categories, isLoading } = useCategories();
  const { data: myInterestIds } = useMyInterestIds();
  const suggestions = useTopicSuggestions(useDebouncedValue(text, 700));
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  if (!isLoading && (!categories || categories.length === 0)) return null;

  const atLimit = selected.size >= MAX_TOPICS;

  // One-tap shortcuts: topics the text is about, and the writer's own interests.
  const suggested = (suggestions.data ?? []).filter((t) => !selected.has(t.id));
  const mine = (categories ?? [])
    .flatMap((c) => c.interests)
    .filter((i) => (myInterestIds ?? []).includes(i.id) && !selected.has(i.id) && !suggested.some((t) => t.id === i.id))
    .slice(0, 6);
  const quick = (label: string, items: Array<{ id: string; name: string }>) =>
    items.length > 0 ? (
      <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
        <Text className="text-xs text-ink-muted">{label}</Text>
        {items.map((t) => (
          <Pressable
            key={t.id}
            disabled={atLimit}
            onPress={() => {
              haptics.selection();
              onToggle(t.id);
            }}
            accessibilityRole="button"
            className={`rounded-full border border-dashed border-accent-a50 px-2.5 py-1 active:opacity-70 ${atLimit ? "opacity-40" : ""}`}
          >
            <Text className="text-xs text-ink">+ {t.name}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  return (
    <View className="mb-4">
      <Pressable
        onPress={() => setIsOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center justify-between py-1"
      >
        <Text className="text-sm font-medium text-ink-muted">
          Topics <Text className="font-normal text-ink-muted">(optional)</Text>
          {selected.size > 0 ? <Text className="font-normal text-ink-muted">{` (${selected.size})`}</Text> : null}
        </Text>
        <Chevron open={isOpen} />
      </Pressable>

      {!isOpen ? quick("Suggested:", suggested) : null}

      <Collapsible open={isOpen}>
        <View className="pt-2">
          {quick("Suggested:", suggested)}
          {quick("Yours:", mine)}
          {suggested.length > 0 || mine.length > 0 ? <View className="mb-3" /> : null}
          {isLoading ? (
            <Text className="text-sm text-ink-muted">Loading topics…</Text>
          ) : (
            <>
              <Text className="mb-3 text-xs text-ink-muted">
                {selected.size}/{MAX_TOPICS} selected
                {atLimit ? " — remove one to pick another" : ""}
              </Text>

              {categories!.map((category) => {
                const isCategoryOpen = openCategoryId === category.id;
                const selectedInCategory = category.interests.filter((i) => selected.has(i.id)).length;

                return (
                  <View key={category.id} className="border-b border-border">
                    <Pressable
                      onPress={() => setOpenCategoryId((curr) => (curr === category.id ? null : category.id))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isCategoryOpen }}
                      className="flex-row items-center justify-between py-3"
                    >
                      <Text className="text-sm font-medium text-ink">
                        {category.name}
                        {selectedInCategory > 0 ? <Text className="font-normal text-ink-muted">{` (${selectedInCategory})`}</Text> : null}
                      </Text>
                      <Chevron open={isCategoryOpen} />
                    </Pressable>

                    <Collapsible open={isCategoryOpen}>
                      <View className="flex-row flex-wrap gap-2 pb-3">
                        {category.interests.map((interest) => {
                          const isSelected = selected.has(interest.id);
                          const disabled = !isSelected && atLimit;
                          return (
                            <Pressable
                              key={interest.id}
                              disabled={disabled}
                              onPress={() => {
                                haptics.selection();
                                onToggle(interest.id);
                              }}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isSelected, disabled }}
                              className={`rounded-full border px-3 py-1.5 ${
                                isSelected ? "border-cta bg-cta" : disabled ? "border-border bg-surface" : "border-border bg-surface active:border-accent-a50"
                              }`}
                            >
                              <Text className={`text-xs font-medium ${isSelected ? "text-white" : disabled ? "text-ink-muted-a40" : "text-ink"}`}>
                                {interest.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Collapsible>
                  </View>
                );
              })}
            </>
          )}

          <Text className="mt-2 text-xs text-ink-muted">Helps people browsing find this, and powers recommendations for it.</Text>
        </View>
      </Collapsible>
    </View>
  );
}
