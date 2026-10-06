// src/components/messages/ForwardMessageSheet.tsx
// Forward one or more messages to chosen conversations.
import { Search, Send } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useConversations, useForwardMessages } from "@/hooks/useMessaging";
import { useTheme } from "@/theme/ThemeProvider";

interface ForwardMessageSheetProps {
  messages: { content: string }[];
  onClose: () => void;
  onSent: () => void;
}

export function ForwardMessageSheet({ messages, onClose, onSent }: ForwardMessageSheetProps) {
  const { colors } = useTheme();
  const { data: conversations, isLoading } = useConversations();
  const forwardMessages = useForwardMessages();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !conversations) return conversations ?? [];
    return conversations.filter((c) => {
      const { display_name, username } = c.other_participant;
      return display_name.toLowerCase().includes(q) || username.toLowerCase().includes(q);
    });
  }, [conversations, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!selected.size) return;
    setError(null);
    try {
      await forwardMessages.mutateAsync({ messages, targetConversationIds: [...selected] });
      onSent();
    } catch {
      setError("Couldn't forward that. Check your connection and try again.");
    }
  }

  return (
    <SheetFrame
      title={`Forward ${messages.length > 1 ? `${messages.length} messages` : "message"}`}
      onClose={onClose}
      zIndex={60}
      avoidKeyboard
      heightRatio={0.75}
      footer={
        <View>
          {error ? <Text className="pb-2 text-center text-xs text-danger">{error}</Text> : null}
          <Pressable
            onPress={() => void handleSend()}
            disabled={!selected.size || forwardMessages.isPending}
            accessibilityRole="button"
            className={`flex-row items-center justify-center gap-2 rounded-full bg-accent py-3 ${!selected.size || forwardMessages.isPending ? "opacity-50" : ""}`}
          >
            <Icon as={Send} size={16} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas">
              {forwardMessages.isPending ? "Sending…" : selected.size ? `Send to ${selected.size}` : "Select someone"}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View className="mb-2 flex-row items-center rounded-full border border-border bg-canvas px-3.5">
        <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people…"
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {isLoading ? (
        <Text className="py-8 text-center text-sm text-ink-muted">Loading…</Text>
      ) : !filtered.length ? (
        <Text className="py-8 text-center text-sm text-ink-muted">No conversations to forward to.</Text>
      ) : (
        filtered.map((c) => {
          const isSelected = selected.has(c.id);
          return (
            <Pressable
              key={c.id}
              onPress={() => toggle(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              className="flex-row items-center gap-3 px-1 py-2.5 active:bg-canvas"
            >
              <Avatar src={c.other_participant.avatar_url} name={c.other_participant.display_name} size="sm" />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
                {c.other_participant.display_name}
              </Text>
              <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-accent bg-accent" : "border-border"}`}>
                {isSelected ? <View className="h-2 w-2 rounded-full bg-canvas" /> : null}
              </View>
            </Pressable>
          );
        })
      )}
    </SheetFrame>
  );
}
