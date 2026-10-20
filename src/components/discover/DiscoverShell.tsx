// src/components/discover/DiscoverShell.tsx
// The Discover screen's search experience, modelled on TikTok's:
//
//   browse   – the page itself, with a search bar at the top.
//   typing   – tap the bar: a search header with the keyboard up, showing recent
//              searches + trending; as you type, live suggestions.
//   results  – submit (keyboard search key, "Search", or any suggestion): results
//              under tabs. Back (header arrow / Android Back) steps results → browse.
//
// One shell serves both account kinds. `scope` is the only difference: "all" (full
// accounts) searches people, pages, posts and projects and offers hashtags;
// "discover" (restricted, consumer-only accounts) searches pages and projects
// only — never people or posts.
//
// Why browse shows a bar *button* rather than the real input: moving a TextInput
// between a scrolling page and a fixed header remounts it and drops focus, so the
// real input lives only in the search header (auto-focused when it opens). That is
// also how TikTok and Instagram do it.
import { router, useFocusEffect } from "expo-router";
import { ArrowLeft, Search } from "lucide-react-native";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AutoHideTopBar, useTopBarInset } from "@/components/nav/AutoHideTopBar";
import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { TopHeader } from "@/components/nav/TopHeader";
import { isSearchable, SearchResults, type SearchScope } from "@/components/post/SearchResults";
import { SearchField } from "@/components/post/SearchField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { haptics } from "@/lib/haptics";
import { SearchStart } from "./SearchStart";
import { SearchSuggestions } from "./SearchSuggestions";

type Phase = "browse" | "typing" | "results";

export function DiscoverShell({
  scope,
  placeholder,
  accessibilityLabel,
  browse,
  refreshers,
}: {
  scope: SearchScope;
  placeholder: string;
  accessibilityLabel: string;
  /** The page shown when not searching. */
  browse: ReactNode;
  /** Pull-to-refresh on the browse page. */
  refreshers: Array<() => unknown>;
}) {
  const [typing, setTyping] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const [draft, setDraft] = useState("");
  const inputRef = useRef<TextInput>(null);

  const insets = useSafeAreaInsets();
  const topInset = useTopBarInset();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { refreshControl, refreshing } = usePullToRefresh(refreshers, topInset + 16);

  const recents = useRecentSearches();
  const debouncedDraft = useDebouncedValue(draft.trim(), 200);

  const phase: Phase = typing ? "typing" : submitted ? "results" : "browse";
  const canSubmit = isSearchable(draft);

  function submit(term: string) {
    const t = term.trim();
    if (!isSearchable(t)) return;
    haptics.selection();
    recents.add(t);
    setDraft(t);
    setSubmitted(t);
    setTyping(false);
    Keyboard.dismiss();
    // A new search starts on the "All" tab.
    router.setParams({ tab: undefined });
  }

  function leave() {
    Keyboard.dismiss();
    if (phase === "typing") {
      // Abandon the edit: back to results if there are some, else browse.
      setDraft(submitted);
      setTyping(false);
      return;
    }
    // From results → browse.
    setSubmitted("");
    setDraft("");
    router.setParams({ tab: undefined });
  }

  // Android Back steps out of search. Only while this screen is focused —
  // Discover stays mounted under a profile you open from a result, and its Back
  // handler must not fire there.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  useBackDismiss(leave, phase !== "browse" && focused);

  if (phase === "browse") {
    return (
      <View className="flex-1 bg-canvas">
        <ScrollView
          refreshControl={refreshControl}
          ref={onScroll.listRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: topInset + 16, paddingHorizontal: 16, paddingBottom: bottomInset, opacity: refreshing ? 0 : 1 }}
        >
          <Pressable
            onPress={() => {
              haptics.light();
              setTyping(true);
            }}
            accessibilityRole="search"
            accessibilityLabel={accessibilityLabel}
            className="mb-6 h-11 flex-row items-center gap-2.5 rounded-full border border-border bg-surface px-4 active:opacity-80"
          >
            <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
            <Text className="text-sm text-ink-muted">{placeholder}</Text>
          </Pressable>

          <Animated.View entering={FadeIn.duration(220)}>{browse}</Animated.View>
        </ScrollView>

        <AutoHideTopBar>
          <TopHeader />
        </AutoHideTopBar>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="z-30 bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
        <View className="w-full max-w-xl flex-row items-center gap-3 self-center">
          <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <SearchField
            ref={inputRef}
            variant="bar"
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            accessibilityLabel={accessibilityLabel}
            autoFocus
            onFocus={() => setTyping(true)}
            onSubmit={() => submit(draft)}
          />
          {typing && canSubmit ? (
            <Pressable onPress={() => submit(draft)} accessibilityRole="button" hitSlop={8}>
              <Text className="text-sm font-medium text-accent">Search</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={onScroll.listRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomInset }}
      >
        {phase === "typing" ? (
          canSubmit ? (
            <SearchSuggestions
              query={debouncedDraft}
              typed={draft}
              scope={scope}
              onSubmit={submit}
              onFill={(term) => {
                setDraft(term);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <SearchStart
              scope={scope}
              recents={recents.items}
              onPick={submit}
              onRemoveRecent={recents.remove}
              onClearRecents={recents.clear}
            />
          )
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <SearchResults query={submitted} scope={scope} />
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
