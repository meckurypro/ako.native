// src/components/post/PostCard.tsx
// The post card shown in feeds and on profiles. Same structure as web:
//   header   → avatar (+collaborators badge), name + badges, roles/tagline, time
//   divider  → repost badge / Follow pill sitting on the header's bottom border
//   body     → heading + text, media, music credit (a plain reshare shows the
//              ORIGINAL's content inline; a quote shows its own caption and the
//              original as an embedded card)
//   tray     → Like · ranked secondary actions · More (hold any button = more)
// Owner view adds prioritize / edit / promote / tag / collaborators / archive /
// delete; archived (and orphaned-reshare) cards freeze their tray and surface
// Restore / Delete directly.
import {
  Archive,
  Bookmark,
  HelpCircle,
  MessageSquarePlus,
  Gift as GiftIcon,
  Globe,
  Hand,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Redo2,
  Repeat2,
  RotateCcw,
  Rocket,
  Tag,
  ThumbsDown,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { router, type Href } from "expo-router";
import { memo, useRef, useState, type ReactNode } from "react";
import { Pressable, Share, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { AkoWatermark } from "@/components/ui/AkoWatermark";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LikeHeart } from "@/components/ui/LikeHeart";
import { RoleTags } from "@/components/ui/RoleTags";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { TierBadge } from "@/components/ui/TierBadge";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MusicAttribution } from "@/components/music/MusicAttribution";
import { useAuth } from "@/hooks/useAuth";
import { useLivePost } from "@/hooks/useLiveCounts";
import { useRecordPostView } from "@/hooks/useRecordPostView";
import { useIsBookmarked, useToggleBookmark } from "@/hooks/useBookmarks";
import { useCollaborators } from "@/hooks/useCollaboration";
import { MORE_ORDER, STANCE_KEYS, TRAY_ORDER, type SecondaryActionKey } from "@/lib/engagementActions";
import { useActiveIdentity } from "@/hooks/usePages";
import {
  canEditPost,
  useDeletePost,
  useHasReshared,
  usePostViewCount,
  usePrioritizedPostToday,
  usePrioritizePost,
  useSetPostArchived,
} from "@/hooks/usePosts";
import { recordProfileVisitFromPost } from "@/hooks/useProfileVisits";
import { useMyReaction, useReactionOverlay, useToggleReaction } from "@/hooks/useReactions";
import { APP_URL } from "@/lib/config";
import { formatCompactCount, formatPostDate, formatPostTime } from "@/lib/formatStats";
import { isPublished } from "@/lib/postStatus";
import { timeAgo } from "@/lib/timeAgo";
import { useTheme } from "@/theme/ThemeProvider";
import { isPlainReshare, isQuote, type PostWithAuthor, type Stance } from "@/types/database";
import { CollaboratorsSheet } from "./CollaboratorsSheet";
import { FollowButton } from "./FollowButton";
import { GiftPicker } from "./GiftPicker";
import { PostCollaboratorsBadge } from "./PostCollaboratorsBadge";
import { PostContent } from "./PostContent";
import { PostMedia } from "./PostMedia";
import { PostReactionBar } from "./PostReactionBar";
import type { EngagementAction } from "./ReactionTray";
import { RepostBadge } from "./RepostBadge";
import { RepostEmbed } from "./RepostEmbed";
import { ReshareSheet } from "./ReshareSheet";
import { StanceComposer } from "./StanceComposer";
import { TagPeopleSheet } from "./TagPeopleSheet";
import { TaggedProjectEmbed, type TaggedProjectSummary } from "./TaggedProjectEmbed";
import { friendlyError } from "@/lib/friendlyError";

// Android adds invisible top/bottom padding to every Text line; web has none. It is a *style* in RN 0.86, not a prop.
const NO_FONT_PADDING = { includeFontPadding: false } as const;

const DOUBLE_TAP_WINDOW_MS = 300;
const ICON = 24;

type ActionDef = {
  key: SecondaryActionKey;
  label: string;
  icon: ReactNode;
  count: number | null;
  onAction: () => void;
};

interface PostCardProps {
  post: PostWithAuthor;
  isOwnerView?: boolean;
  /** Expanded post-detail variant: shows time · date · views and routes the comment tap to the page. */
  showStats?: boolean;
  /** False while the card's tab/screen isn't in use — pauses its per-post queries. */
  active?: boolean;
  /** True while the card is actually on screen (≥60% visible) — only then may its music clip play. */
  visible?: boolean;
  onRequestOpenComments?: () => void;
}

function PostCardImpl({ post, isOwnerView = false, showStats = false, active = true, visible = true, onRequestOpenComments }: PostCardProps) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const toast = useToast();

  const [activeStance, setActiveStance] = useState<Stance | null>(null);
  const [showReshareSheet, setShowReshareSheet] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [metaWrapped, setMetaWrapped] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showTagSheet, setShowTagSheet] = useState(false);
  const [showCollaboratorsSheet, setShowCollaboratorsSheet] = useState(false);
  const [showPrioritizeConfirm, setShowPrioritizeConfirm] = useState(false);
  const [prioritizeError, setPrioritizeError] = useState<string | null>(null);
  const lastTapRef = useRef(0);

  const { data: collaborators } = useCollaborators("post", post.id);
  const hasAcceptedCollaborators = (collaborators ?? []).some((c) => c.status === "accepted");

  const plainReshare = isPlainReshare(post);
  const quotePost = isQuote(post);
  const original = post.reshared_post;

  // Original deleted or archived → a plain reshare has nothing left to show.
  const originalGone = !original || original.is_deleted || original.is_archived;
  // Resharing a plain reshare reshares the ORIGINAL, not the reshare wrapper.
  const reshareTarget = plainReshare && !originalGone ? original! : post;

  const taggedProject = (post as unknown as { tagged_project?: TaggedProjectSummary | null }).tagged_project;
  const hasTaggedProject = !!taggedProject;

  const isOwner = isOwnerView || user?.id === post.author.id;
  const HIDDEN_FOR_OWNER: SecondaryActionKey[] = ["question", "pushback", "gift", "dislike"];

  const { data: viewerIdentity } = useActiveIdentity();
  const viewingAsPage = viewerIdentity?.mode === "page";

  // Archived own post: tray frozen, Restore/Delete surfaced on the card instead.
  const isArchivedFrozen = isOwner && post.is_archived;
  const reshareContentGone = plainReshare && originalGone;
  const trayFrozen = isArchivedFrozen || reshareContentGone;

  const postedAsPage = post.posted_as_page ?? null;
  const identityHref = postedAsPage ? `/page/${postedAsPage.username}` : `/profile/${post.author.username}`;
  const identityName = postedAsPage ? postedAsPage.name : post.author.display_name;
  const identityAvatar = postedAsPage ? postedAsPage.avatar_url : post.author.avatar_url;
  const identityVerified = !!(postedAsPage ? postedAsPage.is_verified : post.author.badge_visible);

  const isBookmarkedQuery = useIsBookmarked(post.id, active);
  const toggleBookmark = useToggleBookmark(post.id);
  const isBookmarked = !!isBookmarkedQuery.data;

  const likeQuery = useMyReaction(post.id, "post", "like", active);
  const dislikeQuery = useMyReaction(post.id, "post", "dislike", active);
  const toggleLike = useToggleReaction(post.id, "post", "like");
  const toggleDislike = useToggleReaction(post.id, "post", "dislike");
  const toggleShare = useToggleReaction(post.id, "post", "share");
  // Render server state + any unconfirmed tap (queued/offline included) so hearts and counts move instantly.
  const likeView = useReactionOverlay(post.id, "post", "like", !!likeQuery.data);
  const dislikeView = useReactionOverlay(post.id, "post", "dislike", !!dislikeQuery.data);
  const isLiked = likeView.active;
  const isDisliked = dislikeView.active;
  const likeCount = Math.max(0, post.like_count + likeView.countDelta);
  const dislikeCount = Math.max(0, post.dislike_count + dislikeView.countDelta);

  const deletePost = useDeletePost();
  const setArchived = useSetPostArchived();
  const prioritizePost = usePrioritizePost();
  const prioritizedTodayQuery = usePrioritizedPostToday(post.author.id, isOwner);
  const isPrioritizedToday = (prioritizedTodayQuery.data ?? null) === post.id;


  const hasResharedQuery = useHasReshared(reshareTarget.id, !isOwner && active);
  const hasReshared = !!hasResharedQuery.data;

  useRecordPostView(post.id, active && visible);
  // Likes, comments, shares… follow other people's activity live while this card is on screen.
  useLivePost(post.id, active);
  const viewCountQuery = usePostViewCount(post.id, showStats || active);
  const viewCount = viewCountQuery.data ?? 0;

  function openPost() {
    router.push(`/post/${post.id}` as Href);
  }

  function handleContentPress() {
    const now = Date.now();
    // A quick second tap likes the post (the first already navigated — same as web).
    if (now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS && !isLiked) {
      toggleLike.mutate(false);
    }
    lastTapRef.current = now;
    openPost();
  }

  function openIdentity() {
    if (!postedAsPage && user) recordProfileVisitFromPost(post.id, post.author.id, user.id);
    router.push((postedAsPage ? identityHref : `${identityHref}?fromPost=${post.id}`) as Href);
  }

  // Comments are the post's own page now, not an overlay: from a feed or a profile grid the count takes you
  // into the post (which also counts as a view), and on the post's page it scrolls down to the replies.
  function handleCommentTap() {
    if (showStats) {
      onRequestOpenComments?.();
      return;
    }
    router.push(`/post/${post.id}` as Href);
  }

  async function handleShare() {
    if (!isPublished(post)) return; // never hand out a link to a post nobody else can open
    const url = `${APP_URL}/post/${post.id}`;
    try {
      const result = await Share.share({ message: url, url });
      if (result.action === Share.dismissedAction) return; // cancelled — don't count it
    } catch {
      return;
    }
    toggleShare.mutate(false); // record the share
  }

  function handleToggleArchive() {
    if (post.is_archived) setArchived.mutate({ postId: post.id, archived: false });
    else setShowArchiveConfirm(true);
  }

  function handleReshareTap() {
    if (plainReshare && originalGone) return; // nothing valid left to reshare
    if (hasReshared) return;
    setShowReshareSheet(true);
  }

  const ink = colors.ink;
  const mk = (as: LucideIcon, opts?: { color?: string; fill?: string }) => {
    const C = as;
    return <C size={ICON} color={opts?.color ?? ink} fill={opts?.fill ?? "none"} />;
  };

  const secondaryDefs: Record<SecondaryActionKey, ActionDef> = {
    support: {
      key: "support",
      label: "Add",
      icon: mk(MessageSquarePlus),
      count: post.support_count,
      onAction: () => setActiveStance("support"),
    },
    question: {
      key: "question",
      label: "Question",
      icon: mk(HelpCircle),
      count: post.question_count,
      onAction: () => setActiveStance("question"),
    },
    pushback: {
      key: "pushback",
      label: "Pushback",
      icon: mk(Hand),
      count: post.pushback_count,
      onAction: () => setActiveStance("pushback"),
    },
    dislike: {
      key: "dislike",
      label: isDisliked ? "Disliked" : "Dislike",
      icon: mk(ThumbsDown, { fill: isDisliked ? ink : "none" }),
      count: dislikeCount,
      onAction: () => toggleDislike.mutate(isDisliked),
    },
    gift: {
      key: "gift",
      label: "Gift",
      icon: mk(GiftIcon),
      count: post.gift_count,
      onAction: () => setShowGiftPicker(true),
    },
    reshare: {
      key: "reshare",
      label: "Reshare",
      icon: mk(Repeat2),
      count: post.share_count,
      onAction: handleReshareTap,
    },
    save: {
      key: "save",
      label: isBookmarked ? "Saved" : "Save",
      icon: mk(Bookmark, { fill: isBookmarked ? ink : "none" }),
      count: null,
      onAction: () => toggleBookmark.mutate(isBookmarked),
    },
    share: {
      key: "share",
      label: "Share",
      icon: mk(Redo2),
      count: null,
      onAction: () => void handleShare(),
    },
  };

  // Which actions are available at all on this post.
  const isAvailable = (k: SecondaryActionKey) => {
    // A draft/scheduled post has no public page yet: nothing to share, reshare or gift, and nobody to answer to.
    if (!isPublished(post) && (k === "share" || k === "reshare" || k === "gift" || STANCE_KEYS.includes(k))) return false;
    if (isOwner && HIDDEN_FOR_OWNER.includes(k)) return false;
    if (k === "reshare" && (isOwner || hasReshared)) return false;
    if (k === "gift" && viewingAsPage) return false; // a Page can't gift
    if (k === "gift" && hasTaggedProject) return false; // tagged project posts are gifted via the project
    return true;
  };

  // The tray: Like, then the three stances (Add / Question / Pushback), always — see lib/engagementActions.ts.
  const trayKeys = TRAY_ORDER.filter(isAvailable);

  // "More" is a fixed list: sharing first, Dislike last.
  const moreOrder = MORE_ORDER.filter(isAvailable);

  // Plain reshares have no content of their own to edit; collaborative posts are locked.
  const canEdit = !plainReshare && !hasAcceptedCollaborators && canEditPost(post);

  const leftActions: EngagementAction[] = [
    {
      key: "like",
      label: isLiked ? "Liked" : "Like",
      icon: <LikeHeart active={isLiked} size={ICON} className="text-danger" />,
      count: likeCount,
      onClick: () => toggleLike.mutate(isLiked),
    },
  ];

  const ownerActions: EngagementAction[] = isOwner
    ? [
        {
          key: "prioritize",
          label: isPrioritizedToday ? "Prioritized today" : "Prioritize",
          icon: mk(Rocket, { color: isPrioritizedToday ? colors.accent : ink, fill: isPrioritizedToday ? colors.accent : "none" }),
          count: null,
          onClick: () => {
            if (!isPrioritizedToday) setShowPrioritizeConfirm(true);
          },
        },
        ...(canEdit
          ? [{ key: "edit", label: "Edit", icon: mk(Pencil), count: null, onClick: () => router.push(`/post/${post.id}/edit` as Href) }]
          : []),
        { key: "promote", label: "Promote", icon: mk(Megaphone), count: null, onClick: () => router.push(`/promote/${post.id}` as Href) },
        { key: "tag-people", label: "Tag people", icon: mk(Tag), count: null, onClick: () => setShowTagSheet(true) },
        { key: "collaborators", label: "Collaborators", icon: mk(Users), count: null, onClick: () => setShowCollaboratorsSheet(true) },
        {
          key: "archive",
          label: post.is_archived ? "Unarchive" : "Archive",
          icon: post.is_archived ? mk(RotateCcw) : mk(Archive),
          count: null,
          onClick: handleToggleArchive,
        },
        { key: "delete", label: "Delete", icon: mk(Trash2), count: null, onClick: () => setShowDeleteConfirm(true) },
      ]
    : [];

  const toAction = (k: SecondaryActionKey): EngagementAction => ({
    key: secondaryDefs[k].key,
    label: secondaryDefs[k].label,
    icon: secondaryDefs[k].icon,
    count: secondaryDefs[k].count,
    onClick: () => secondaryDefs[k].onAction(),
  });

  const moreActions: EngagementAction[] = [...moreOrder.map(toAction), ...ownerActions];

  // Add / Question / Pushback sit right after Like; long-pressing any button opens the full sheet.
  const middleActions: EngagementAction[] = trayKeys.map(toAction);

  const hasOwnText = post.content.trim() !== "" || !!post.heading;

  return (
    <View
      accessibilityRole="summary"
      className="relative mb-4 rounded-2xl bg-surface p-4"
      style={{
        shadowColor: `rgb(${colors.shadowInkRgb})`,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
        elevation: 3,
        borderWidth: 1,
        borderColor: `rgba(${colors.shadowInkRgb}, 0.07)`,
      }}
    >
      {/* Restore / Delete for archived content — the tray below is frozen, so these
          live on the card itself as their own row above the header, so they never overlap the author or content. */}
      {isArchivedFrozen ? (
        <View className="mb-3 flex-row items-center justify-end gap-2">
          <Pressable
            onPress={handleToggleArchive}
            accessibilityRole="button"
            accessibilityLabel="Restore"
            className="flex-row items-center gap-1.5 rounded-full bg-ink-a70 px-3.5 py-2"
          >
            <Icon as={RotateCcw} size={14} className="text-canvas" />
            <Text className="text-xs font-medium text-canvas">Restore</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            className="flex-row items-center gap-1.5 rounded-full bg-danger-a85 px-3.5 py-2"
          >
            <Icon as={Trash2} size={14} className="text-canvas" />
            <Text className="text-xs font-medium text-canvas">Delete</Text>
          </Pressable>
        </View>
      ) : null}

      {/* A plain reshare whose original is gone has an empty, frozen tray — this is
          the owner's only way left to clear it out. */}
      {reshareContentGone && isOwner && !isArchivedFrozen ? (
        <View className="mb-3 flex-row items-center justify-end">
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            className="flex-row items-center gap-1.5 rounded-full bg-danger-a85 px-3.5 py-2"
          >
            <Icon as={Trash2} size={14} className="text-canvas" />
            <Text className="text-xs font-medium text-canvas">Delete</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="relative">
        <View className="flex-row items-start gap-3 border-b border-border pb-3.5">
          <Pressable onPress={openIdentity} accessibilityRole="link" accessibilityLabel={`${identityName}'s profile`} className="relative">
            <Avatar src={identityAvatar} name={identityName} size="md" />
            {/* Verified mark rides the avatar's lower-right circumference (centre on the rim), so it sits
                half outside the photo instead of covering it. The collaborators badge yields to the left. */}
            {identityVerified ? (
              <View pointerEvents="none" style={{ position: "absolute", right: -3, bottom: -3 }}>
                <VerifiedBadge size={16} />
              </View>
            ) : null}
            <PostCollaboratorsBadge target="post" targetId={post.id} side={identityVerified ? "left" : "right"} />
          </Pressable>

          <View className="min-w-0 flex-1 gap-0.5">
            {/* Name row — never wraps; the watermark sits flush at this row's right edge. */}
            <View className="flex-row items-center gap-1.5" style={{ height: 20 }}>
              <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                {/* Size, line height and colour are inline (not utility classes) so the name can never
                    resolve to an unstyled/invisible run; flexShrink lets long names truncate before the badges. */}
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  onPress={openIdentity}
                  accessibilityRole="link"
                  className="font-simple font-semibold"
                  style={{ flexShrink: 1, fontSize: 17, lineHeight: 20, color: colors.ink }}
                >
                  {identityName}
                </Text>
                {!postedAsPage ? <TierBadge tier={post.author.tier} /> : null}
              </View>
              {!isArchivedFrozen ? (
                <View className="shrink-0 pl-2">
                  <AkoWatermark />
                </View>
              ) : null}
            </View>

            {/* Roles (person) or tagline (page) */}
            {postedAsPage ? (
              <Text numberOfLines={1} style={NO_FONT_PADDING} className="text-[13px] leading-[18px] text-ink-muted">
                {postedAsPage.tagline?.trim() || `@${postedAsPage.username}`}
              </Text>
            ) : post.author.roles.length > 0 ? (
              <RoleTags roles={post.author.roles} className="text-[13px] leading-[18px] text-ink-muted" numberOfLines={1} />
            ) : null}

            <View className="flex-row items-center gap-1">
              {/* The line must never break ("just" / "now" on two rows). A shrink-wrapped Text is given exactly its
                  measured width, and on Android a hair of difference between that measure and the drawn glyphs makes
                  it wrap at the space. So if it ever lays out on more than one line, let it fill the row instead
                  (flex-1, one line) — then it can't wrap whatever the measure said. */}
              <Text
                style={NO_FONT_PADDING}
                numberOfLines={metaWrapped ? 1 : undefined}
                onTextLayout={(e) => {
                  if (!metaWrapped && e.nativeEvent.lines.length > 1) setMetaWrapped(true);
                }}
                className={`text-[10.5px] leading-[18px] text-ink-muted ${metaWrapped ? "flex-1" : ""}`}
              >
                {timeAgo(post.created_at)}
                {post.edited_at ? " · edited" : ""}
                {viewCount > 0 ? ` · ${formatCompactCount(viewCount)} ${viewCount === 1 ? "view" : "views"}` : ""}
              </Text>
              {post.visibility === "public" ? <Icon as={Globe} size={11} className="text-ink-muted" /> : null}
            </View>
          </View>
        </View>

        {/* Repost badge / Follow pill sit ON the header's bottom border; the surface-coloured
            backing hides the line behind them. Skipped for page posts (follow the page on its
            own screen) and for the owner's own post. */}
        {plainReshare || (!isOwner && !postedAsPage) ? (
          <View className="absolute -bottom-3 right-0 flex-row items-center gap-2 rounded-full bg-surface pl-2">
            {plainReshare ? <RepostBadge source={original} /> : null}
            {!isOwner && !postedAsPage ? <FollowButton authorId={post.author.id} isPrivate={post.author.is_private} /> : null}
          </View>
        ) : null}
      </View>

      {plainReshare ? (
        originalGone ? (
          <View className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
            <Text className="text-sm text-ink-muted">
              {original?.is_archived ? "This post has been archived by its author." : "This post is no longer available."}
            </Text>
          </View>
        ) : (
          <>
            {original!.content.trim() !== "" || original!.heading ? (
              <Pressable onPress={handleContentPress} accessibilityRole="link" className="mt-3">
                <PostContent heading={original!.heading} headingColor={original!.heading_color} content={original!.content} />
              </Pressable>
            ) : null}
            <PostMedia mediaUrls={original!.media_urls} />
            {original!.music_catalogue_id ? (
              <MusicAttribution catalogueId={original!.music_catalogue_id} postId={post.id} active={active && visible} />
            ) : null}
          </>
        )
      ) : (
        <>
          {hasOwnText ? (
            <Pressable onPress={handleContentPress} accessibilityRole="link" className="mt-3">
              <PostContent heading={post.heading} headingColor={post.heading_color} content={post.content} />
            </Pressable>
          ) : null}
          <PostMedia mediaUrls={post.media_urls} />
          {post.music_catalogue_id ? <MusicAttribution catalogueId={post.music_catalogue_id} postId={post.id} active={active && visible} /> : null}
        </>
      )}

      {/* Quotes keep their own caption above and show the original as a bordered card. */}
      {quotePost ? <RepostEmbed source={original} /> : null}

      <TaggedProjectEmbed project={taggedProject} refToken={(post as unknown as { tagged_project_ref?: string | null }).tagged_project_ref} />

      {showStats ? (
        <View className="mt-3 flex-row items-center gap-1.5 border-b border-border pb-3">
          <Text className="text-sm text-ink-muted">{formatPostTime(post.created_at)}</Text>
          <Text className="text-sm text-ink-muted">·</Text>
          <Text className="text-sm text-ink-muted">{formatPostDate(post.created_at)}</Text>
          <Text className="text-sm text-ink-muted">·</Text>
          <Text className="text-sm font-semibold text-ink">{formatCompactCount(viewCount)}</Text>
          <Text className="text-sm text-ink-muted">{viewCount < 2 ? "View" : "Views"}</Text>
        </View>
      ) : null}

      {/* The tray and its "More actions" sheet own their open state (see PostReactionBar), so opening the sheet doesn't
          re-render this whole card. Keyed by post inside: FlashList recycles cells, and a recycled cell must reset its
          counters, not roll from the previous post's numbers to this one's. */}
      <PostReactionBar
        postId={post.id}
        leftActions={leftActions}
        middleActions={middleActions}
        moreActions={moreActions}
        moreIcon={mk(MoreHorizontal)}
        belowLeftLabel={{ text: "Comments:", count: post.comment_count, onClick: handleCommentTap }}
        frozen={trayFrozen}
      />

      {activeStance ? (
        <StanceComposer
          postId={post.id}
          stance={activeStance}
          onClose={() => setActiveStance(null)}
        />
      ) : null}

      {showReshareSheet ? <ReshareSheet postId={reshareTarget.id} source={reshareTarget} onClose={() => setShowReshareSheet(false)} /> : null}

      {showGiftPicker ? (
        <GiftPicker
          recipientId={post.author.id}
          recipientName={postedAsPage ? postedAsPage.name : post.author.display_name}
          recipientAvatar={postedAsPage ? postedAsPage.avatar_url : post.author.avatar_url}
          postId={post.id}
          onClose={() => setShowGiftPicker(false)}
        />
      ) : null}

      {showTagSheet ? <TagPeopleSheet target="post" targetId={post.id} onClose={() => setShowTagSheet(false)} /> : null}

      {showCollaboratorsSheet ? (
        <CollaboratorsSheet target="post" targetId={post.id} onClose={() => setShowCollaboratorsSheet(false)} />
      ) : null}

      {showArchiveConfirm ? (
        <ConfirmDialog
          title="Archive this post?"
          description="It'll be hidden from your profile and the feed until you unarchive it from your Archive."
          confirmLabel="Archive"
          danger={false}
          onConfirm={() => {
            setShowArchiveConfirm(false);
            setArchived.mutate({ postId: post.id, archived: true });
          }}
          onCancel={() => setShowArchiveConfirm(false)}
        />
      ) : null}

      {showPrioritizeConfirm ? (
        <ConfirmDialog
          title="Prioritize this post?"
          description="This is your one pick for today — it'll take priority over your other posts in people's feeds until they interact with it."
          confirmLabel="Prioritize"
          danger={false}
          onConfirm={() => {
            setShowPrioritizeConfirm(false);
            prioritizePost.mutate(post.id, {
              onError: (err) => setPrioritizeError(friendlyError(err, "Couldn't prioritize this post.")),
            });
          }}
          onCancel={() => setShowPrioritizeConfirm(false)}
        />
      ) : null}

      {prioritizeError ? (
        <ConfirmDialog
          title="Couldn't prioritize this post"
          description={prioritizeError}
          confirmLabel="OK"
          danger={false}
          onConfirm={() => setPrioritizeError(null)}
          onCancel={() => setPrioritizeError(null)}
        />
      ) : null}

      {showDeleteConfirm ? (
        <ConfirmDialog
          title="Delete this post?"
          description="This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            deletePost.mutate(post.id, { onSuccess: () => toast("Post deleted.", { variant: "success" }) });
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      ) : null}
    </View>
  );
}

export const PostCard = memo(PostCardImpl);
