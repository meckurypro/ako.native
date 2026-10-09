// src/screens/PageMessageThread.tsx
// One conversation in a Page's inbox. The page's side is on the right, the
// visitor's on the left. Text only (voice/emoji tools belong to personal chats).
import { Send } from "lucide-react-native";
import { useLocalSearchParams } from "expo-router";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { listAgo } from "@/components/messages/ConversationRow";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useMarkPageThreadRead, usePageThread, useSendPageMessage } from "@/hooks/usePageInbox";
import { useActiveConversationPush } from "@/hooks/useActiveConversationPush";
import { dayKeyFor, formatMessageDayLabel } from "@/lib/messageTime";
import { useTheme } from "@/theme/ThemeProvider";

type PageMessage = NonNullable<ReturnType<typeof usePageThread>["data"]>[number];
type Item = { key: string; message: PageMessage; showDay: boolean; dayLabel: string };

export function PageMessageThread() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  useActiveConversationPush(conversationId);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const listRef = useRef<FlashListRef<Item>>(null);
  const { data: messages, isLoading } = usePageThread(conversationId);
  const sendMessage = useSendPageMessage(conversationId);
  const markRead = useMarkPageThreadRead(conversationId);
  const messagingEnabled = useFeatureFlag("page_messaging_enabled");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const items = useMemo<Item[]>(() => {
    let lastDay: string | null = null;
    return (messages ?? []).map((m) => {
      const day = dayKeyFor(m.created_at);
      const showDay = day !== lastDay;
      lastDay = day;
      return { key: m.id, message: m, showDay, dayLabel: formatMessageDayLabel(m.created_at) };
    });
  }, [messages]);

  function handleSend() {
    if (!messagingEnabled) return;
    const content = draft.trim();
    if (!content) return;
    sendMessage.mutate(content);
    setDraft("");
  }

  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const composerStyle = useAnimatedStyle(() => ({ paddingBottom: (keyboard.height.value > 0 ? 0 : insets.bottom) + 12 }));

  return (
    <Animated.View style={[{ flex: 1 }, rootStyle]} className="bg-canvas">
      <ScreenHeader title="Conversation" bar />

      <View className="min-h-0 flex-1">
        {isLoading ? (
          <Text className="py-10 text-center text-ink-muted">Loading…</Text>
        ) : items.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Say hello.</Text>
        ) : (
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(i) => i.key}
            maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            renderItem={({ item }) => {
              const fromPage = item.message.sender_type === "page";
              return (
                <View>
                  {item.showDay ? (
                    <View className="items-center py-2">
                      <View className="rounded-full border border-border bg-surface/90 px-3 py-1">
                        <Text className="text-[11px] font-medium text-ink-muted">{item.dayLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                  <View className={`mb-2 max-w-[75%] rounded-2xl px-3.5 py-2 ${fromPage ? "self-end bg-accent" : "self-start border border-border bg-surface"}`}>
                    <Text className={`text-sm ${fromPage ? "text-canvas" : "text-ink"}`}>{item.message.content}</Text>
                    <Text className={`mt-0.5 text-[10px] ${fromPage ? "text-canvas/70" : "text-ink-muted"}`}>{listAgo(item.message.created_at)}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      <Animated.View style={composerStyle} className="border-t border-border bg-canvas px-4 pt-3">
        {!messagingEnabled ? <Text className="mb-2 text-center text-xs text-ink-muted">Page messaging is temporarily disabled.</Text> : null}
        <View className="flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            editable={messagingEnabled}
            returnKeyType="send"
            placeholder="Message as your page…"
            placeholderTextColor={colors.inkMuted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            className={`min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink ${!messagingEnabled ? "opacity-50" : ""}`}
            style={{ fontFamily: "Inter_400Regular" }}
          />
          <Pressable
            onPress={handleSend}
            disabled={!messagingEnabled || !draft.trim() || sendMessage.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            className={`h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent ${!messagingEnabled || !draft.trim() || sendMessage.isPending ? "opacity-40" : ""}`}
          >
            <Icon as={Send} size={16} className="text-canvas" />
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
