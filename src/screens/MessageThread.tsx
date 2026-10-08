// src/screens/MessageThread.tsx
// A one-to-one (or team) chat. Virtualized list that starts at the bottom,
// pages in older messages as you scroll up, and follows new ones; day
// separators; swipe-to-reply; long-press menu with reactions; search with
// next/previous; multi-select (star / hide / forward / share / delete); voice
// notes; emoji panel that stands in for the keyboard.
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Forward,
  Camera,
  Inbox,
  Keyboard as KeyboardIcon,
  Mic,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  Share2,
  Smile,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Share, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { AttachSheet } from "@/components/messages/AttachSheet";
import { DeleteMessageSheet } from "@/components/messages/DeleteMessageSheet";
import { EmojiPickerSheet, removeLastGrapheme } from "@/components/messages/EmojiPickerSheet";
import { ForwardMessageSheet } from "@/components/messages/ForwardMessageSheet";
import { MediaComposeModal } from "@/components/messages/MediaComposeModal";
import { MessageActionMenu } from "@/components/messages/MessageActionMenu";
import { MessageBubble } from "@/components/messages/MessageBubble";
import { MessagePreviewLine } from "@/components/messages/MessagePreviewLine";
import { ReactionOptionsPopover, type ReactionPopoverTarget, type Rect } from "@/components/messages/ReactionOptionsPopover";
import { VoicePreviewBar } from "@/components/messages/VoicePreviewBar";
import { VoiceRecordingBar } from "@/components/messages/VoiceRecordingBar";
import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { Icon } from "@/components/ui/styled";
import { PresenceDot } from "@/components/ui/PresenceDot";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { Wallpaper } from "@/components/ui/Wallpaper";
import { useAuth } from "@/hooks/useAuth";
import { useBackDismiss } from "@/hooks/useBackDismiss";
import { useFeatureFlag } from "@/hooks/useFeatureFlags";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import {
  useBulkDeleteMessages,
  useDeleteMessage,
  useMarkConversationRead,
  useMarkMessagesRead,
  useMessages,
  useMyParticipantState,
  useSendMessage,
  useSendVoiceNote,
  type DeleteScope,
  type MessageWithSender,
} from "@/hooks/useMessaging";
import {
  useBulkSetMessagesHidden,
  useConversationReactions,
  useMarkVoiceNoteOpened,
  useMessageUserStates,
  type MessageReaction,
  useRemoveReaction,
  useSetReaction,
  useToggleMessageState,
  useTrackEmojiUsage,
  useUserTopEmojis,
} from "@/hooks/useMessageReactions";
import { useUnseenPosts } from "@/hooks/useUnseenPosts";
import { useSendMedia } from "@/hooks/useSendMedia";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { MAX_MEDIA_BYTES, messagePlainText, messagePreview, type MediaKind } from "@/lib/chatMedia";
import { haptics } from "@/lib/haptics";
import type { LocalFile } from "@/lib/localFile";
import { dayKeyFor, formatMessageDayLabel } from "@/lib/messageTime";
import { pickDocument, pickGalleryImages, takePhoto } from "@/lib/pickChatMedia";
import { formatLastSeen } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";

function useConversationHeader(conversationId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["conversation-header", conversationId, user?.id],
    queryFn: async () => {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("is_group, team_page:pages!conversations_team_page_id_fkey(id, username, name, avatar_url, page_type, is_verified)")
        .eq("id", conversationId)
        .single();
      if (convError) throw convError;

      if (conv.is_group) {
        return {
          is_group: true as const,
          team_page: (conv as any).team_page as { id: string; username: string; name: string; avatar_url: string | null; page_type: "organization" | "brand"; is_verified: boolean } | null,
          other_participant: undefined,
        };
      }

      const { data, error } = await supabase
        .from("conversation_participants")
        .select("profile:profiles!conversation_participants_user_id_fkey(id, username, display_name, avatar_url, last_seen_at, is_verified)")
        .eq("conversation_id", conversationId)
        .neq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;

      return {
        is_group: false as const,
        team_page: null,
        other_participant: data?.profile as { id: string; username: string; display_name: string; avatar_url: string | null; last_seen_at: string | null; is_verified: boolean } | undefined,
      };
    },
    enabled: !!conversationId && !!user,
    refetchInterval: 30_000, // keeps the presence dot from going stale on a long-open thread
  });
}

interface DeleteTarget {
  messageIds: string[];
  allowEveryone: boolean;
}
type EmojiPickerTarget = { mode: "input" } | { mode: "reaction"; messageId: string } | null;
interface ActiveMessage {
  message: MessageWithSender;
  anchorRect: Rect;
}
const EMPTY_REACTIONS: MessageReaction[] = []; // one shared array, so bubbles with no reactions keep memo() hits
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 20 };

type ThreadItem = { key: string; message: MessageWithSender; showDaySeparator: boolean; dayLabel: string };

export function MessageThread() {
  const { conversationId, draftMessage } = useLocalSearchParams<{ conversationId: string; draftMessage?: string }>();
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true });
  const { lastKnownHeight } = useKeyboardInset();
  const listRef = useRef<FlashListRef<ThreadItem>>(null);
  const inputRef = useRef<TextInput>(null);

  const { data: messages, isLoading, hasMore, loadOlder, isLoadingOlder } = useMessages(conversationId);
  const { data: header } = useConversationHeader(conversationId);
  const otherParticipant = header?.other_participant;
  const teamPage = header?.team_page;
  const { data: myParticipantState } = useMyParticipantState(conversationId);
  const messagingEnabled = useFeatureFlag("messaging_enabled");
  const { data: unseenPosts } = useUnseenPosts(otherParticipant ? [otherParticipant.id] : []);
  const unseenPostId = otherParticipant ? unseenPosts?.[otherParticipant.id] : undefined;

  const sendMessage = useSendMessage(conversationId);
  const sendVoiceNote = useSendVoiceNote(conversationId);
  const sendMedia = useSendMedia(conversationId);
  const deleteMessage = useDeleteMessage(conversationId);
  const bulkDeleteMessages = useBulkDeleteMessages(conversationId);
  const bulkSetHidden = useBulkSetMessagesHidden(conversationId);
  const markConversationRead = useMarkConversationRead(conversationId);

  const messageIds = useMemo(() => messages?.map((m) => m.id) ?? [], [messages]);
  const { data: reactionsByMessage } = useConversationReactions(conversationId, messageIds);
  const { data: userStates } = useMessageUserStates(conversationId, messageIds);
  const setReaction = useSetReaction(conversationId);
  const removeReaction = useRemoveReaction(conversationId);
  const toggleStar = useToggleMessageState(conversationId, "starred_at");
  const togglePin = useToggleMessageState(conversationId, "pinned_at");
  const toggleHidden = useToggleMessageState(conversationId, "hidden_at");
  const markVoiceNoteOpened = useMarkVoiceNoteOpened(conversationId);
  const topEmojis = useUserTopEmojis();
  const trackEmojiUsage = useTrackEmojiUsage();

  const onMutationError = useCallback(() => toast("Something went wrong. Please try again.", { variant: "error" }), [toast]);

  useMarkMessagesRead(conversationId, messages);
  useEffect(() => {
    markConversationRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const visibleMessages = useMemo(() => {
    if (!messages) return messages;
    return messages.filter((m) => {
      const state = userStates?.[m.id];
      return !state?.hidden_at && !state?.deleted_for_me_at;
    });
  }, [messages, userStates]);

  const items = useMemo<ThreadItem[]>(() => {
    if (!visibleMessages) return [];
    let lastDayKey: string | null = null;
    return visibleMessages.map((m) => {
      const dayKey = dayKeyFor(m.created_at);
      const showDaySeparator = dayKey !== lastDayKey;
      lastDayKey = dayKey;
      return { key: m.client_key ?? m.id, message: m, showDaySeparator, dayLabel: formatMessageDayLabel(m.created_at) };
    });
  }, [visibleMessages]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, i) => map.set(item.message.id, i));
    return map;
  }, [items]);

  // Messages that arrive after the first load animate in; the initial batch doesn't.
  const hasLoadedRef = useRef(false);
  const seenKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    hasLoadedRef.current = false;
    seenKeysRef.current = new Set();
  }, [conversationId]);
  useEffect(() => {
    if (!visibleMessages) return;
    for (const m of visibleMessages) seenKeysRef.current.add(m.client_key ?? m.id);
    hasLoadedRef.current = true;
  }, [visibleMessages]);

  // ── composer ──
  const [content, setContent] = useState(draftMessage ?? "");
  const [replyTarget, setReplyTarget] = useState<MessageWithSender | null>(null);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<EmojiPickerTarget>(null);
  const [inputHeight, setInputHeight] = useState(0);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [mediaDraft, setMediaDraft] = useState<{ kind: MediaKind; files: LocalFile[] } | null>(null);
  useBackDismiss(() => setAttachOpen(false), attachOpen);
  useBackDismiss(() => setEmojiPickerTarget(null), emojiPickerTarget?.mode === "input");

  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashHighlight = useCallback((id: string) => {
    setFlashMessageId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashMessageId(null), 700);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    []
  );

  const startReply = useCallback(
    (m: MessageWithSender) => {
      setReplyTarget(m);
      flashHighlight(m.id);
      setEmojiPickerTarget((prev) => (prev?.mode === "input" ? null : prev));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [flashHighlight]
  );

  const scrollToMessage = useCallback(
    (id: string, flash = true) => {
      const index = indexById.get(id);
      if (index == null) return; // not currently loaded (an older page that hasn't been fetched)
      void listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      if (flash) flashHighlight(id);
    },
    [indexById, flashHighlight]
  );

  async function handleSend() {
    if (!content.trim()) return;
    const text = content;
    const replyingTo = replyTarget;
    setContent("");
    setReplyTarget(null);
    try {
      await sendMessage.mutateAsync({
        content: text,
        replyToMessageId: replyingTo?.id ?? null,
        replyToSnippet: replyingTo ? { id: replyingTo.id, content: replyingTo.content, sender_id: replyingTo.sender_id, is_deleted: replyingTo.is_deleted } : null,
      });
    } catch {
      setContent(text); // restore on failure so nothing typed is lost
      setReplyTarget(replyingTo);
      toast("Couldn't send that message. Please try again.", { variant: "error" });
    }
  }

  const voiceRecorder = useVoiceRecorder(
    async (file, durationSec, peaks, viewOnce, localUrl) => {
      const replyingTo = replyTarget;
      try {
        await sendVoiceNote.mutateAsync({
          file,
          durationSec,
          peaks,
          viewOnce,
          replyToMessageId: replyingTo?.id ?? null,
          replyToSnippet: replyingTo ? { id: replyingTo.id, content: replyingTo.content, sender_id: replyingTo.sender_id, is_deleted: replyingTo.is_deleted } : null,
          localUrl,
        });
        setReplyTarget(null);
      } catch {
        toast("Couldn't send the voice message. Please try again.", { variant: "error" });
        throw new Error("send failed"); // keeps the hook from clearing a clip it couldn't send
      }
    },
    // WhatsApp: release to send; slide up to lock for hands-free + draft preview.
    { sendOnRelease: true, onTooShort: () => toast("Hold to record, release to send") }
  );

  // ── attach: gallery · camera · document → preview with caption → send ──
  async function openPicker(which: "gallery" | "camera" | "document") {
    try {
      const files = which === "gallery" ? await pickGalleryImages() : which === "camera" ? await takePhoto() : await pickDocument();
      if (!files.length) return;
      if (files.some((f) => f.size > MAX_MEDIA_BYTES)) {
        toast("That file is larger than 25 MB.", { variant: "error" });
        return;
      }
      setMediaDraft({ kind: which === "document" ? "document" : "image", files });
    } catch (e) {
      toast(e instanceof Error && e.message === "camera_denied" ? "Allow camera access in Settings to take photos." : "Couldn't open that. Please try again.", { variant: "error" });
    }
  }

  function handleSendMedia(files: LocalFile[], caption: string, hd: boolean) {
    const draft = mediaDraft;
    if (!draft) return;
    const replyingTo = replyTarget;
    setMediaDraft(null);
    setReplyTarget(null);
    sendMedia.mutate(
      {
        kind: draft.kind,
        files,
        caption,
        hd,
        replyToMessageId: replyingTo?.id ?? null,
        replyToSnippet: replyingTo ? { id: replyingTo.id, content: replyingTo.content, sender_id: replyingTo.sender_id, is_deleted: replyingTo.is_deleted } : null,
      },
      {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "";
          toast(
            msg === "too_large"
              ? "That file is larger than 25 MB."
              : /bucket not found/i.test(msg)
                ? "Photo and file sharing isn't set up on the server yet."
                : "Couldn't send that. Please try again.",
            { variant: "error" }
          );
        },
      }
    );
  }

  // Hold the mic to record. The button stays mounted throughout (the recording UI is an
  // overlay on top), because unmounting the touched element mid-hold would end the gesture.
  const { onHoldStart, onHoldMove, onHoldEnd, onHoldCancel } = voiceRecorder.micGesture;
  const micGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .onBegin(() => scheduleOnRN(onHoldStart))
        .onUpdate((e) => scheduleOnRN(onHoldMove, e.translationX, e.translationY))
        .onEnd((_e, success) => scheduleOnRN(success ? onHoldEnd : onHoldCancel))
        .onFinalize((_e, success) => {
          if (!success) scheduleOnRN(onHoldCancel);
        }),
    [onHoldStart, onHoldMove, onHoldEnd, onHoldCancel]
  );

  // ── selection ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [forwardMessages, setForwardMessages] = useState<{ content: string }[] | null>(null);
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  useBackDismiss(exitSelectMode, selectMode);

  const selectedMessages = useMemo(() => visibleMessages?.filter((m) => selectedIds.has(m.id)) ?? [], [visibleMessages, selectedIds]);
  const selectionAllowsDeleteEveryone = selectedMessages.length > 0 && selectedMessages.every((m) => m.sender_id === user?.id && !m.is_deleted);
  const selectionHasForwardableContent = selectedMessages.some((m) => !m.is_deleted);

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

  async function shareText(text: string) {
    if (!text) return;
    try {
      await Share.share({ message: text });
    } catch {
      /* dismissed */
    }
  }

  function handleDeleteConfirm(scope: DeleteScope) {
    if (!deleteTarget) return;
    if (deleteTarget.messageIds.length === 1) deleteMessage.mutate({ messageId: deleteTarget.messageIds[0], scope }, { onError: onMutationError });
    else bulkDeleteMessages.mutate({ messageIds: deleteTarget.messageIds, scope }, { onError: onMutationError });
    setDeleteTarget(null);
    exitSelectMode();
  }

  // ── search ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !visibleMessages) return [];
    return visibleMessages.filter((m) => !m.is_deleted && messagePlainText(m.content).toLowerCase().includes(q));
  }, [visibleMessages, searchQuery]);
  useEffect(() => setMatchIndex(0), [searchQuery]);
  useEffect(() => {
    if (matches.length) scrollToMessage(matches[matchIndex].id, false);
  }, [matchIndex, matches, scrollToMessage]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setMatchIndex(0);
  }, []);
  useBackDismiss(closeSearch, searchOpen);
  const currentMatchId = matches[matchIndex]?.id;

  // ── message menu / reactions ──
  const [activeMessage, setActiveMessage] = useState<ActiveMessage | null>(null);
  const [reactionPopover, setReactionPopover] = useState<ReactionPopoverTarget | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<View>(null);

  const activeReactions = activeMessage ? reactionsByMessage?.[activeMessage.message.id] ?? [] : [];
  const activeMyReaction = activeMessage ? activeReactions.find((r) => r.user_id === user?.id)?.emoji ?? null : null;
  const activeState = activeMessage ? userStates?.[activeMessage.message.id] : undefined;

  // ── scroll behaviour ──
  const isNearBottomRef = useRef(true);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  const lastSeenLastMessageIdRef = useRef<string | null>(null);
  const [stickyDayLabel, setStickyDayLabel] = useState<string | null>(null);
  const [stickyDayVisible, setStickyDayVisible] = useState(false);
  const stickyDayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (stickyDayHideTimer.current) clearTimeout(stickyDayHideTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!visibleMessages?.length) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (lastSeenLastMessageIdRef.current == null) {
      lastSeenLastMessageIdRef.current = last.id;
      return;
    }
    if (last.id === lastSeenLastMessageIdRef.current) return; // a reaction/read-state update, nothing appended
    lastSeenLastMessageIdRef.current = last.id;
    if (last.sender_id === user?.id) {
      listRef.current?.scrollToEnd({ animated: true });
      setShowNewMessagePill(false);
    } else if (!isNearBottomRef.current) {
      setShowNewMessagePill(true);
    }
  }, [visibleMessages, user?.id]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    isNearBottomRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 150;
    if (isNearBottomRef.current) setShowNewMessagePill(false);
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item: ThreadItem }[] }) => {
    const top = viewableItems[0]?.item;
    if (!top) return;
    setStickyDayLabel(top.dayLabel);
    setStickyDayVisible(true);
    if (stickyDayHideTimer.current) clearTimeout(stickyDayHideTimer.current);
    stickyDayHideTimer.current = setTimeout(() => setStickyDayVisible(false), 1200);
  }, []);

  // Stable callbacks for the bubbles. They read the latest state through a ref, so their identity never
  // changes — which is what lets memo(MessageBubble) skip re-rendering every row on each keystroke/scroll.
  const latest = useRef({ selectMode, toggleSelected, setReaction: setReaction.mutate, markOpened: markVoiceNoteOpened.mutate, onMutationError });
  latest.current = { selectMode, toggleSelected, setReaction: setReaction.mutate, markOpened: markVoiceNoteOpened.mutate, onMutationError };
  const onRowPress = useCallback((id: string) => {
    if (latest.current.selectMode) latest.current.toggleSelected(id);
  }, []);
  const onBubbleLongPress = useCallback((message: MessageWithSender, rect: Rect) => setActiveMessage({ message, anchorRect: rect }), []);
  const onAddReaction = useCallback(
    (messageId: string, emoji: string) => latest.current.setReaction({ messageId, emoji }, { onError: latest.current.onMutationError }),
    []
  );
  const onRequestManageReaction = useCallback((messageId: string, anchorRect: Rect, emoji: string) => setReactionPopover({ messageId, anchorRect, emoji }), []);
  const onVoiceNoteOpened = useCallback((id: string) => latest.current.markOpened(id), []);
  const listExtraData = useMemo(
    () => ({ selectMode, selectedIds, currentMatchId, flashMessageId, searchQuery, reactionsByMessage, userStates }),
    [selectMode, selectedIds, currentMatchId, flashMessageId, searchQuery, reactionsByMessage, userStates]
  );
  // FlashList recycles cells by type; mixing photos/voice/text in one pool makes rows re-layout while scrolling.
  const getItemType = useCallback((item: ThreadItem) => {
    const m = item.message;
    const kind = m.is_deleted ? "deleted" : m.content.startsWith("ako-media:") ? "media" : m.content.startsWith("ako-voice-note:") ? "voice" : "text";
    return item.showDaySeparator ? `${kind}-day` : kind;
  }, []);

  // Keep the keyboard from covering the composer; drop the safe-area padding while it's up.
  const rootStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const composerSafeStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value > 0 ? 0 : insets.bottom }));

  if (!messagingEnabled) {
    return (
      <View className="flex-1 bg-canvas">
        <View className="flex-row items-center gap-3 border-b border-border px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
          <Pressable onPress={() => router.replace("/messages")} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
          </Pressable>
          <Text className="font-display text-lg text-ink">Messages</Text>
        </View>
        <Text className="px-4 pt-10 text-center text-sm text-ink-muted">Messaging is temporarily unavailable. Check back later.</Text>
      </View>
    );
  }

  const headerIconBtn = "shrink-0";

  const headerContent = selectMode ? (
    <>
      <Pressable onPress={exitSelectMode} accessibilityRole="button" accessibilityLabel="Cancel selection" className={headerIconBtn}>
        <Icon as={X} size={22} className="text-ink-muted" />
      </Pressable>
      <Text className="flex-1 text-sm font-medium text-ink">{selectedIds.size} selected</Text>
      <Pressable
        onPress={() => {
          for (const id of selectedIds) toggleStar.mutate({ messageId: id, active: true }, { onError: onMutationError });
          exitSelectMode();
        }}
        disabled={!selectedIds.size}
        accessibilityLabel="Star"
        className={`${headerIconBtn} ${!selectedIds.size ? "opacity-30" : ""}`}
      >
        <Icon as={Star} size={19} className="text-ink-muted" />
      </Pressable>
      <Pressable
        onPress={() => bulkSetHidden.mutate([...selectedIds], { onSuccess: exitSelectMode, onError: onMutationError })}
        disabled={!selectedIds.size}
        accessibilityLabel="Hide for me"
        className={`${headerIconBtn} ${!selectedIds.size ? "opacity-30" : ""}`}
      >
        <Icon as={EyeOff} size={19} className="text-ink-muted" />
      </Pressable>
      <Pressable
        onPress={() => {
          const forwardContent = selectedMessages.filter((m) => !m.is_deleted).map((m) => ({ content: m.content }));
          if (forwardContent.length) setForwardMessages(forwardContent);
        }}
        disabled={!selectionHasForwardableContent}
        accessibilityLabel="Forward"
        className={`${headerIconBtn} ${!selectionHasForwardableContent ? "opacity-30" : ""}`}
      >
        <Icon as={Forward} size={19} className="text-ink-muted" />
      </Pressable>
      <Pressable
        onPress={() =>
          void shareText(
            selectedMessages
              .filter((m) => !m.is_deleted)
              .map((m) => messagePlainText(m.content) || messagePreview(m.content).label)
              .filter(Boolean)
              .join("\n")
          )
        }
        disabled={!selectionHasForwardableContent}
        accessibilityLabel="Share outside app"
        className={`${headerIconBtn} ${!selectionHasForwardableContent ? "opacity-30" : ""}`}
      >
        <Icon as={Share2} size={19} className="text-ink-muted" />
      </Pressable>
      <Pressable
        onPress={() => setDeleteTarget({ messageIds: [...selectedIds], allowEveryone: selectionAllowsDeleteEveryone })}
        disabled={!selectedIds.size}
        accessibilityLabel="Delete"
        className={`${headerIconBtn} ${!selectedIds.size ? "opacity-30" : ""}`}
      >
        <Icon as={Trash2} size={19} className="text-danger" />
      </Pressable>
    </>
  ) : searchOpen ? (
    <>
      <Pressable onPress={closeSearch} accessibilityRole="button" accessibilityLabel="Close search" className={headerIconBtn}>
        <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
      </Pressable>
      <TextInput
        autoFocus
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search in conversation…"
        placeholderTextColor={colors.inkMuted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        returnKeyType="search"
        className="min-w-0 flex-1 text-sm text-ink"
        style={{ fontFamily: "Inter_400Regular" }}
      />
      {searchQuery ? (
        <>
          <Text className="shrink-0 text-xs text-ink-muted">{matches.length ? `${matchIndex + 1}/${matches.length}` : "0/0"}</Text>
          <Pressable
            onPress={() => matches.length && setMatchIndex((i) => (i - 1 + matches.length) % matches.length)}
            disabled={!matches.length}
            accessibilityLabel="Previous match"
            className={`${headerIconBtn} ${!matches.length ? "opacity-30" : ""}`}
          >
            <Icon as={ChevronUp} size={18} className="text-ink-muted" />
          </Pressable>
          <Pressable
            onPress={() => matches.length && setMatchIndex((i) => (i + 1) % matches.length)}
            disabled={!matches.length}
            accessibilityLabel="Next match"
            className={`${headerIconBtn} ${!matches.length ? "opacity-30" : ""}`}
          >
            <Icon as={ChevronDown} size={18} className="text-ink-muted" />
          </Pressable>
        </>
      ) : null}
    </>
  ) : (
    <>
      <Pressable onPress={() => router.replace("/messages")} accessibilityRole="button" accessibilityLabel="Back" className={headerIconBtn}>
        <Icon as={ArrowLeft} size={22} className="text-ink-muted" />
      </Pressable>

      {teamPage ? (
        <>
          <Pressable onPress={() => router.push(`/page/${teamPage.username}` as Href)} accessibilityLabel={`View ${teamPage.name}'s page`} className={headerIconBtn}>
            <Avatar src={teamPage.avatar_url} name={teamPage.name} size="sm" />
          </Pressable>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={1} className="shrink font-medium text-ink">
                {teamPage.name}
              </Text>
              {teamPage.is_verified ? <VerifiedBadge size={14} className="shrink-0" /> : null}
              <View className="shrink-0 flex-row items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-[1px]">
                <Icon as={Users} size={10} className="text-ink-muted" />
                <Text className="text-[10px] font-medium text-ink-muted">Group</Text>
              </View>
            </View>
            <Text className="text-xs text-ink-muted">Team chat</Text>
          </View>
        </>
      ) : null}

      {otherParticipant ? (
        <>
          {unseenPostId ? (
            <Pressable
              onPress={() => router.push(`/post/${unseenPostId}` as Href)}
              accessibilityLabel={`View ${otherParticipant.display_name}'s new post`}
              className="shrink-0 rounded-full bg-accent p-[2.5px]"
              style={{ shadowColor: "#3D5A45", shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3 }}
            >
              <View className="rounded-full bg-canvas p-[2px]">
                <Avatar src={otherParticipant.avatar_url} name={otherParticipant.display_name} size="sm" />
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push(`/profile/${otherParticipant.username}` as Href)} accessibilityLabel={`View ${otherParticipant.display_name}'s profile`} className={headerIconBtn}>
              <Avatar src={otherParticipant.avatar_url} name={otherParticipant.display_name} size="sm" />
            </Pressable>
          )}
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={1} className="shrink font-medium text-ink">
                {otherParticipant.display_name}
              </Text>
              {otherParticipant.is_verified ? <VerifiedBadge size={14} className="shrink-0" /> : null}
            </View>
            <View className="flex-row items-center gap-2">
              <PresenceDot lastSeenAt={otherParticipant.last_seen_at} size={12} />
              <Text className="text-xs text-ink-muted">{formatLastSeen(otherParticipant.last_seen_at)}</Text>
            </View>
          </View>
        </>
      ) : null}

      <View ref={headerMenuRef} collapsable={false}>
        <Pressable onPress={() => setHeaderMenuOpen(true)} accessibilityRole="button" accessibilityLabel="More options" className={headerIconBtn}>
          <Icon as={MoreHorizontal} size={20} className="text-ink-muted" />
        </Pressable>
      </View>
    </>
  );

  const phase = voiceRecorder.phase;
  const recordingOverlayActive = phase !== "idle";

  return (
    <Animated.View style={[{ flex: 1 }, rootStyle]} className="bg-canvas">
      <View className="z-30 flex-row items-center gap-3 border-b border-border bg-canvas px-4 pb-3" style={{ paddingTop: insets.top + 16 }}>
        {headerContent}
      </View>

      {myParticipantState?.is_request ? (
        <View className="flex-row items-center gap-2 border-b border-border bg-accent-soft/60 px-4 py-2.5">
          <Icon as={Inbox} size={15} className="shrink-0 text-accent" />
          <Text className="flex-1 text-sm text-ink-muted">Message request — reply to move this to your inbox.</Text>
        </View>
      ) : null}
      {infoBanner ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} className="border-b border-border bg-surface px-4 py-2">
          <Text className="text-center text-xs text-ink-muted">{infoBanner}</Text>
        </Animated.View>
      ) : null}

      <View className="relative min-h-0 flex-1 overflow-hidden">
        <Wallpaper />

        {/* Floating date badge while scrolling */}
        <View pointerEvents="none" className="absolute inset-x-0 top-2 z-20 items-center" style={{ opacity: stickyDayVisible && stickyDayLabel ? 1 : 0 }}>
          <View className="rounded-full border border-border bg-surface/95 px-3 py-1">
            <Text className="text-[11px] font-medium text-ink-muted">{stickyDayLabel}</Text>
          </View>
        </View>

        {isLoading ? (
          <Text className="py-10 text-center text-ink-muted">Loading…</Text>
        ) : !visibleMessages || visibleMessages.length === 0 ? (
          <Text className="py-10 text-center text-sm text-ink-muted">Say hello.</Text>
        ) : (
          <FlashList
            ref={listRef}
            data={items}
            keyExtractor={(i) => i.key}
            extraData={listExtraData}
            getItemType={getItemType}
            maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 0.2, startRenderingFromBottom: true, animateAutoScrollToBottom: true }}
            onStartReached={() => hasMore && !isLoadingOlder && loadOlder()}
            onStartReachedThreshold={0.3}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={VIEWABILITY_CONFIG}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            ListHeaderComponent={isLoadingOlder ? <Text className="py-2 text-center text-xs text-ink-muted">Loading earlier messages…</Text> : null}
            renderItem={({ item, index }) => {
              const m = item.message;
              const reactions = m.is_deleted ? EMPTY_REACTIONS : (reactionsByMessage?.[m.id] ?? EMPTY_REACTIONS);
              const myReaction = reactions.find((r) => r.user_id === user?.id)?.emoji ?? null;
              const animateIn = hasLoadedRef.current && !seenKeysRef.current.has(item.key);
              return (
                <View>
                  {item.showDaySeparator ? (
                    <View className={`items-center ${index === 0 ? "pb-2 pt-0" : "py-2"}`}>
                      <View className="rounded-full border border-border bg-surface/90 px-3 py-1">
                        <Text className="text-[11px] font-medium text-ink-muted">{item.dayLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                  <MessageBubble
                    message={m}
                    currentUserId={user?.id}
                    otherParticipantName={otherParticipant?.display_name ?? "Them"}
                    otherParticipantAvatarUrl={otherParticipant?.avatar_url}
                    myAvatarUrl={profile?.avatar_url}
                    myName="You"
                    voiceNoteOpenedAt={userStates?.[m.id]?.opened_once_at}
                    onVoiceNoteOpened={onVoiceNoteOpened}
                    reactions={reactions}
                    myReaction={myReaction}
                    isSelected={selectedIds.has(m.id)}
                    selectMode={selectMode}
                    isHighlighted={m.id === currentMatchId || m.id === flashMessageId}
                    searchQuery={searchQuery}
                    animateIn={animateIn}
                    onRowPress={onRowPress}
                    onLongPress={onBubbleLongPress}
                    onSwipeReply={startReply}
                    onScrollToMessage={scrollToMessage}
                    onAddReaction={onAddReaction}
                    onRequestManageReaction={onRequestManageReaction}
                  />
                </View>
              );
            }}
          />
        )}

        {showNewMessagePill ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} className="absolute inset-x-0 bottom-3 z-20 items-center" pointerEvents="box-none">
            <Pressable
              onPress={() => {
                listRef.current?.scrollToEnd({ animated: true });
                setShowNewMessagePill(false);
              }}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-full bg-accent px-3 py-1.5"
              style={{ elevation: 4 }}
            >
              <Text className="text-xs font-medium text-white">New messages</Text>
              <Icon as={ChevronDown} size={14} className="text-white" />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {myParticipantState?.left_at ? (
        <Animated.View style={composerSafeStyle} className="border-t border-border bg-canvas px-4 py-3">
          <Text className="text-center text-sm text-ink-muted">You're no longer part of this chat.</Text>
        </Animated.View>
      ) : (
        <Animated.View style={composerSafeStyle} className="relative border-t border-border bg-canvas">
          {replyTarget && phase === "idle" ? (
            <View className="flex-row items-start gap-2 px-4 pt-2.5">
              <View className="min-w-0 flex-1 border-l-2 border-accent py-0.5 pl-2">
                <Text className="text-xs font-medium text-accent">Replying to {replyTarget.sender_id === user?.id ? "yourself" : (otherParticipant?.display_name ?? "them")}</Text>
                <MessagePreviewLine content={replyTarget.content} className="text-xs text-ink-muted" />
              </View>
              <Pressable onPress={() => setReplyTarget(null)} accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={10} className="shrink-0 p-1">
                <Icon as={X} size={16} className="text-ink-muted" />
              </Pressable>
            </View>
          ) : null}

          {/* ALWAYS mounted — the mic button below is the touch target for the whole
              hold-to-record gesture, so it must never unmount mid-hold. */}
          <View className="flex-row items-end gap-2 px-3 py-2.5" pointerEvents={recordingOverlayActive ? "none" : "auto"} accessibilityElementsHidden={recordingOverlayActive}>
            {/* One rounded pill, like WhatsApp: emoji · message · attach · camera. */}
            <View className="min-w-0 flex-1 flex-row items-end rounded-3xl border border-border bg-surface pl-3 pr-1.5">
              <Pressable
                onPress={() => {
                  const switchingToKeyboard = emojiPickerTarget?.mode === "input";
                  setEmojiPickerTarget(switchingToKeyboard ? null : { mode: "input" });
                  if (switchingToKeyboard) requestAnimationFrame(() => inputRef.current?.focus());
                  else inputRef.current?.blur(); // stop the OS keyboard fighting our panel for space
                }}
                accessibilityRole="button"
                accessibilityLabel={emojiPickerTarget?.mode === "input" ? "Switch to keyboard" : "Add emoji"}
                hitSlop={6}
                className="shrink-0 pb-[11px] pr-2"
              >
                <Icon as={emojiPickerTarget?.mode === "input" ? KeyboardIcon : Smile} size={23} className="text-ink-muted" />
              </Pressable>

              <TextInput
                ref={inputRef}
                value={content}
                onChangeText={setContent}
                onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
                onFocus={() => setEmojiPickerTarget((prev) => (prev?.mode === "input" ? null : prev))}
                maxLength={2000}
                multiline
                placeholder="Message"
                placeholderTextColor={colors.inkMuted}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                textAlignVertical="center"
                className="min-w-0 flex-1 py-2.5 text-base text-ink"
                style={{ fontFamily: "Inter_400Regular", maxHeight: 120, height: Math.min(Math.max(inputHeight + 20, 42), 120) }}
              />

              <Pressable onPress={() => setAttachOpen(true)} accessibilityRole="button" accessibilityLabel="Attach" hitSlop={6} className="shrink-0 px-2 pb-[11px]">
                <Icon as={Paperclip} size={22} className="text-ink-muted" />
              </Pressable>
              {!content.trim() ? (
                <Pressable onPress={() => void openPicker("camera")} accessibilityRole="button" accessibilityLabel="Take a photo" hitSlop={6} className="shrink-0 px-2 pb-[11px]">
                  <Icon as={Camera} size={22} className="text-ink-muted" />
                </Pressable>
              ) : null}
            </View>

            {content.trim() ? (
              <Pressable
                onPress={() => void handleSend()}
                disabled={sendMessage.isPending}
                accessibilityRole="button"
                accessibilityLabel="Send"
                className={`h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent active:bg-accent-hover ${sendMessage.isPending ? "opacity-50" : ""}`}
              >
                <Icon as={Send} size={20} className="text-white" />
              </Pressable>
            ) : (
              <GestureDetector gesture={micGesture}>
                <View accessibilityRole="button" accessibilityLabel="Hold to record a voice message" className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent">
                  <Icon as={Mic} size={20} className="text-white" />
                </View>
              </GestureDetector>
            )}
          </View>

          {recordingOverlayActive ? (
            <View
              className="absolute inset-0 bg-canvas"
              // While merely HOLDING the mic the finger is on the button underneath, so the overlay must not
              // intercept; once locked or in preview its own buttons need touches.
              pointerEvents={phase === "preview" || voiceRecorder.locked ? "auto" : "none"}
            >
              {phase === "recording" ? (
                <VoiceRecordingBar
                  locked={voiceRecorder.locked}
                  paused={voiceRecorder.paused}
                  elapsedMs={voiceRecorder.elapsedMs}
                  drag={voiceRecorder.drag}
                  cancelThresholdPx={voiceRecorder.cancelThresholdPx}
                  lockThresholdPx={voiceRecorder.lockThresholdPx}
                  liveLevels={voiceRecorder.liveLevels}
                  onCancel={voiceRecorder.cancelRecording}
                  onTogglePause={voiceRecorder.togglePauseResume}
                  onStop={voiceRecorder.stopToPreview}
                  onSend={voiceRecorder.stopAndSend}
                  onPreview={voiceRecorder.stopToPreview}
                />
              ) : null}
              {phase === "preview" && voiceRecorder.preview ? (
                <VoicePreviewBar
                  url={voiceRecorder.preview.url}
                  durationSec={voiceRecorder.preview.durationSec}
                  peaks={voiceRecorder.preview.peaks}
                  sending={voiceRecorder.sending}
                  viewOnce={voiceRecorder.preview.viewOnce}
                  onToggleViewOnce={() => {
                    const turningOn = !voiceRecorder.preview?.viewOnce;
                    voiceRecorder.toggleViewOnce();
                    if (turningOn) {
                      setInfoBanner("Voice message set to view once");
                      setTimeout(() => setInfoBanner(null), 2200);
                    }
                  }}
                  onDiscard={voiceRecorder.discardPreview}
                  onSend={voiceRecorder.sendPreview}
                />
              ) : null}
            </View>
          ) : null}

          {emojiPickerTarget?.mode === "input" ? (
            <EmojiPickerSheet
              mode="input"
              content={content}
              heightPx={lastKnownHeight}
              onBackspace={() => setContent((c) => removeLastGrapheme(c))}
              onSelect={(emoji) => {
                setContent((c) => c + emoji);
                trackEmojiUsage.mutate(emoji);
              }}
            />
          ) : null}
        </Animated.View>
      )}

      {attachOpen ? (
        <AttachSheet
          onClose={() => setAttachOpen(false)}
          onGallery={() => void openPicker("gallery")}
          onCamera={() => void openPicker("camera")}
          onDocument={() => void openPicker("document")}
        />
      ) : null}

      {mediaDraft ? <MediaComposeModal kind={mediaDraft.kind} files={mediaDraft.files} onClose={() => setMediaDraft(null)} onSend={handleSendMedia} /> : null}

      {headerMenuOpen ? (
        <DropdownMenu
          anchorRef={headerMenuRef}
          onClose={() => setHeaderMenuOpen(false)}
          width={192}
          items={[
            { key: "search", label: "Search", icon: <Icon as={Search} size={22} className="text-overlay-ink" />, onSelect: () => setSearchOpen(true) },
            { key: "hidden", label: "Hidden messages", icon: <Icon as={EyeOff} size={22} className="text-overlay-ink" />, onSelect: () => router.push(`/messages/${conversationId}/hidden` as Href) },
          ]}
        />
      ) : null}

      {activeMessage ? (
        <MessageActionMenu
          content={activeMessage.message.content}
          isMine={activeMessage.message.sender_id === user?.id}
          isDeleted={activeMessage.message.is_deleted}
          anchorRect={activeMessage.anchorRect}
          isStarred={!!activeState?.starred_at}
          isPinned={!!activeState?.pinned_at}
          emojis={topEmojis}
          myReaction={activeMyReaction}
          onReact={(emoji) => setReaction.mutate({ messageId: activeMessage.message.id, emoji }, { onError: onMutationError })}
          onRequestRemoveReaction={() => activeMyReaction && setReactionPopover({ messageId: activeMessage.message.id, anchorRect: activeMessage.anchorRect, emoji: activeMyReaction })}
          onOpenFullPicker={() => setEmojiPickerTarget({ mode: "reaction", messageId: activeMessage.message.id })}
          onCopy={() => void Clipboard.setStringAsync(messagePlainText(activeMessage.message.content)).then(() => toast("Copied."))}
          onDeletePress={() =>
            setDeleteTarget({ messageIds: [activeMessage.message.id], allowEveryone: activeMessage.message.sender_id === user?.id && !activeMessage.message.is_deleted })
          }
          onShare={() => void shareText(messagePlainText(activeMessage.message.content) || messagePreview(activeMessage.message.content).label)}
          onForward={() => setForwardMessages([{ content: activeMessage.message.content }])}
          onReply={() => startReply(activeMessage.message)}
          onToggleStar={() => toggleStar.mutate({ messageId: activeMessage.message.id, active: !activeState?.starred_at }, { onError: onMutationError })}
          onTogglePin={() => togglePin.mutate({ messageId: activeMessage.message.id, active: !activeState?.pinned_at }, { onError: onMutationError })}
          onHide={() => toggleHidden.mutate({ messageId: activeMessage.message.id, active: true }, { onError: onMutationError })}
          onSelect={() => enterSelectMode(activeMessage.message.id)}
          onClose={() => setActiveMessage(null)}
        />
      ) : null}

      {emojiPickerTarget?.mode === "reaction" ? (
        <EmojiPickerSheet
          mode="reaction"
          onClose={() => setEmojiPickerTarget(null)}
          onSelect={(emoji) => {
            setReaction.mutate({ messageId: emojiPickerTarget.messageId, emoji }, { onError: onMutationError });
            setEmojiPickerTarget(null);
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteMessageSheet count={deleteTarget.messageIds.length} allowEveryone={deleteTarget.allowEveryone} onDelete={handleDeleteConfirm} onClose={() => setDeleteTarget(null)} />
      ) : null}

      {reactionPopover ? (
        <ReactionOptionsPopover
          target={reactionPopover}
          quickEmojis={topEmojis}
          onReplace={(emoji) => setReaction.mutate({ messageId: reactionPopover.messageId, emoji }, { onError: onMutationError })}
          onOpenFullPicker={() => setEmojiPickerTarget({ mode: "reaction", messageId: reactionPopover.messageId })}
          onRemove={() => removeReaction.mutate(reactionPopover.messageId, { onError: onMutationError })}
          onClose={() => setReactionPopover(null)}
        />
      ) : null}

      {forwardMessages ? (
        <ForwardMessageSheet
          messages={forwardMessages}
          onClose={() => setForwardMessages(null)}
          onSent={() => {
            setForwardMessages(null);
            exitSelectMode();
          }}
        />
      ) : null}
    </Animated.View>
  );
}
