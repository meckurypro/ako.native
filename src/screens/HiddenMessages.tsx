// src/screens/HiddenMessages.tsx
// Messages you hid from one conversation — only visible to you; restore any time.
import { Undo2 } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/styled";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useHiddenMessages, useUnhideMessage } from "@/hooks/useMessageReactions";
import { MessagePreviewLine } from "@/components/messages/MessagePreviewLine";

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function HiddenMessages() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: hidden, isLoading } = useHiddenMessages(conversationId);
  const unhide = useUnhideMessage(conversationId);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title="Hidden messages" bar />
      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : !hidden || hidden.length === 0 ? (
        <Text className="px-6 py-16 text-center text-sm text-ink-muted">
          Nothing hidden here. Messages you hide from a chat show up in this list, only for you.
        </Text>
      ) : (
        <FlatList
          data={hidden}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item: m }) => (
            <View className="flex-row items-start gap-3 border-b border-border py-3.5">
              <View className="min-w-0 flex-1">
                <Text className="mb-0.5 text-xs text-ink-muted">
                  {m.sender_id === user?.id ? "You" : "Them"} · {formatTime(m.created_at)}
                </Text>
                <MessagePreviewLine content={m.is_deleted ? "This message was deleted" : m.content} className={`text-sm text-ink ${m.is_deleted ? "italic opacity-70" : ""}`} iconClassName="text-ink-muted" />
              </View>
              <Pressable onPress={() => unhide.mutate(m.id)} accessibilityRole="button" hitSlop={8} className="shrink-0 flex-row items-center gap-1.5 py-1">
                <Icon as={Undo2} size={14} className="text-accent" />
                <Text className="text-xs font-medium text-accent">Restore</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}
