// src/screens/Archive.tsx
// Everything you've tucked away: message requests (always on top), then
// accordion sections for archived posts, projects and chats.
import { Repeat2, ArchiveRestore, CheckSquare, ChevronDown, Trash2, X } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { ProjectMiniCard } from "@/components/post/ProjectMiniCard";
import { ArchivedPostModal } from "@/components/post/ArchivedPostModal";
import { listAgo } from "@/components/messages/ConversationRow";
import { Avatar } from "@/components/ui/Avatar";
import { Collapsible } from "@/components/ui/Collapsible";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Sheet } from "@/components/ui/Sheet";
import { SheetCancel, SheetCaption, SheetRow } from "@/components/ui/SheetParts";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import {
  useArchivedConversations,
  useBulkUpdateConversationState,
  useMarkArchiveSeen,
  useUpdateConversationState,
  type ArchivedConversationSummary,
} from "@/hooks/useMessaging";
import { useUserPostsWithArchived } from "@/hooks/usePosts";
import { useUserProjects } from "@/hooks/useProjects";
import { haptics } from "@/lib/haptics";
import { MessagePreviewLine } from "@/components/messages/MessagePreviewLine";
import { isPlainReshare, isQuote, type PostWithAuthor } from "@/types/database";

type Section = "posts" | "projects" | "messages";

function Chevron({ open }: { open: boolean }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 300 }) }] }));
  return (
    <Animated.View style={style}>
      <Icon as={ChevronDown} size={18} className="text-ink-muted" />
    </Animated.View>
  );
}

function SectionHeader({ label, count, isOpen, onToggle }: { label: string; count: number; isOpen: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} className="flex-row items-center justify-between py-4">
      <Text className="font-display text-base text-ink">
        {label} <Text className="font-body text-sm text-ink-muted">({count})</Text>
      </Text>
      <Chevron open={isOpen} />
    </Pressable>
  );
}

export function Archive() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();

  const { data: archived, isLoading } = useArchivedConversations();
  const markSeen = useMarkArchiveSeen();
  const updateConversationState = useUpdateConversationState();
  const bulkUpdateConversationState = useBulkUpdateConversationState();

  const requests = archived?.filter((c) => c.is_request) ?? [];
  const archivedMessages = archived?.filter((c) => !c.is_request) ?? [];

  const { data: allPosts } = useUserPostsWithArchived(user?.id ?? "", true, { includePagePosts: true });
  const archivedPosts = allPosts?.filter((p) => p.is_archived) ?? [];
  const { data: allProjects } = useUserProjects(user?.id ?? "", true, { includePageProjects: true });
  const archivedProjects = allProjects?.filter((p) => p.status === "archived") ?? [];

  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [previewPost, setPreviewPost] = useState<PostWithAuthor | null>(null);
  const [actionTarget, setActionTarget] = useState<ArchivedConversationSummary | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  // Restoring/deleting the previewed post removes it from the list — close its preview.
  useEffect(() => {
    if (previewPost && !archivedPosts.some((p) => p.id === previewPost.id)) setPreviewPost(null);
  }, [archivedPosts, previewPost]);

  // Opening the Archive clears its badge.
  useEffect(() => {
    markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.ids.length === 1) updateConversationState.mutate({ conversationId: deleteTarget.ids[0], hidden_at: new Date().toISOString() });
    else bulkUpdateConversationState.mutate({ conversationIds: deleteTarget.ids, hidden_at: new Date().toISOString() });
    setDeleteTarget(null);
    exitSelectMode();
  }

  function renderConversationRow(c: ArchivedConversationSummary) {
    const isSelected = selectedIds.has(c.id);
    return (
      <Pressable
        key={c.id}
        onPress={() => (selectMode ? toggleSelected(c.id) : router.push(`/messages/${c.id}` as Href))}
        onLongPress={
          selectMode
            ? undefined
            : () => {
                haptics.light();
                setActionTarget(c);
              }
        }
        delayLongPress={450}
        accessibilityRole="link"
        className="flex-row items-center gap-3 border-b border-border py-3.5 active:bg-surface/60"
      >
        {selectMode ? (
          <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-accent bg-accent" : "border-border"}`}>
            {isSelected ? <View className="h-2 w-2 rounded-full bg-canvas" /> : null}
          </View>
        ) : null}

        <Avatar src={c.other_participant.avatar_url} name={c.other_participant.display_name} />

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between">
            <Text numberOfLines={1} className={`shrink text-sm ${c.unreadCount > 0 ? "font-semibold text-ink" : "font-medium text-ink"}`}>
              {c.other_participant.display_name}
            </Text>
            <Text className="ml-2 shrink-0 text-xs text-ink-muted">{listAgo(c.last_message_at)}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            {c.is_request ? (
              <View className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5">
                <Text className="text-[11px] font-medium text-accent">Request</Text>
              </View>
            ) : null}
            <View className="min-w-0 flex-1">
              <MessagePreviewLine
                variant="list"
                content={c.last_message?.is_deleted ? "This message was deleted" : (c.last_message?.content ?? "Say hello")}
                className={`text-sm ${c.unreadCount > 0 ? "text-ink" : "text-ink-muted"} ${c.last_message?.is_deleted ? "italic opacity-70" : ""}`}
                iconClassName={c.unreadCount > 0 ? "text-ink" : "text-ink-muted"}
              />
            </View>
          </View>
        </View>

        {c.unreadCount > 0 ? (
          <View className="h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5">
            <Text className="text-xs font-semibold text-canvas">{c.unreadCount > 99 ? "99+" : c.unreadCount}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const nothingArchived = !isLoading && requests.length === 0 && archivedPosts.length === 0 && archivedProjects.length === 0 && archivedMessages.length === 0;

  const header = selectMode ? (
    <View className="flex-row items-center gap-3 border-b border-border bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
      <Pressable onPress={exitSelectMode} accessibilityRole="button" accessibilityLabel="Cancel selection" hitSlop={10}>
        <Icon as={X} size={22} className="text-ink-muted" />
      </Pressable>
      <Text className="flex-1 text-sm font-medium text-ink">{selectedIds.size} selected</Text>
      <Pressable
        onPress={() => bulkUpdateConversationState.mutate({ conversationIds: [...selectedIds], archived_at: null }, { onSuccess: exitSelectMode })}
        disabled={!selectedIds.size}
        accessibilityRole="button"
        accessibilityLabel="Unarchive selected"
        hitSlop={10}
        className={!selectedIds.size ? "opacity-30" : ""}
      >
        <Icon as={ArchiveRestore} size={19} className="text-ink-muted" />
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
    <ScreenHeader
      title="Archive"
      bar
      right={
        requests.length > 0 || archivedMessages.length > 0 ? (
          <Pressable onPress={() => setSelectMode(true)} accessibilityRole="button" accessibilityLabel="Select chats" hitSlop={10}>
            <Icon as={CheckSquare} size={20} className="text-ink-muted" />
          </Pressable>
        ) : undefined
      }
    />
  );

  return (
    <View className="flex-1 bg-canvas">
      {header}

      <ScrollView onScroll={onScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}>
        <View className="w-full max-w-xl self-center">
          {isLoading ? (
            <Text className="py-10 text-center text-ink-muted">Loading…</Text>
          ) : nothingArchived ? (
            <Text className="py-16 text-center text-sm text-ink-muted">Nothing archived right now.</Text>
          ) : (
            <>
              {/* New message requests are pending, so they stay visible rather than collapsed. */}
              {requests.length > 0 && !selectMode ? (
                <Text className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">New message requests</Text>
              ) : null}
              {requests.map(renderConversationRow)}

              {archivedPosts.length > 0 ? (
                <View className="border-b border-border">
                  <SectionHeader label="Archived posts" count={archivedPosts.length} isOpen={openSection === "posts"} onToggle={() => setOpenSection((c) => (c === "posts" ? null : "posts"))} />
                  <Collapsible open={openSection === "posts"}>
                    <View className="pb-2">
                      {archivedPosts.map((post, i) => {
                        const isRepost = isPlainReshare(post) || isQuote(post);
                        const title = post.heading || post.content || post.reshared_post?.heading || post.reshared_post?.content || "Untitled post";
                        return (
                          <Pressable
                            key={post.id}
                            onPress={() => setPreviewPost(post)}
                            accessibilityRole="button"
                            className={`flex-row items-start justify-between gap-3 py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}
                          >
                            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                              {isRepost ? <Icon as={Repeat2} size={13} className="shrink-0 text-ink-muted" /> : null}
                              <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
                                {title}
                              </Text>
                            </View>
                            <Text className="shrink-0 text-xs text-ink-muted">{listAgo(post.created_at)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Collapsible>
                </View>
              ) : null}

              {archivedProjects.length > 0 ? (
                <View className="border-b border-border">
                  <SectionHeader
                    label="Archived projects"
                    count={archivedProjects.length}
                    isOpen={openSection === "projects"}
                    onToggle={() => setOpenSection((c) => (c === "projects" ? null : "projects"))}
                  />
                  <Collapsible open={openSection === "projects"}>
                    <View className="flex-row flex-wrap gap-3 pb-3">
                      {archivedProjects.map((project) => (
                        <View key={project.id} style={{ width: "48%" }}>
                          <ProjectMiniCard project={project} showStatus />
                        </View>
                      ))}
                    </View>
                  </Collapsible>
                </View>
              ) : null}

              {archivedMessages.length > 0 ? (
                <View>
                  <SectionHeader
                    label="Archived messages"
                    count={archivedMessages.length}
                    isOpen={openSection === "messages"}
                    onToggle={() => setOpenSection((c) => (c === "messages" ? null : "messages"))}
                  />
                  <Collapsible open={openSection === "messages"}>
                    <View>{archivedMessages.map(renderConversationRow)}</View>
                  </Collapsible>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {previewPost ? <ArchivedPostModal post={previewPost} onClose={() => setPreviewPost(null)} /> : null}

      {actionTarget ? (
        <Sheet onClose={() => setActionTarget(null)} accessibilityLabel="Chat actions">
          <SheetCaption>{actionTarget.other_participant.display_name}</SheetCaption>
          <SheetRow
            label="Unarchive"
            icon={<Icon as={ArchiveRestore} size={18} className="text-ink" />}
            onPress={() => updateConversationState.mutate({ conversationId: actionTarget.id, archived_at: null })}
          />
          <SheetRow
            label="Select chats"
            icon={<Icon as={CheckSquare} size={18} className="text-ink" />}
            onPress={() => {
              setSelectMode(true);
              setSelectedIds(new Set([actionTarget.id]));
            }}
          />
          <SheetRow label="Delete chat" danger icon={<Icon as={Trash2} size={18} className="text-danger" />} onPress={() => setDeleteTarget({ ids: [actionTarget.id], label: "this chat" })} />
          <SheetCancel />
        </Sheet>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete ${deleteTarget.label}?`}
          description="This removes it from your Archive. The other participant keeps their copy, and you can't undo this."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </View>
  );
}
