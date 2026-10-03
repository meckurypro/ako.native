// src/components/post/SearchField.tsx
// The rounded search input shared by Discover and Search: magnifier on the left,
// clear button on the right when there's text.
import { Search, X } from "lucide-react-native";
import { forwardRef } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { useTheme } from "@/theme/ThemeProvider";

interface SearchFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /** "card": large rounded-2xl field on Discover. "pill": compact pill in the Search header. */
  variant?: "card" | "pill";
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, placeholder, autoFocus, variant = "card" },
  ref
) {
  const { colors } = useTheme();
  const pill = variant === "pill";

  return (
    <View
      className={`flex-row items-center bg-surface ${pill ? "flex-1 gap-2 rounded-full px-4 py-1" : "rounded-2xl border border-border px-4"}`}
    >
      <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        autoFocus={autoFocus}
        returnKeyType="search"
        enterKeyHint="search"
        inputMode="search"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        accessibilityLabel="Search people, pages, posts and projects"
        className={`min-w-0 flex-1 text-sm text-ink ${pill ? "py-2" : "ml-2.5 py-3"}`}
        style={{ fontFamily: "Inter_400Regular" }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} className="shrink-0">
          <Icon as={X} size={pill ? 14 : 16} className="text-ink-muted" />
        </Pressable>
      ) : null}
    </View>
  );
});
