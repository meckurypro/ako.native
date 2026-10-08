// src/components/messages/MessageBubble.tsx
// One chat message: bubble (tail corner, reply quote, text / jumbo emoji /
// voice note / deleted), time + delivery ticks, reaction chips, and the gestures:
//   • swipe right  → reply (icon reveals, haptic tick at the threshold)
//   • long-press   → action menu (reports the bubble's on-screen rect)
//   • tap          → toggles selection while in select mode
import { Reply } from "lucide-react-native";
import { memo, useCallback, useRef } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInLeft, FadeInRight, interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { MessageReaction } from "@/hooks/useMessageReactions";
import type { MessageWithSender } from "@/hooks/useMessaging";
import { getEmojiOnlyInfo } from "@/lib/emoji";
import { haptics } from "@/lib/haptics";
import { decodeMedia } from "@/lib/chatMedia";
import { formatMessageDayLabel, formatMessageTime } from "@/lib/messageTime";
import { decodeVoiceNote } from "@/lib/voiceNotes";
import { MediaMessage } from "./MediaMessage";
import { MessagePreviewLine } from "./MessagePreviewLine";
import { VoiceMessageBubble } from "./VoiceMessageBubble";
import type { Rect } from "./ReactionOptionsPopover";

export const SWIPE_THRESHOLD = 56;
export const SWIPE_MAX = 80;
const SWIPE_RESISTANCE = 0.2;

const JUMBO_SIZE = [0, 60, 48, 36];

function highlightMatches(text: string, query: string, isMine: boolean) {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.split(new RegExp(`(${escaped})`, "gi")).map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <Text key={i} className={isMine ? "text-white" : "text-ink"} style={{ backgroundColor: isMine ? "rgba(255,255,255,0.25)" : "rgba(61,90,69,0.18)" }}>
        {part}
      </Text>
    ) : (
      part
    )
  );
}

function ReactionsBar({
  reactions,
  myReaction,
  isMine,
  onAdd,
  onRequestManage,
}: {
  reactions: MessageReaction[];
  myReaction: string | null;
  isMine: boolean;
  onAdd: (emoji: string) => void;
  onRequestManage: (anchorRect: Rect, emoji: string) => void;
}) {
  if (!reactions.length) return null;
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);

  return (
    <View className={`mt-1.5 flex-row flex-wrap gap-2 ${isMine ? "justify-end" : "justify-start"}`}>
      {[...counts.entries()].map(([emoji, count]) => (
        <ReactionChip
          key={emoji}
          emoji={emoji}
          count={count}
          mine={myReaction === emoji}
          onAdd={() => onAdd(emoji)}
          onManage={(rect) => onRequestManage(rect, emoji)}
        />
      ))}
    </View>
  );
}

function ReactionChip({ emoji, count, mine, onAdd, onManage }: { emoji: string; count: number; mine: boolean; onAdd: () => void; onManage: (rect: Rect) => void }) {
  const ref = useRef<View>(null);
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      onPress={() => {
        if (!mine) return onAdd();
        ref.current?.measureInWindow((x, y, width, height) => onManage({ x, y, width, height }));
      }}
      accessibilityRole="button"
      accessibilityLabel={`${emoji} ${count}`}
      className={`h-8 w-8 items-center justify-center rounded-full bg-surface ${mine ? "border-2 border-accent" : ""}`}
      style={{ shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 }}
    >
      <Text className="text-base leading-[20px]">{emoji}</Text>
      {count > 1 ? (
        <View className="absolute -bottom-1 -right-1 h-4 min-w-[16px] items-center justify-center rounded-full bg-ink-muted px-1">
          <Text className="text-[10px] font-semibold leading-[14px] text-canvas">{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

interface MessageBubbleProps {
  message: MessageWithSender;
  currentUserId: string | undefined;
  otherParticipantName: string;
  otherParticipantAvatarUrl?: string | null;
  myAvatarUrl?: string | null;
  myName?: string;
  reactions: MessageReaction[];
  myReaction: string | null;
  isSelected: boolean;
  selectMode: boolean;
  isHighlighted: boolean;
  searchQuery: string;
  voiceNoteOpenedAt?: string | null;
  onVoiceNoteOpened?: (messageId: string) => void;
  animateIn: boolean;
  onRowPress: (id: string) => void;
  onLongPress: (m: MessageWithSender, rect: Rect) => void;
  onSwipeReply: (m: MessageWithSender) => void;
  onScrollToMessage: (id: string) => void;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRequestManageReaction: (messageId: string, anchorRect: Rect, emoji: string) => void;
}

function MessageBubbleImpl({
  message: m,
  currentUserId,
  otherParticipantName,
  otherParticipantAvatarUrl,
  myAvatarUrl,
  myName,
  reactions,
  myReaction,
  isSelected,
  selectMode,
  isHighlighted,
  searchQuery,
  voiceNoteOpenedAt,
  onVoiceNoteOpened,
  animateIn,
  onRowPress,
  onLongPress,
  onSwipeReply,
  onScrollToMessage,
  onAddReaction,
  onRequestManageReaction,
}: MessageBubbleProps) {
  const isMine = m.sender_id === currentUserId;
  const voiceNote = !m.is_deleted ? decodeVoiceNote(m.content) : null;
  const repliedTo = m.reply_to?.[0];
  const media = !m.is_deleted ? decodeMedia(m.content) : null;
  const isPhoto = media?.items[0].kind === "image";
  const timeStr = formatMessageTime(m.created_at);
  const emojiInfo = !m.is_deleted && !voiceNote && !media && !repliedTo ? getEmojiOnlyInfo(m.content) : { isEmojiOnly: false, count: 0 };
  const isJumbo = emojiInfo.isEmojiOnly;
  const ticks = isMine ? <MessageStatusTicks deliveredAt={m.delivered_at} readAt={m.read_at} size={14} /> : null;

  const bubbleRef = useRef<View>(null);

  // ── swipe to reply ──
  const offset = useSharedValue(0);
  const triggered = useSharedValue(false);

  const fireReply = useCallback(() => {
    haptics.light();
    onSwipeReply(m);
  }, [m, onSwipeReply]);

  const pan = Gesture.Pan()
    .enabled(!selectMode && !m.is_deleted)
    .activeOffsetX(12)
    .failOffsetY([-14, 14])
    .failOffsetX(-12)
    .onUpdate((e) => {
      const dx = Math.max(0, e.translationX);
      offset.value = dx <= SWIPE_MAX ? dx : SWIPE_MAX + (dx - SWIPE_MAX) * SWIPE_RESISTANCE;
      if (dx > SWIPE_THRESHOLD && !triggered.value) {
        triggered.value = true;
        scheduleOnRN(fireReply);
      }
    })
    .onFinalize(() => {
      triggered.value = false;
      offset.value = withTiming(0, { duration: 200 });
    });

  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(offset.value / SWIPE_THRESHOLD, 1),
    transform: [{ scale: interpolate(offset.value, [0, SWIPE_THRESHOLD], [0.7, 1], "clamp") }],
  }));

  const handleLongPress = useCallback(() => {
    if (selectMode) return;
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      haptics.light();
      onLongPress(m, { x, y, width, height });
    });
  }, [selectMode, m, onLongPress]);

  const textColor = isMine ? "text-white" : "text-ink";
  const footerColor = isMine ? "text-white/70" : "text-ink-muted";
  const entering = animateIn ? (isMine ? FadeInRight.duration(220) : FadeInLeft.duration(220)) : undefined;

  return (
    <Animated.View entering={entering} className="-mx-2 mb-2 flex-row items-center gap-2 px-2 py-0.5">
      {selectMode ? (
        <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-accent bg-accent" : "border-border"}`}>
          {isSelected ? <View className="h-2 w-2 rounded-full bg-canvas" /> : null}
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Pressable
          onPress={() => onRowPress(m.id)}
          onLongPress={handleLongPress}
          delayLongPress={450}
          className={`min-w-0 flex-1 flex-row ${isMine ? "justify-end" : "justify-start"}`}
        >
          <View className={`relative max-w-[78%] ${isMine ? "items-end" : "items-start"}`}>
            {/* Reply icon revealed in the gap the swipe uncovers. */}
            <Animated.View
              pointerEvents="none"
              className="absolute left-0 top-1/2 -mt-4 h-8 w-8 items-center justify-center rounded-full bg-accent-soft"
              style={replyIconStyle}
            >
              <Icon as={Reply} size={16} className="text-accent" />
            </Animated.View>

            <Animated.View
              ref={bubbleRef}
              collapsable={false}
              className={
                isJumbo
                  ? ""
                  : `rounded-2xl ${isPhoto ? "p-1" : "px-3 py-2"} ${isMine ? "rounded-br-md bg-bubble-mine" : "rounded-bl-md bg-bubble-theirs"} ${m.is_deleted ? "opacity-70" : ""}`
              }
              style={[
                bubbleStyle,
                !isJumbo && !isMine
                  ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1 }
                  : null,
              ]}
            >
              {isHighlighted || isSelected ? (
                <View pointerEvents="none" className={`absolute inset-0 rounded-2xl ${isSelected ? "bg-highlight/50" : "bg-accent/25"}`} />
              ) : null}

              {repliedTo && !m.is_deleted ? (
                <Pressable
                  onPress={() => onScrollToMessage(repliedTo.id)}
                  accessibilityRole="button"
                  className={`mb-1.5 rounded-sm border-l-2 pl-2 ${isMine ? "border-white/50" : "border-accent/50"}`}
                >
                  <Text className={`text-xs font-medium ${isMine ? "text-white/80" : "text-ink-muted"}`}>
                    {repliedTo.sender_id === currentUserId ? "You" : otherParticipantName}
                  </Text>
                  {repliedTo.is_deleted ? (
                    <Text numberOfLines={1} className={`text-xs ${isMine ? "text-white/80" : "text-ink-muted"}`}>
                      Original message deleted
                    </Text>
                  ) : (
                    <MessagePreviewLine content={repliedTo.content} className={`text-xs ${isMine ? "text-white/80" : "text-ink-muted"}`} iconClassName={isMine ? "text-white/80" : "text-ink-muted"} />
                  )}
                </Pressable>
              ) : null}

              {m.is_deleted ? (
                <View>
                  <Text className={`text-sm italic ${textColor}`}>This message was deleted</Text>
                  {ticks ? (
                    <View className="mt-1 flex-row items-center justify-end gap-1">
                      <Text className="text-[11px] text-ink-muted">{timeStr}</Text>
                      {ticks}
                    </View>
                  ) : null}
                </View>
              ) : media ? (
                <MediaMessage
                  media={media}
                  isMine={isMine}
                  timeStr={timeStr}
                  ticks={ticks}
                  senderName={otherParticipantName}
                  sentLabel={`${formatMessageDayLabel(m.created_at)}, ${timeStr}`}
                  footerColor={footerColor}
                  textColor={textColor}
                />
              ) : voiceNote ? (
                <VoiceMessageBubble
                  url={voiceNote.url}
                  path={voiceNote.path}
                  durationSec={voiceNote.durationSec}
                  peaks={voiceNote.peaks}
                  isMine={isMine}
                  viewOnce={voiceNote.viewOnce}
                  openedOnceAt={voiceNoteOpenedAt}
                  onOpened={() => onVoiceNoteOpened?.(m.id)}
                  senderAvatarUrl={isMine ? myAvatarUrl : otherParticipantAvatarUrl}
                  senderName={isMine ? (myName ?? "You") : otherParticipantName}
                  footer={
                    <View className="flex-row items-center gap-1">
                      <Text className={`text-[11px] ${footerColor}`}>{timeStr}</Text>
                      {ticks}
                    </View>
                  }
                />
              ) : isJumbo ? (
                <View className="items-end">
                  <Text style={{ fontSize: JUMBO_SIZE[emojiInfo.count] ?? 36, lineHeight: (JUMBO_SIZE[emojiInfo.count] ?? 36) + 6 }}>{m.content.trim()}</Text>
                  <View className="mt-0.5 flex-row items-center gap-1">
                    <Text className="text-[11px] text-ink-muted">{timeStr}</Text>
                    {ticks}
                  </View>
                </View>
              ) : (
                <View>
                  <Text className={`text-sm leading-[20px] ${textColor}`}>
                    {searchQuery ? highlightMatches(m.content, searchQuery, isMine) : m.content}
                    {/* Reserves room at the end of the last line for the timestamp pinned bottom-right. */}
                    <Text className="text-[11px] opacity-0">{`\u00A0\u00A0\u00A0\u00A0${timeStr}${isMine ? "\u00A0\u00A0\u00A0\u00A0\u00A0" : ""}`}</Text>
                  </Text>
                  <View pointerEvents="none" className="absolute bottom-0 right-0 flex-row items-center gap-1">
                    <Text className={`text-[11px] leading-none ${footerColor}`}>{timeStr}</Text>
                    {ticks}
                  </View>
                </View>
              )}
            </Animated.View>

            {!m.is_deleted ? (
              <ReactionsBar
                reactions={reactions}
                myReaction={myReaction}
                isMine={isMine}
                onAdd={(emoji) => onAddReaction(m.id, emoji)}
                onRequestManage={(rect, emoji) => onRequestManageReaction(m.id, rect, emoji)}
              />
            ) : null}
          </View>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
