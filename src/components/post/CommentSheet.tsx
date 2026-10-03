// src/components/post/CommentSheet.tsx
// Comments for a post: one tall bottom sheet with a single scrolling list.
// Replies expand inline under their parent (any depth) without disturbing
// sibling threads. A comment link (?comment=…) expands its ancestors, scrolls to
// the comment, and flashes it.
import { Flag, Gift as GiftIcon, Loader2, MoreHorizontal, Share2, ThumbsDown } from "lucide-react-native";
import { router, type Href } from "expo-router";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, TextInput, View, type View as RNView } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { LikeHeart } from "@/components/ui/LikeHeart";
import { Modal } from "@/components/ui/Modal";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCommentAncestors, useCommentReplies, useRootComments, type CommentWithAuthor } from "@/hooks/useComments";
import { useMyCommentReactions, useToggleCommentReaction, type CommentReactionState } from "@/hooks/useReactions";
import { useReportReasons, useSubmitReport } from "@/hooks/useReports";
import { APP_URL } from "@/lib/config";
import { formatCompactCount } from "@/lib/formatStats";
import { renderFormattedText } from "@/lib/formatText";
import { useTheme } from "@/theme/ThemeProvider";
import type { Stance } from "@/types/database";
import { GiftPicker } from "./GiftPicker";
import { STANCE_COLORS, StanceComposer } from "./StanceComposer";

/** Compact stamp used inside comment rows ("5m", "3h", "2d" — no "ago"). */
function shortAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type ToggleReaction = (input: { commentId: string; type: "like" | "dislike"; currentlyActive: boolean }) => void;

interface CommentSheetCtx {
  postId: string;
  currentUserId: string | null;
  highlightId: string | null | undefined;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  reactions: Map<string, CommentReactionState> | undefined;
  onToggleReaction: ToggleReaction;
  onIdsLoaded: (ids: string[]) => void;
  onShare: (comment: CommentWithAuthor) => void;
  onReport: (comment: CommentWithAuthor) => void;
  onGift: (comment: CommentWithAuthor) => void;
  /** Scroll the list so a row (measured relative to the list content) is centred. */
  scrollToRow: (row: RNView) => void;
}
const Ctx = createContext<CommentSheetCtx | null>(null);

function CommentThread({ comment, depth }: { comment: CommentWithAuthor; depth: number }) {
  const ctx = useContext(Ctx)!;
  const { colors } = useTheme();
  const [replyStance, setReplyStance] = useState<Stance | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef<View>(null);
  const rowRef = useRef<View>(null);

  const isExpanded = ctx.expandedIds.has(comment.id);
  const { data: replies, isLoading: repliesLoading } = useCommentReplies(ctx.postId, comment.id, isExpanded);

  useEffect(() => {
    if (replies && replies.length > 0) ctx.onIdsLoaded(replies.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replies]);

  const stanceColors = comment.stance ? STANCE_COLORS[comment.stance] : null;
  const isTarget = !!ctx.highlightId && comment.id === ctx.highlightId;
  const [flashing, setFlashing] = useState(isTarget);

  const reactionState = ctx.reactions?.get(comment.id);
  const isLiked = !!reactionState?.liked;
  const isDisliked = !!reactionState?.disliked;
  const isMine = !!ctx.currentUserId && comment.author.id === ctx.currentUserId;

  // Deep-linked comment: scroll it into view once laid out, and flash it.
  useEffect(() => {
    if (!isTarget) return;
    setFlashing(true);
    const scrollTimer = setTimeout(() => {
      if (rowRef.current) ctx.scrollToRow(rowRef.current);
    }, 250);
    const flashTimer = setTimeout(() => setFlashing(false), 2500);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(flashTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTarget]);

  const menuItems: DropdownMenuItem[] = [
    { key: "share", label: "Share", icon: <Icon as={Share2} size={22} className="text-overlay-ink" />, onSelect: () => ctx.onShare(comment) },
    ...(isMine
      ? []
      : [
          { key: "gift", label: "Send a gift", icon: <Icon as={GiftIcon} size={22} className="text-overlay-ink" />, onSelect: () => ctx.onGift(comment) },
          {
            key: "report",
            label: "Report",
            icon: <Icon as={Flag} size={22} className="text-overlay-danger" />,
            variant: "danger" as const,
            onSelect: () => ctx.onReport(comment),
          },
        ]),
  ];

  return (
    <View
      ref={rowRef}
      collapsable={false}
      className={`mt-4 rounded-lg ${depth > 0 ? "ml-5 border-l border-border pl-3" : ""} ${flashing ? "bg-highlight px-2 py-1.5" : ""}`}
    >
      <View className="flex-row items-start gap-2.5">
        <Pressable onPress={() => router.push(`/profile/${comment.author.username}` as Href)} accessibilityRole="link">
          <Avatar src={comment.author.avatar_url} name={comment.author.display_name} size="sm" />
        </Pressable>

        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              accessibilityRole="link"
              onPress={() => router.push(`/profile/${comment.author.username}` as Href)}
              className="text-sm font-medium text-ink"
            >
              {comment.author.display_name}
            </Text>
            {stanceColors ? (
              <View className={`rounded-full px-2 py-0.5 ${stanceColors.pillClass}`}>
                <Text className={`text-xs font-medium ${stanceColors.pillTextClass}`}>{stanceColors.label}</Text>
              </View>
            ) : null}
            <Text className="text-xs text-ink-muted">{shortAgo(comment.created_at)}</Text>

            <View className="ml-auto">
              <Pressable
                ref={moreButtonRef}
                collapsable={false}
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Comment options"
                hitSlop={10}
                className="-mr-1 p-1"
              >
                <Icon as={MoreHorizontal} size={16} className="text-ink-muted" />
              </Pressable>
              {menuOpen ? <DropdownMenu anchorRef={moreButtonRef} onClose={() => setMenuOpen(false)} items={menuItems} width={176} /> : null}
            </View>
          </View>

          <Text className="mt-1 text-sm text-ink">{renderFormattedText(comment.content, "c")}</Text>

          <View className="mt-2.5 flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
            <Pressable
              onPress={() => ctx.onToggleReaction({ commentId: comment.id, type: "like", currentlyActive: isLiked })}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? "Unlike" : "Like"}
              className="-ml-1.5 flex-row items-center gap-1.5 p-1.5"
            >
              <LikeHeart active={isLiked} size={18} className="text-danger" />
              {comment.like_count > 0 ? <Text className="text-sm text-danger">{comment.like_count}</Text> : null}
            </Pressable>
            <Pressable
              onPress={() => ctx.onToggleReaction({ commentId: comment.id, type: "dislike", currentlyActive: isDisliked })}
              accessibilityRole="button"
              accessibilityLabel={isDisliked ? "Remove dislike" : "Dislike"}
              className="flex-row items-center gap-1.5 p-1.5"
            >
              <ThumbsDown size={18} color={isDisliked ? colors.danger : colors.inkMuted} fill={isDisliked ? colors.danger : "none"} />
              {comment.dislike_count > 0 ? (
                <Text className={`text-sm ${isDisliked ? "text-danger" : "text-ink-muted"}`}>{comment.dislike_count}</Text>
              ) : null}
            </Pressable>

            {(["support", "disagree", "pushback"] as Stance[]).map((s) => (
              <Pressable key={s} onPress={() => setReplyStance(s)} accessibilityRole="button" className="py-1.5 active:opacity-60">
                <Text className="text-sm font-medium text-ink">{STANCE_COLORS[s].label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Opens/closes only THIS comment's own reply list, inline — every other
              comment's thread (sibling or ancestor) is unaffected. */}
          {comment.reply_count > 0 ? (
            <Pressable onPress={() => ctx.toggleExpand(comment.id)} accessibilityRole="button" className="mt-2.5 flex-row items-center gap-2">
              <View className="h-px w-6 bg-border" />
              <Text className="text-sm font-medium text-accent">
                {isExpanded
                  ? "Hide replies"
                  : `${formatCompactCount(comment.reply_count)} ${comment.reply_count === 1 ? "reply" : "replies"}`}
              </Text>
            </Pressable>
          ) : null}

          {isExpanded ? (
            <View>
              {repliesLoading ? (
                <Text className="mt-2.5 text-xs text-ink-muted">Loading replies…</Text>
              ) : (
                (replies ?? []).map((reply) => <CommentThread key={reply.id} comment={reply} depth={depth + 1} />)
              )}
            </View>
          ) : null}
        </View>
      </View>

      {replyStance ? (
        <StanceComposer postId={ctx.postId} stance={replyStance} parentCommentId={comment.id} onClose={() => setReplyStance(null)} />
      ) : null}
    </View>
  );
}

function CommentReportSheet({ comment, onClose }: { comment: CommentWithAuthor; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { data: reasons, isLoading: reasonsLoading } = useReportReasons();
  const submitReport = useSubmitReport();
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [details, setDetails] = useState("");

  async function handleSubmit() {
    if (!reasonId) return;
    try {
      await submitReport.mutateAsync({ targetType: "comment", targetId: comment.id, reasonId, details });
      toast("Report submitted. Thanks for flagging this.", { variant: "success" });
      onClose();
    } catch {
      toast("Couldn't submit your report. Try again.", { variant: "error" });
    }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Report comment" maxWidth={448}>
      <View className="mb-4 flex-row items-center gap-2">
        <Icon as={Flag} size={18} className="text-overlay-danger" />
        <Text className="font-display text-lg text-overlay-ink">Report comment</Text>
      </View>

      <Text numberOfLines={2} className="mb-3 text-sm text-overlay-ink-muted">
        {`Reporting ${comment.author.display_name}'s comment: "${comment.content}"`}
      </Text>

      {reasonsLoading ? <Text className="py-4 text-center text-sm text-overlay-ink-muted">Loading reasons…</Text> : null}

      <View className="mb-3 gap-1.5">
        {reasons?.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setReasonId(r.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: reasonId === r.id }}
            className={`rounded-xl border px-3.5 py-2.5 ${reasonId === r.id ? "border-overlay-accent bg-overlay-accent-soft" : "border-overlay-border bg-overlay-surface-raised"}`}
          >
            <Text className="text-sm font-medium text-overlay-ink">{r.label}</Text>
            {r.description ? <Text className="mt-0.5 text-xs text-overlay-ink-muted">{r.description}</Text> : null}
          </Pressable>
        ))}
      </View>

      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Add details (optional, required for 'Other')"
        placeholderTextColor="#98989D"
        multiline
        textAlignVertical="top"
        selectionColor={colors.accent}
        className="mb-3 rounded-xl border border-overlay-border bg-overlay-surface-raised px-3.5 py-2.5 text-sm text-overlay-ink"
        style={{ fontFamily: "Inter_400Regular", minHeight: 76 }}
      />

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={!reasonId || submitReport.isPending}
        accessibilityRole="button"
        className={`flex-row items-center justify-center gap-2 rounded-xl bg-overlay-danger py-2.5 ${!reasonId || submitReport.isPending ? "opacity-50" : ""}`}
      >
        {submitReport.isPending ? <ActivityIndicator size="small" color="#1C1C1E" /> : null}
        <Text className="text-sm font-medium text-overlay-surface">Submit report</Text>
      </Pressable>
    </Modal>
  );
}

export function CommentSheet({
  postId,
  commentCount,
  isOwner = false,
  onClose,
  highlightId,
}: {
  postId: string;
  commentCount?: number;
  isOwner?: boolean;
  onClose: () => void;
  highlightId?: string | null;
}) {
  const { user } = useAuth();
  const { data: roots, isLoading } = useRootComments(postId);
  const rootList = useMemo(() => roots ?? [], [roots]);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [reportTarget, setReportTarget] = useState<CommentWithAuthor | null>(null);
  const [giftTarget, setGiftTarget] = useState<CommentWithAuthor | null>(null);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A highlighted comment may sit several levels down: expand every ancestor so it renders.
  const { data: ancestorIds } = useCommentAncestors(highlightId);
  useEffect(() => {
    if (!ancestorIds || ancestorIds.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of ancestorIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ancestorIds]);

  // Every comment id on screen (roots + any expanded replies) — the "my reactions" query needs them all.
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [knownIds, setKnownIds] = useState<string[]>([]);
  function registerIds(ids: string[]) {
    let changed = false;
    for (const id of ids) {
      if (!knownIdsRef.current.has(id)) {
        knownIdsRef.current.add(id);
        changed = true;
      }
    }
    if (changed) setKnownIds(Array.from(knownIdsRef.current));
  }
  useEffect(() => {
    if (rootList.length > 0) registerIds(rootList.map((r) => r.id));
  }, [rootList]);

  const { data: reactions } = useMyCommentReactions(postId, knownIds);
  const toggleReaction = useToggleCommentReaction(postId, knownIds.length);

  const totalCount = commentCount ?? rootList.length;

  async function handleShare(comment: CommentWithAuthor) {
    const url = `${APP_URL}/post/${postId}#comment-${comment.id}`;
    try {
      await Share.share({ message: url, url });
    } catch {
      /* dismissed */
    }
  }

  function scrollToRow(row: RNView) {
    const content = contentRef.current;
    if (!content) return;
    row.measureLayout(
      content,
      (_x, y, _w, h) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120 + h / 2), animated: true }),
      () => {}
    );
  }

  const ctx: CommentSheetCtx = {
    postId,
    currentUserId: user?.id ?? null,
    highlightId,
    expandedIds,
    toggleExpand,
    reactions,
    onToggleReaction: toggleReaction.mutate,
    onIdsLoaded: registerIds,
    onShare: (c) => void handleShare(c),
    onReport: setReportTarget,
    onGift: setGiftTarget,
    scrollToRow,
  };

  return (
    <>
      <SheetFrame
        title="Comments"
        titleSuffix={totalCount > 0 ? formatCompactCount(totalCount) : undefined}
        onClose={onClose}
        zIndex={50}
        heightRatio={0.82}
        bodyScroll={false}
        accessibilityLabel="Comments"
        footer={
          // Always posts a NEW top-level comment — replying to a specific comment
          // happens inline via that comment's own Support/Disagree/Pushback buttons.
          <Pressable
            onPress={() => setShowComposer(true)}
            accessibilityRole="button"
            className="rounded-full border border-border bg-canvas px-4 py-2.5"
          >
            <Text numberOfLines={1} className="text-sm text-ink-muted">
              Add a comment…
            </Text>
          </Pressable>
        }
      >
        <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="px-4 pb-2" keyboardShouldPersistTaps="handled">
          <View ref={contentRef} collapsable={false}>
          <Ctx.Provider value={ctx}>
            {isLoading ? (
              <Text className="mt-6 text-center text-sm text-ink-muted">Loading…</Text>
            ) : rootList.length === 0 ? (
              <Text className="mt-6 text-center text-sm text-ink-muted">No responses yet.</Text>
            ) : (
              rootList.map((root) => <CommentThread key={root.id} comment={root} depth={0} />)
            )}
          </Ctx.Provider>
          </View>

          {toggleReaction.isError ? (
            <Text className="py-2 text-center text-xs text-danger">Couldn't save that reaction. Try again.</Text>
          ) : null}
        </ScrollView>
      </SheetFrame>

      {showComposer ? (
        <StanceComposer postId={postId} stance="support" stances={isOwner ? ["support"] : undefined} onClose={() => setShowComposer(false)} />
      ) : null}

      {reportTarget ? <CommentReportSheet comment={reportTarget} onClose={() => setReportTarget(null)} /> : null}

      {giftTarget ? (
        <GiftPicker
          recipientId={giftTarget.author.id}
          recipientName={giftTarget.author.display_name}
          recipientAvatar={giftTarget.author.avatar_url}
          postId={postId}
          commentId={giftTarget.id}
          onClose={() => setGiftTarget(null)}
        />
      ) : null}
    </>
  );
}
