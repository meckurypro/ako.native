// src/components/post/PeoplePicker.tsx
// Search + multi-select people (and Pages) — used by Tag people and Invite
// collaborators. Already-selected people stay pinned at the top even when a new
// search no longer returns them.
import { Check, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMentionSuggestions, type MentionCandidate } from "@/hooks/useMentions";
import { useTheme } from "@/theme/ThemeProvider";

interface PeoplePickerProps {
  title: string;
  subtitle?: string;
  confirmLabel: string;
  initialSelected?: MentionCandidate[];
  onConfirm: (selected: MentionCandidate[]) => void;
  onClose: () => void;
}

export function PeoplePicker({ title, subtitle, confirmLabel, initialSelected = [], onConfirm, onClose }: PeoplePickerProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, MentionCandidate>>(new Map(initialSelected.map((p) => [p.id, p])));
  const { data: suggestions, isLoading } = useMentionSuggestions(query);

  function toggle(person: MentionCandidate) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });
  }

  const pinnedSelected = [...selected.values()].filter((p) => !(suggestions ?? []).some((s) => s.id === p.id));
  const rows = [...pinnedSelected, ...(suggestions ?? [])];

  return (
    <SheetFrame
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      avoidKeyboard
      heightRatio={0.8}
      footer={<Button onPress={() => onConfirm([...selected.values()])}>{`${confirmLabel}${selected.size > 0 ? ` (${selected.size})` : ""}`}</Button>}
    >
      <View className="mb-3 flex-row items-center rounded-full border border-border bg-canvas px-3.5">
        <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search people…"
          placeholderTextColor={`${colors.inkMuted}99`}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {rows.length === 0 && !isLoading ? (
        <Text className="py-10 text-center text-sm text-ink-muted">
          {query.trim() ? "No one matches that search." : "Start typing a name or username."}
        </Text>
      ) : (
        <View className="gap-1">
          {rows.map((person) => {
            const isSelected = selected.has(person.id);
            return (
              <Pressable
                key={person.id}
                onPress={() => toggle(person)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                className="flex-row items-center gap-3 rounded-xl px-1 py-2 active:bg-canvas"
              >
                <Avatar src={person.avatar_url} name={person.display_name} size="sm" />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-ink">
                    {person.display_name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-muted">
                    @{person.username}
                  </Text>
                </View>
                <View
                  className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? "border-accent bg-accent" : "border-border"
                  }`}
                >
                  {isSelected ? <Icon as={Check} size={12} strokeWidth={3} className="text-canvas" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </SheetFrame>
  );
}
