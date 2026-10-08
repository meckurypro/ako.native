// src/screens/ConversationList.tsx
// The inbox: Archive entry, search, Pinned section, then chats by recency.
// Long-press a chat for actions, or enter select mode to archive/delete in bulk.
import { Archive, CheckSquare, ChevronRight, Search, Trash2, X } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ConversationActionSheet } from "@/components/messages/ConversationActionSheet";
import { ConversationRow, displayIdentity } from "@/components/messages/ConversationRow";
import { MediaViewer } from "@/components/post/MediaViewer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import {
  useArchiveBadgeCount,
  useBulkUpdateConversationState,
  useConversations,
  useTogglePin,
  useUpdateConversationState,
  type ConversationSummary,
} from "@/hooks/useMessaging";
import { useUnseenPosts } from "@/hooks/useUnseenPosts";
import { messagePlainText } from "@/lib/chatMedia";
import { useTheme } from "@/theme/ThemeProvider";

const MAX_PINNED = 3;

type Item = { kind: "section"; label: string } | { kind: "chat"; conversation: ConversationSummary };

export function ConversationList() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const chromeScroll = useChromeScroll();

  const { data: conversations, isLoading } = useConversations();
  const authorIds = conversations?.map((c) => c.other_participant.id) ?? [];
  const { data: unseenPosts } = useUnseenPosts(authorIds);
  const archiveBadgeCount = useArchiveBadgeCount();
  const messagingEnabled = useFeatureFlag("messaging_enabled");

  const [searchQuery, setSearchQuery] = useState("");
  const updateConversationState = useUpdateConversationState();
  const bulkUpdateConversationState = useBulkUpdateConversationState();
  const togglePin = useTogglePin();
  const [actionTarget, setActionTarget] = useState<ConversationSummary | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  function enterSelectMode(id: string) {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function handleBulkArchive() {
    bulkUpdateConversationState.mutate({ conversationIds: [...selectedIds], archived_at: new Date().toISOString(), pinned_at: null }, { onSuccess: exitSelectMode });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.ids.length === 1) {
      updateConversationState.mutate({ conversationId: deleteTarget.ids[0], hidden_at: new Date().toISOString() });
    } else {
      bulkUpdateConversationState.mutate({ conversationIds: deleteTarget.ids, hidden_at: new Date().toISOString() });
    }
    setDeleteTarget(null);
    exitSelectMode();
  }

  function handleTogglePin(c: ConversationSummary) {
    togglePin.mutate(
      { conversationId: c.id, pin: !c.pinned_at },
      {
        onError: (err) => {
          if (err instanceof Error && err.message === "PIN_LIMIT_REACHED") toast(`You can only pin up to ${MAX_PINNED} chats — unpin one first.`);
        },
      }
    );
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !conversations) return conversations;
    return conversations.filter((c) => {
      const { name, username } = displayIdentity(c);
      return (
        name.toLowerCase().includes(q) ||
        username.toLowerCase().includes(q) ||
        (!!c.last_message && messagePlainText(c.last_message.content).toLowerCase().includes(q))
      );
    });
  }, [conversations, searchQuery]);

  const items = useMemo<Item[]>(() => {
    const pinned = filtered?.filter((c) => !!c.pinned_at) ?? [];
    const normal = filtered?.filter((c) => !c.pinned_at) ?? [];
    return [
      ...(pinned.length > 0 ? ([{ kind: "section", label: "Pinned" }, ...pinned.map((conversation) => ({ kind: "chat" as const, conversation }))] as Item[]) : []),
      ...normal.map((conversation) => ({ kind: "chat" as const, conversation })),
    ];
  }, [filtered]);

  if (!messagingEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader title="Messages" bar />
        <Text className="px-4 pt-10 text-center text-sm text-ink-muted">Messaging is temporarily unavailable. Check back later.</Text>
      </View>
    );
  }

  const header = selectMode ? (
    <View className="flex-row items-center gap-3 border-b border-border bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
      <Pressable onPress={exitSelectMode} accessibilityRole="button" accessibilityLabel="Cancel selection" hitSlop={10}>
        <Icon as={X} size={22} className="text-ink-muted" />
      </Pressable>
      <Text className="flex-1 text-sm font-medium text-ink">{selectedIds.size} selected</Text>
      <Pressable onPress={handleBulkArchive} disabled={!selectedIds.size} accessibilityRole="button" accessibilityLabel="Archive selected" hitSlop={10} className={!selectedIds.size ? "opacity-30" : ""}>
        <Icon as={Archive} size={19} className="text-ink-muted" />
      </Pressable>
      <Pressable
        onPress={() => setDeleteTarget({ ids: [...selectedIds], label: selectedIds.size > 1 ? `${selectedIds.size} chats` : "this chat" })}
        disabled={!selectedIds.size}
        accessibilityRole="button"
        accessibilityLabel="Delete selected"
        hitSlop={10}
        className={!selectedIds.size ? "opacity-30" : ""}
      >
        <Icon as={Trash2} size={19} className="text-danger" />
      </Pressable>
    </View>
  ) : (
    <View>
      <ScreenHeader
        title="Messages"
        bar
        right={
          conversations && conversations.length > 0 ? (
            <Pressable onPress={() => setSelectMode(true)} accessibilityRole="button" accessibilityLabel="Select chats" hitSlop={10}>
              <Icon as={CheckSquare} size={20} className="text-ink-muted" />
            </Pressable>
          ) : undefined
        }
      />
      {/* Archive sits at the top: manually archived chats plus requests from people who don't follow you. */}
      <Pressable
        onPress={() => router.push("/messages/archive")}
        accessibilityRole="button"
        className="flex-row items-center gap-3 border-b border-border/60 bg-canvas px-4 py-3 active:bg-surface/60"
      >
        <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={Archive} size={18} className="text-accent" />
        </View>
        <Text className="flex-1 text-sm font-medium text-ink">Archive</Text>
        {archiveBadgeCount > 0 ? (
          <View className="h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5">
            <Text className="text-[11px] font-semibold text-canvas">{archiveBadgeCount > 99 ? "99+" : archiveBadgeCount}</Text>
          </View>
        ) : null}
        <Icon as={ChevronRight} size={16} className="shrink-0 text-ink-muted" />
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-canvas">
      {header}

      {!selectMode && conversations && conversations.length > 0 ? (
        <View className="px-4 pt-3">
          <View className="flex-row items-center rounded-full border border-border bg-surface px-3.5">
            <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages…"
              placeholderTextColor={colors.inkMuted}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
              style={{ fontFamily: "Inter_400Regular" }}
            />
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
                <Icon as={X} size={16} className="text-ink-muted" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : !conversations || conversations.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">No conversations yet. Message someone from their profile.</Text>
      ) : filtered && filtered.length === 0 ? (
        <Text className="py-10 text-center text-sm text-ink-muted">No conversations match your search.</Text>
      ) : (
        <FlashList
          data={items}
          keyExtractor={(i) => (i.kind === "section" ? `section-${i.label}` : i.conversation.id)}
          getItemType={(i) => i.kind}
          extraData={{ selectMode, selectedIds, unseenPosts }}
          onScroll={chromeScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
          renderItem={({ item }) =>
            item.kind === "section" ? (
              <Text className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{item.label}</Text>
            ) : (
              <ConversationRow
                conversation={item.conversation}
                currentUserId={user?.id}
                unseenPostId={item.conversation.is_group ? undefined : unseenPosts?.[item.conversation.other_participant.id]}
                selectMode={selectMode}
                selected={selectedIds.has(item.conversation.id)}
                onOpen={() => router.push(`/messages/${item.conversation.id}` as Href)}
                onLongPress={() => setActionTarget(item.conversation)}
                onToggleSelect={() => toggleSelected(item.conversation.id)}
                onAvatarPress={() => {
                  const id = displayIdentity(item.conversation);
                  if (id.avatarUrl) setPreviewAvatar(id.avatarUrl);
                  else router.push(`/messages/${item.conversation.id}` as Href);
                }}
                onUnseenPostPress={(postId) => router.push(`/post/${postId}` as Href)}
              />
            )
          }
        />
      )}

      {actionTarget ? (
        <ConversationActionSheet
          displayName={displayIdentity(actionTarget).name}
          isPinned={!!actionTarget.pinned_at}
          onTogglePin={() => handleTogglePin(actionTarget)}
          onArchive={() => updateConversationState.mutate({ conversationId: actionTarget.id, archived_at: new Date().toISOString(), pinned_at: null })}
          onDelete={() => setDeleteTarget({ ids: [actionTarget.id], label: "this chat" })}
          onSelect={() => enterSelectMode(actionTarget.id)}
          onClose={() => setActionTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete ${deleteTarget.label}?`}
          description="This removes it from your inbox. The other participant keeps their copy, and you can't undo this."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {previewAvatar ? <MediaViewer mediaUrls={[previewAvatar]} startIndex={0} onClose={() => setPreviewAvatar(null)} /> : null}
    </View>
  );
}
