// src/components/post/MentionTextarea.tsx
// Multiline input with @mention suggestions and an optional formatting toolbar.
//
// RN has no synchronous selection API, so the caret is tracked from
// onSelectionChange and only *forced* (via the `selection` prop) for the one
// frame after we edit the text ourselves (accepting a mention, applying a
// format mark) — then released so normal typing is never fought.
import { Building2 } from "lucide-react-native";
import { forwardRef, useCallback, useRef, useState } from "react";
import {
  ScrollView,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputProps,
  type TextInputSelectionChangeEventData,
} from "react-native";
import { Pressable } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMentionSuggestions } from "@/hooks/useMentions";
import { useTheme } from "@/theme/ThemeProvider";
import { FormatToolbar, type Selection } from "./FormatToolbar";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Visible lines (web `rows`). */
  rows?: number;
  maxLength?: number;
  /** Extra classes for the input box (borders, padding, background). */
  className?: string;
  autoFocus?: boolean;
  showFormatToolbar?: boolean;
  returnKeyType?: TextInputProps["returnKeyType"];
}

const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;
const LINE_HEIGHT = 22;

export const MentionTextarea = forwardRef<TextInput, MentionTextareaProps>(function MentionTextarea(
  { value, onChange, placeholder, rows = 8, maxLength, className = "", autoFocus, showFormatToolbar },
  forwardedRef
) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  const [forced, setForced] = useState<Selection | undefined>();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const suggestionsQuery = useMentionSuggestions(mentionQuery ?? "");
  const suggestions = mentionQuery !== null ? suggestionsQuery.data ?? [] : [];

  const setRefs = useCallback(
    (node: TextInput | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  /** Move the caret programmatically, then hand control back to the user. */
  const placeCaret = useCallback((next: Selection) => {
    setSelection(next);
    setForced(next);
    setTimeout(() => setForced(undefined), 60);
  }, []);

  function handleChangeText(next: string) {
    // The caret sits at the end of whatever was just typed/deleted/pasted.
    const cursor = Math.min(next.length, Math.max(0, selection.start + (next.length - value.length)));
    onChange(next);
    const match = next.slice(0, cursor).match(MENTION_TRIGGER);
    setMentionQuery(match ? match[1] : null);
  }

  function handleSelectionChange(e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    setSelection(e.nativeEvent.selection);
  }

  function selectMention(username: string) {
    const cursor = Math.min(selection.start, value.length);
    const upToCursor = value.slice(0, cursor);
    const match = upToCursor.match(MENTION_TRIGGER);
    if (!match) return;

    const startOfMention = cursor - match[0].length + (match[0].startsWith("@") ? 0 : 1);
    onChange(`${value.slice(0, startOfMention)}@${username} ${value.slice(cursor)}`);
    setMentionQuery(null);

    const newCursor = startOfMention + username.length + 2;
    placeCaret({ start: newCursor, end: newCursor });
    inputRef.current?.focus();
  }

  return (
    <View>
      {showFormatToolbar ? (
        <FormatToolbar value={value} selection={selection} onChange={onChange} onSelect={placeCaret} className="mb-1.5" />
      ) : null}

      <TextInput
        ref={setRefs}
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
        selection={forced}
        maxLength={maxLength}
        multiline
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={`${colors.inkMuted}99`}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        textAlignVertical="top"
        scrollEnabled
        className={`text-base text-ink ${className}`}
        style={{ fontFamily: "Inter_400Regular", minHeight: rows * LINE_HEIGHT + 24, lineHeight: LINE_HEIGHT }}
      />

      {mentionQuery !== null && suggestions.length > 0 ? (
        <View className="mt-1 max-h-56 overflow-hidden rounded-xl border border-border bg-canvas py-1">
          <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
            {suggestions.map((person) => (
              <Pressable
                key={`${person.kind}-${person.id}`}
                onPress={() => selectMention(person.username)}
                accessibilityRole="button"
                className="flex-row items-center gap-2.5 px-3 py-2 active:bg-surface"
              >
                <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text numberOfLines={1} className="shrink text-sm text-ink">
                      {person.display_name}
                    </Text>
                    {/* Only pages are marked — profiles are the unmarked default. */}
                    {person.kind === "page" ? (
                      <Icon as={Building2} size={12} className="shrink-0 text-ink-muted" accessibilityLabel="Organization or brand page" />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    @{person.username}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
});
