// src/components/messages/ConversationRow.tsx
// One chat in the inbox, laid out like a modern messenger: avatar (ringed when they have a post you haven't seen),
// then two lines — name + time, and the last-message preview with delivery ticks, with the unread count and pin
// tucked at the end of that second line. No divider lines; the whole row is the tap target. Tap opens; long-press
// opens actions; in select mode a tap toggles selection.
import { Pin, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { MessageStatusTicks } from "@/components/ui/MessageStatusTicks";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import type { ConversationSummary } from "@/hooks/useMessaging";
import { haptics } from "@/lib/haptics";
import { formatChatListTime } from "@/lib/messageTime";
import { MessagePreviewLine } from "./MessagePreviewLine";

/** Compact list stamp: now / 5m / 3h / 2d. */
export function listAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function displayIdentity(c: ConversationSummary) {
  if (c.is_group && c.team_page) {
    return { name: c.team_page.name, avatarUrl: c.team_page.avatar_url, username: c.team_page.username };
  }
  return { name: c.other_participant.display_name, avatarUrl: c.other_participant.avatar_url, username: c.other_participant.username };
}

interface ConversationRowProps {
  conversation: ConversationSummary;
  currentUserId: string | undefined;
  unseenPostId?: string;
  selectMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onToggleSelect: () => void;
  onAvatarPress: () => void;
  onUnseenPostPress: (postId: string) => void;
}

export function ConversationRow({
  conversation: c,
  currentUserId,
  unseenPostId,
  selectMode,
  selected,
  onOpen,
  onLongPress,
  onToggleSelect,
  onAvatarPress,
  onUnseenPostPress,
}: ConversationRowProps) {
  const identity = displayIdentity(c);
  const showTicks = c.last_message?.sender_id === currentUserId;
  const unread = c.unreadCount > 0;

  const avatar = <Avatar src={identity.avatarUrl} name={identity.name} size="vn" />;

  return (
    <Pressable
      onPress={selectMode ? onToggleSelect : onOpen}
      onLongPress={
        selectMode
          ? undefined
          : () => {
              haptics.light();
              onLongPress();
            }
      }
      delayLongPress={450}
      accessibilityRole="link"
      accessibilityState={{ selected: selectMode ? selected : undefined }}
      className="flex-row items-center gap-3.5 px-4 py-3 active:bg-surface-a60"
    >
      {selectMode ? (
        <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent" : "border-border"}`}>
          {selected ? <View className="h-2 w-2 rounded-full bg-canvas" /> : null}
        </View>
      ) : null}

      {/* Both variants occupy the same 56px box, so names line up whether or not there's a ring. */}
      {unseenPostId ? (
        // A glowing ring means they've posted something you haven't seen — tapping the avatar opens it.
        <Pressable
          onPress={() => (selectMode ? onToggleSelect() : onUnseenPostPress(unseenPostId))}
          accessibilityRole="link"
          accessibilityLabel={`View ${identity.name}'s new post`}
          className="h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent"
          style={{ shadowColor: "#3D5A45", shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3 }}
        >
          <View className="rounded-full bg-canvas p-[2px]">{avatar}</View>
        </Pressable>
      ) : (
        <Pressable
          onPress={onAvatarPress}
          accessibilityRole="imagebutton"
          accessibilityLabel={`View ${identity.name}'s photo`}
          className="h-14 w-14 shrink-0 items-center justify-center"
        >
          {avatar}
        </Pressable>
      )}

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center">
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Text numberOfLines={1} className={`shrink text-base text-ink ${unread ? "font-semibold" : "font-medium"}`}>
              {identity.name}
            </Text>
            {c.is_group ? (
              <View className="shrink-0 flex-row items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-[1px]">
                <Icon as={Users} size={10} className="text-ink-muted" />
                <Text className="text-[10px] font-medium text-ink-muted">Group</Text>
              </View>
            ) : null}
          </View>
          {/* The stamp turns the unread colour, like the badge below it. */}
          <Text className={`ml-2 shrink-0 text-xs ${unread ? "font-semibold text-cta" : "text-ink-muted"}`}>{formatChatListTime(c.last_message_at)}</Text>
        </View>

        <View className="mt-0.5 min-h-[22px] min-w-0 flex-row items-center gap-1">
          {showTicks && c.last_message && !c.last_message.is_deleted ? (
            <View className="shrink-0">
              <MessageStatusTicks deliveredAt={c.last_message.delivered_at} readAt={c.last_message.read_at} variant="list" size={15} />
            </View>
          ) : null}
          <View className="min-w-0 flex-1">
            <MessagePreviewLine
              variant="list"
              content={c.last_message?.is_deleted ? "This message was deleted" : (c.last_message?.content ?? "Say hello")}
              className={`text-sm ${unread ? "text-ink" : "text-ink-muted"} ${c.last_message?.is_deleted ? "italic opacity-70" : ""}`}
              iconClassName={unread ? "text-ink" : "text-ink-muted"}
            />
          </View>
          {unread ? (
            <View className="ml-1 h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-cta px-1.5">
              <Text className="text-xs font-semibold text-white">{c.unreadCount > 99 ? "99+" : c.unreadCount}</Text>
            </View>
          ) : null}
          {c.pinned_at ? <Icon as={Pin} size={15} className="ml-1 shrink-0 text-ink-muted" /> : null}
        </View>
      </View>
    </Pressable>
  );
}
