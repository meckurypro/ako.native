// src/screens/Search.tsx
// Full-screen search: back arrow + autofocused field on top, results below.
import { ArrowLeft, Search as SearchIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { isSearchable, SearchResults } from "@/components/post/SearchResults";
import { SearchField } from "@/components/post/SearchField";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSmartBack } from "@/hooks/useSmartBack";

export function Search() {
  const smartBack = useSmartBack();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  return (
    <View className="flex-1 bg-canvas">
      <View className="z-30 bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
        <View className="w-full max-w-xl flex-row items-center gap-3 self-center">
          <Pressable onPress={smartBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <SearchField variant="pill" value={query} onChangeText={setQuery} placeholder="Search Akọ" autoFocus />
        </View>
      </View>

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
      >
        {isSearchable(query) ? (
          <SearchResults query={debouncedQuery} isPending={query !== debouncedQuery} />
        ) : (
          <View className="items-center px-6 py-14">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
              <Icon as={SearchIcon} size={22} className="text-accent" />
            </View>
            <Text className="text-center text-sm text-ink-muted">Search for people, pages, posts or projects.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
