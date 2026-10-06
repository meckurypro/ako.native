// src/screens/PageInbox.tsx
// The active Page's inbox: conversations people have started with the page.
import { router, type Href } from "expo-router";
import { FlatList, Pressable, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { listAgo } from "@/components/messages/ConversationRow";
import { Avatar } from "@/components/ui/Avatar";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Text } from "@/components/ui/Text";
import { usePageConversations, type PageConversationSummary } from "@/hooks/usePageInbox";
import { useActiveIdentity } from "@/hooks/usePages";
import { decodeVoiceNote, VOICE_NOTE_LABEL } from "@/lib/voiceNotes";

function Row({ c }: { c: PageConversationSummary }) {
  const unread = c.unreadCount > 0;
  return (
    <Pressable
      onPress={() => router.push(`/page-inbox/${c.id}` as Href)}
      accessibilityRole="link"
      className="flex-row items-center gap-3 py-3 active:bg-surface/60"
    >
      <Avatar src={c.other_participant.avatar_url} name={c.other_participant.display_name} />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between">
          <Text numberOfLines={1} className={`shrink text-sm ${unread ? "font-semibold text-ink" : "font-medium text-ink"}`}>
            {c.other_participant.display_name}
          </Text>
          <Text className="ml-2 shrink-0 text-xs text-ink-muted">{listAgo(c.last_message_at)}</Text>
        </View>
        <Text numberOfLines={1} className={`text-sm ${unread ? "text-ink" : "text-ink-muted"}`}>
          {c.last_message
            ? `${c.last_message.sender_type === "page" ? "You: " : ""}${decodeVoiceNote(c.last_message.content) ? VOICE_NOTE_LABEL : c.last_message.content}`
            : "Say hello"}
        </Text>
      </View>
      {unread ? (
        <View className="h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5">
          <Text className="text-xs font-semibold text-canvas">{c.unreadCount > 99 ? "99+" : c.unreadCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function PageInbox() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { data: identity } = useActiveIdentity();
  const pageId = identity?.mode === "page" ? identity.page.id : undefined;
  const { data: conversations, isLoading } = usePageConversations(pageId);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={identity?.mode === "page" ? `${identity.page.name}'s Messages` : "Messages"} bar />
      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : !conversations || conversations.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">No conversations yet for this page.</Text>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          renderItem={({ item }) => <Row c={item} />}
        />
      )}
    </View>
  );
}
