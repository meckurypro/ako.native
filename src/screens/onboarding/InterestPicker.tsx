// src/screens/onboarding/InterestPicker.tsx
// Pick at least 3 topics. A token field: chosen topics are chips inside the
// input, typing filters the full topic list, tapping a suggestion adds it.
// The suggestion list sits in the page flow (not floating over it) so nothing
// fights the keyboard on a small screen.
import { Search, X } from "lucide-react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from "react-native";

import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { Wordmark } from "@/components/ui/Wordmark";
import { useCategories } from "@/hooks/useCategories";
import { useMyInterestIds, useSaveInterests } from "@/hooks/useOnboarding";
import { haptics } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const MIN_INTERESTS = 3;
const MAX_SUGGESTIONS = 8;

export function InterestPicker() {
  const { colors } = useTheme();
  const { data: categories, isLoading, error } = useCategories();
  const { data: existingInterestIds, isLoading: existingLoading } = useMyInterestIds();
  const saveInterests = useSaveInterests();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const prefilled = useRef(false);

  const flatInterests = useMemo(
    () => (categories ?? []).flatMap((category) => category.interests.map((interest) => ({ ...interest, categoryName: category.name }))),
    [categories]
  );

  const selectedInterests = useMemo(
    () => Array.from(selected).flatMap((id) => flatInterests.filter((i) => i.id === id)),
    [selected, flatInterests]
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return flatInterests.filter((i) => !selected.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [query, flatInterests, selected]);

  // Returning to this step (back button, resumed onboarding): keep earlier picks.
  useEffect(() => {
    if (prefilled.current || !existingInterestIds) return;
    if (existingInterestIds.length > 0) setSelected(new Set(existingInterestIds));
    prefilled.current = true;
  }, [existingInterestIds]);

  function toggleInterest(interestId: string) {
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(interestId)) next.delete(interestId);
      else next.add(interestId);
      return next;
    });
  }

  function selectSuggestion(interestId: string) {
    toggleInterest(interestId);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === "Backspace" && query === "" && selectedInterests.length > 0) {
      toggleInterest(selectedInterests[selectedInterests.length - 1].id);
    }
  }

  async function handleContinue() {
    if (selected.size < MIN_INTERESTS) return;
    setSaveError(null);
    try {
      await saveInterests.mutateAsync(Array.from(selected));
      router.push("/onboarding/people");
    } catch (err) {
      console.error("Failed to save interests:", err);
      setSaveError("Couldn't save your interests. Check your connection and try again.");
    }
  }

  if (isLoading || existingLoading) {
    return (
      <OnboardingScreen centered>
        <Text className="text-center text-ink-muted">Loading topics…</Text>
      </OnboardingScreen>
    );
  }

  if (error) {
    return (
      <OnboardingScreen centered>
        <Text className="text-center text-danger">Couldn't load topics. Check your connection and try again.</Text>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen
      maxWidth={672}
      footer={
        <View className="flex-row items-center justify-between gap-4">
          <Text className="flex-1 text-sm text-ink-muted">
            {selected.size} selected
            {selected.size < MIN_INTERESTS && ` (${MIN_INTERESTS} minimum)`}
          </Text>
          <View className="w-40">
            <Button onPress={handleContinue} disabled={selected.size < MIN_INTERESTS} loading={saveInterests.isPending}>
              Continue
            </Button>
          </View>
        </View>
      }
    >
      <View className="mb-8">
        <Wordmark />
      </View>

      <Text className="mb-2 font-display text-2xl text-ink">What do you reason about?</Text>
      <Text className="mb-8 text-ink-muted">
        Pick at least {MIN_INTERESTS} topics. We'll use them to help you find relevant people and shape your Akọ — you can
        change it anytime.
      </Text>

      {saveError ? (
        <Text accessibilityRole="alert" className="mb-4 text-sm text-danger">
          {saveError}
        </Text>
      ) : null}

      <Pressable
        onPress={() => inputRef.current?.focus()}
        className={`min-h-[52px] flex-row flex-wrap items-center gap-1.5 rounded-2xl border bg-surface px-3 py-2 ${
          isFocused ? "border-accent/60" : "border-border"
        }`}
      >
        <Icon as={Search} size={16} className="ml-1 shrink-0 text-ink-muted" />

        {selectedInterests.map((interest) => (
          <View key={interest.id} className="flex-row items-center gap-1 rounded-full bg-accent py-1 pl-2.5 pr-1.5">
            <Text className="text-xs font-medium text-canvas">{interest.name}</Text>
            <Pressable
              onPress={() => toggleInterest(interest.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${interest.name}`}
              hitSlop={8}
              className="rounded-full p-0.5 active:bg-canvas/20"
            >
              <Icon as={X} size={11} className="text-canvas" />
            </Pressable>
          </View>
        ))}

        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          onKeyPress={handleKeyPress}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={selectedInterests.length === 0 ? "Search topics — Music, Startups, Fitness…" : "Add more…"}
          placeholderTextColor={`${colors.inkMuted}99`}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          className="min-w-[120px] flex-1 py-1 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </Pressable>

      {isFocused && query.trim().length > 0 ? (
        <View className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface">
          {suggestions.length === 0 ? (
            <Text className="px-4 py-3 text-sm text-ink-muted">No topics match "{query.trim()}"</Text>
          ) : (
            suggestions.map((interest) => (
              <Pressable
                key={interest.id}
                onPress={() => selectSuggestion(interest.id)}
                accessibilityRole="button"
                className="flex-row items-center justify-between px-4 py-3 active:bg-canvas"
              >
                <Text className="text-sm text-ink">{interest.name}</Text>
                <Text className="text-xs text-ink-muted">{interest.categoryName}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </OnboardingScreen>
  );
}
