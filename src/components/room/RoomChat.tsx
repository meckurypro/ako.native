// src/components/room/RoomChat.tsx
// A cohort's group chat: message list, text composer with emoji panel, hold-to-record voice notes.
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Keyboard as KeyboardIcon, Lock, Mic, Send, Smile } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmojiPickerSheet, removeLastGrapheme } from "@/components/messages/EmojiPickerSheet";
import { VoiceMessageBubble } from "@/components/messages/VoiceMessageBubble";
import { VoiceComposerOverlay } from "@/components/room/VoiceComposerOverlay";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useMessages, useSendMessage, useSendVoiceNote } from "@/hooks/useMessaging";
import { useMicGesture } from "@/hooks/useMicGesture";
import { useRoomMembersList } from "@/hooks/useRoom";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { decodeVoiceNote } from "@/lib/voiceNotes";
import { useTheme } from "@/theme/ThemeProvider";

interface RoomChatProps {
  projectId: string;
  conversationId: string;
  canPost: boolean;
  cantPostReason?: string;
}

export function RoomChat({ projectId, conversationId, canPost, cantPostReason }: RoomChatProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const { lastKnownHeight } = useKeyboardInset();
  const { data: messages, hasMore, loadOlder, isLoadingOlder } = useMessages(conversationId);
  const { data: members } = useRoomMembersList(projectId);
  const sendMessage = useSendMessage(conversationId);
  const sendVoiceNote = useSendVoiceNote(conversationId);
  const [content, setContent] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlashListRef<NonNullable<typeof messages>[number]>>(null);

  const memberByUserId = useMemo(() => new Map((members ?? []).map((m) => [m.user_id, m.profile])), [members]);
  useBackDismiss(() => setEmojiOpen(false), emojiOpen);

  const voiceRecorder = useVoiceRecorder(async (file, durationSec, peaks, viewOnce, localUrl) => {
    try {
      await sendVoiceNote.mutateAsync({ file, durationSec, peaks, viewOnce, replyToMessageId: null, localUrl });
    } catch {
      toast("Couldn't send the voice message. Please try again.", { variant: "error" });
      throw new Error("send failed"); // keeps the recorder from discarding a preview it couldn't send
    }
  });
  const micGesture = useMicGesture(voiceRecorder);
  const recordingActive = voiceRecorder.phase !== "idle";

  // While the keyboard is up it already clears the bottom edge, so drop the safe-area padding.
  const composerSafeStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value > 0 || emojiOpen ? 0 : insets.bottom }));

  const handleSend = useCallback(() => {
    const text = content.trim();
    if (!text) return;
    sendMessage.mutate(text, { onError: () => toast("Couldn't send that message.", { variant: "error" }) });
    setContent("");
  }, [content, sendMessage, toast]);

  const list = messages ?? [];

  return (
    <View className="flex-1">
      <View className="flex-1">
        {list.length === 0 ? (
          <Text className="mt-6 text-center text-sm text-ink-muted">No messages yet — say hello.</Text>
        ) : (
          <FlashList
            ref={listRef}
            data={list}
            keyExtractor={(m) => m.id}
            maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true, animateAutoScrollToBottom: true }}
            onStartReached={() => hasMore && !isLoadingOlder && loadOlder()}
            onStartReachedThreshold={0.3}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 8 }}
            ListHeaderComponent={isLoadingOlder ? <Text className="py-2 text-center text-xs text-ink-muted">Loading earlier messages…</Text> : null}
            renderItem={({ item: m }) => {
              const isMine = m.sender_id === user?.id;
              const sender = memberByUserId.get(m.sender_id);
              const voiceNote = m.is_deleted ? null : decodeVoiceNote(m.content);
              return (
                <View className={`mb-2.5 flex-row items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                  {!isMine && <Avatar src={sender?.avatar_url} name={sender?.display_name ?? "Member"} size="sm" />}
                  <View className={`max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
                    {!isMine && <Text className="mb-0.5 px-1 text-xs font-medium text-ink-muted">{sender?.display_name ?? "Member"}</Text>}
                    {voiceNote ? (
                      <VoiceMessageBubble url={voiceNote.url} path={voiceNote.path} durationSec={voiceNote.durationSec} peaks={voiceNote.peaks} isMine={isMine} />
                    ) : (
                      <View className={`rounded-2xl px-3.5 py-2 ${isMine ? "rounded-br-md bg-accent" : "rounded-bl-md bg-surface"}`}>
                        {m.is_deleted ? (
                          <Text className={`text-sm italic opacity-70 ${isMine ? "text-canvas" : "text-ink"}`}>Message deleted</Text>
                        ) : (
                          <Text selectable className={`text-sm ${isMine ? "text-canvas" : "text-ink"}`}>
                            {m.content}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {!canPost ? (
        <Animated.View style={composerSafeStyle} className="flex-row items-center gap-1.5 border-t border-border px-3 py-2.5">
          <Icon as={Lock} size={14} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">{cantPostReason ?? "Chat is closed"}</Text>
        </Animated.View>
      ) : (
        <Animated.View style={composerSafeStyle} className="relative border-t border-border bg-canvas">
          {/* Always mounted: the mic is the touch target for the whole hold-to-record gesture. */}
          <View className="flex-row items-center gap-2 px-1 py-2" pointerEvents={recordingActive ? "none" : "auto"} accessibilityElementsHidden={recordingActive}>
            <Pressable
              onPress={() => {
                const closing = emojiOpen;
                setEmojiOpen(!closing);
                if (closing) requestAnimationFrame(() => inputRef.current?.focus());
                else inputRef.current?.blur();
              }}
              accessibilityRole="button"
              accessibilityLabel={emojiOpen ? "Switch to keyboard" : "Add emoji"}
              className="shrink-0"
            >
              <Icon as={emojiOpen ? KeyboardIcon : Smile} size={22} className="text-ink-muted" />
            </Pressable>
            <TextInput
              ref={inputRef}
              value={content}
              onChangeText={setContent}
              onFocus={() => setEmojiOpen(false)}
              maxLength={2000}
              placeholder="Message the group…"
              placeholderTextColor={colors.inkMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink"
              style={{ fontFamily: "Inter_400Regular" }}
            />
            {content.trim() ? (
              <Pressable onPress={handleSend} disabled={sendMessage.isPending} accessibilityRole="button" accessibilityLabel="Send" className={`shrink-0 rounded-full bg-accent p-2.5 ${sendMessage.isPending ? "opacity-50" : ""}`}>
                <Icon as={Send} size={16} className="text-white" />
              </Pressable>
            ) : (
              <GestureDetector gesture={micGesture}>
                <View accessibilityRole="button" accessibilityLabel="Hold to record a voice note" className="shrink-0 rounded-full bg-accent p-2.5">
                  <Icon as={Mic} size={16} className="text-white" />
                </View>
              </GestureDetector>
            )}
          </View>
          <VoiceComposerOverlay recorder={voiceRecorder} allowViewOnce />
          {emojiOpen ? (
            <EmojiPickerSheet mode="input" content={content} heightPx={lastKnownHeight} onBackspace={() => setContent((c) => removeLastGrapheme(c))} onSelect={(emoji) => setContent((c) => c + emoji)} />
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}
