// src/components/post/SearchField.tsx
// The rounded search input shared by Discover and Search: magnifier on the left,
// clear button on the right when there's text.
import { Search, X } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/styled";
import { useTheme } from "@/theme/ThemeProvider";

interface SearchFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  /**
   * "card": large rounded-2xl field on Discover. "pill": compact pill in the Search header.
   * "bar": the Discover search bar — a full-height pill with a hairline border that lifts to the accent on focus.
   */
  variant?: "card" | "pill" | "bar";
  /** Called when the keyboard's search key is pressed. */
  onSubmit?: () => void;
  onFocus?: () => void;
  accessibilityLabel?: string;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  {
    value,
    onChangeText,
    placeholder,
    autoFocus,
    variant = "card",
    onSubmit,
    onFocus,
    accessibilityLabel = "Search people, pages, posts and projects",
  },
  ref
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const pill = variant === "pill";
  const bar = variant === "bar";

  const container = bar
    ? `h-11 flex-1 flex-row items-center gap-2.5 rounded-full border bg-surface px-4 ${focused ? "border-accent-a50" : "border-border"}`
    : `flex-row items-center bg-surface ${pill ? "flex-1 gap-2 rounded-full px-4 py-1" : "rounded-2xl border border-border px-4"}`;
  const input = bar ? "min-w-0 flex-1 py-0 text-sm text-ink" : `min-w-0 flex-1 text-sm text-ink ${pill ? "py-2" : "ml-2.5 py-3"}`;

  return (
    <View className={container}>
      <Icon as={Search} size={16} className={`shrink-0 ${bar ? "text-brand-orange" : "text-ink-muted"}`} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        autoFocus={autoFocus}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        enterKeyHint="search"
        inputMode="search"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        accessibilityLabel={accessibilityLabel}
        className={input}
        style={{ fontFamily: "Inter_400Regular" }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} className="shrink-0">
          <Icon as={X} size={pill || bar ? 14 : 16} className="text-ink-muted" />
        </Pressable>
      ) : null}
    </View>
  );
});
