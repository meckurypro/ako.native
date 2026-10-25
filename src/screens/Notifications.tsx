// src/screens/Notifications.tsx
// The notification list for the active identity (personal, or the Page you're acting as), plus the
// contextual push-permission ask. Rows lead to the same place the matching push does
// (lib/notificationRoute.ts); invites and credits open a response dialog.
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  AtSign,
  Download,
  GitFork,
  Banknote,
  Bell,
  Briefcase,
  Coins,
  Gift,
  MessageSquarePlus,
  Heart,
  Lock,
  Megaphone,
  MessageCircle,
  Music2,
  PenLine,
  Quote,
  Redo2,
  Repeat2,
  Send,
  ShieldAlert,
  Tag,
  ThumbsDown,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Wallet2,
  Hand,
  HelpCircle,
  Inbox,
  type LucideIcon,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { CollaborationInviteResponseModal, MusicCreditResponseModal, PageInviteResponseModal } from "@/components/notifications/ResponseModals";
import { PushPermissionCard } from "@/components/notifications/PushPermissionCard";
import { ForewordInviteModal } from "@/components/project/ForewordInviteModal";
import { AkoMark } from "@/components/ui/AkoMark";
import { Avatar } from "@/components/ui/Avatar";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMarkAllRead, useMarkNotificationRead, useNotifications, type NotificationWithActor } from "@/hooks/useNotifications";
import { RefreshSkeleton } from "@/components/ui/RefreshSkeleton";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useMarkAllPageNotificationsRead, useMarkPageNotificationRead, usePageNotifications } from "@/hooks/usePageNotifications";
import { useActiveIdentity, usePageById } from "@/hooks/usePages";
import { notificationAction, type NotificationAction } from "@/lib/notificationRoute";
import { dismissPresentedWhere } from "@/lib/push";
import { timeAgo } from "@/lib/timeAgo";

const TYPE_CONFIG: Record<string, { icon: LucideIcon; verb: string }> = {
  like: { icon: Heart, verb: "liked your post" },
  dislike: { icon: ThumbsDown, verb: "disliked your post" },
  support: { icon: MessageSquarePlus, verb: "added to your post" },
  disagree: { icon: Hand, verb: "pushed back on your post" }, // legacy rows; migrated to pushback
  pushback: { icon: Hand, verb: "pushed back on your post" },
  question: { icon: HelpCircle, verb: "asked a question on your post" },
  reshare: { icon: Repeat2, verb: "reposted your post" },
  quote: { icon: Quote, verb: "quoted your post" },
  share: { icon: Redo2, verb: "shared your post" },
  comment: { icon: MessageCircle, verb: "commented on your post" },
  comment_like: { icon: Heart, verb: "liked your comment" },
  comment_dislike: { icon: ThumbsDown, verb: "disliked your comment" },
  comment_reply: { icon: MessageCircle, verb: "replied to you" },
  post_comment_activity: { icon: MessageCircle, verb: "was active in the discussion on your post" },
  follow: { icon: UserPlus, verb: "followed you" },
  gift_received: { icon: Gift, verb: "sent you a gift" },
  give_back_received: { icon: Gift, verb: "You received a give-back" },
  message: { icon: MessageCircle, verb: "sent you a message" },
  system: { icon: Bell, verb: "" },
  admin_message: { icon: Bell, verb: "" },
  follow_request: { icon: UserPlus, verb: "requested to follow you" },
  follow_request_accepted: { icon: UserCheck, verb: "accepted your follow request" },
  page_role_invite: { icon: Users, verb: "invited you to join their team" },
  page_role_accepted: { icon: UserCheck, verb: "accepted your team invite" },
  page_role_declined: { icon: UserX, verb: "declined your team invite" },
  // Page-role catalogue (supabase/ako_page_roles_catalogue.sql): a role someone typed that isn't in the list reaches
  // admins as a request; the admin's decision comes back to the people waiting on it. The decision rows have no
  // actor (nobody "did" it to you), so they render with the icon like promotion_approved.
  page_role_requested: { icon: Briefcase, verb: "asked for a new page role" },
  page_role_approved: { icon: UserCheck, verb: "Your page role was approved" },
  page_role_rejected: { icon: UserX, verb: "Your page role wasn't approved" },
  post_tagged: { icon: Tag, verb: "tagged you in a post" },
  project_tagged: { icon: Tag, verb: "tagged you in a project" },
  // Owner added you to a private project's access list (project_members). target_type "project",
  // preview_text = project title, so it routes via the generic project case like project_tagged.
  project_access_granted: { icon: Lock, verb: "gave you access to a private project" },
  // Someone finished downloading your File project (complete_file_download). target_type "project",
  // preview_text = project title; routes via the generic project case.
  file_downloaded: { icon: Download, verb: "downloaded your file" },
  // Someone forked (or re-forked) your project as an affiliate. target_type "project", preview_text = project
  // title; routes via the generic project case.
  project_forked: { icon: GitFork, verb: "forked your project" },
  // A forker tagged the project they forked in a post. target_type "post", preview_text = project title.
  forked_project_tagged: { icon: Tag, verb: "tagged your project in a post" },
  // A visitor sent a message through a Custom Page's inquiry form. Actor is null for signed-out visitors.
  custom_page_inquiry: { icon: Inbox, verb: "sent a message to your custom page" },
  collaboration_invite: { icon: Users, verb: "invited you to collaborate" },
  collaboration_accepted: { icon: UserCheck, verb: "accepted your collaboration invite" },
  collaboration_declined: { icon: UserX, verb: "declined your collaboration invite" },
  mention: { icon: AtSign, verb: "mentioned you" },
  moderation_notice: { icon: ShieldAlert, verb: "" },
  promotion_approved: { icon: Megaphone, verb: "Your promotion was approved" },
  promotion_declined: { icon: Megaphone, verb: "Your promotion needs changes" },
  post_published: { icon: Send, verb: "Your scheduled post is live" },
  room_meeting_scheduled: { icon: Users, verb: "scheduled a new Room meeting" },
  project_purchased: { icon: Wallet2, verb: "bought your project" },
  affiliate_commission_earned: { icon: Coins, verb: "You earned an affiliate commission" },
  withdrawal_status: { icon: Banknote, verb: "" },
  gig_created_from_collaboration: { icon: Briefcase, verb: "A Gig was started from your collaboration" },
  music_credit_request: { icon: Music2, verb: "credited you on their song" },
  // Forewords: a creator asks someone to preview their book/course and write a few opening words. The invite needs an
  // answer (ForewordInviteModal); the other three are plain notices that open the project.
  foreword_invite: { icon: PenLine, verb: "asked you to write a foreword" },
  foreword_submitted: { icon: PenLine, verb: "wrote a foreword for your project" },
  foreword_approved: { icon: UserCheck, verb: "added your foreword to their project" },
  foreword_declined: { icon: UserX, verb: "declined to write a foreword" },
};

/** Types with no person behind them: show the type icon, not an actor avatar. */
const NO_ACTOR_TYPES = new Set([
  "system",
  "admin_message",
  "moderation_notice",
  "promotion_approved",
  "promotion_declined",
  "post_published",
  "affiliate_commission_earned",
  "withdrawal_status",
  "gig_created_from_collaboration",
  "give_back_received",
]);

const PROJECT_TARGETABLE_TYPES = new Set(["like", "dislike", "share"]);

function verbFor(n: NotificationWithActor, verb: string): string {
  return n.target_type === "project" && PROJECT_TARGETABLE_TYPES.has(n.type) ? verb.replace("your post", "your project") : verb;
}

const NotificationRow = memo(function NotificationRow({ n, onPress }: { n: NotificationWithActor; onPress: (n: NotificationWithActor) => void }) {
  const config = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const showActor = !!n.actor && !NO_ACTOR_TYPES.has(n.type);
  const unread = !n.read_at;

  return (
    <Pressable
      onPress={() => onPress(n)}
      accessibilityRole="button"
      accessibilityLabel={`${n.actor?.display_name ?? ""} ${verbFor(n, config.verb)}${unread ? ", unread" : ""}`.trim()}
      className={`relative flex-row items-start gap-3 border-b border-border px-4 py-3.5 ${unread ? "bg-highlight/50 active:bg-highlight/70" : "active:bg-accent-soft"}`}
    >
      {/* Full-bleed row with its own padding (list has none), so the unread tint always runs edge to edge.
          Unread is also marked by this leading bar, the dot and a semibold name - never colour alone. */}
      {unread && <View pointerEvents="none" className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
      {showActor ? (
        <Pressable onPress={() => router.push(`/profile/${n.actor!.username}` as Href)} accessibilityRole="link" accessibilityLabel={`${n.actor!.display_name}'s profile`} className="shrink-0">
          <Avatar src={n.actor!.avatar_url} name={n.actor!.display_name} size="sm" />
        </Pressable>
      ) : (
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={config.icon} size={16} className="text-accent" />
        </View>
      )}

      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center">
          {showActor && <Text className={`mr-1 text-sm text-ink ${unread ? "font-semibold" : "font-medium"}`}>{n.actor!.display_name}</Text>}
          {n.type === "admin_message" && <AkoMark size={44} />}
          <Text className="text-sm text-ink"> {verbFor(n, config.verb)}</Text>
        </View>
        {n.preview_text ? (
          <Text numberOfLines={1} className="mt-0.5 text-sm text-ink-muted">
            “{n.preview_text}”
          </Text>
        ) : null}
        <Text className="mt-0.5 text-xs text-ink-muted">{timeAgo(n.created_at)}</Text>
      </View>

      {unread && <View className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </Pressable>
  );
});

/** Navigates to a Page's team screen once the page (and so its username) has loaded. */
function PageResponseNavigator({ pageId, onDone }: { pageId: string; onDone: () => void }) {
  const { data: page } = usePageById(pageId, true);
  useEffect(() => {
    if (!page) return;
    router.push(`/page/${page.username}/team` as Href);
    onDone();
  }, [page, onDone]);
  return null;
}

export function Notifications() {
  const bottomInset = useBottomNavInset();
  const onScroll = useChromeScroll();
  const { open } = useLocalSearchParams<{ open?: string }>();

  const { data: identity } = useActiveIdentity();
  const isPageMode = identity?.mode === "page";
  const pageId = isPageMode ? identity.page.id : undefined;

  const personal = useNotifications();
  const page = usePageNotifications(pageId);
  const { data: notifications, isLoading, refetch } = isPageMode ? page : personal;
  // Shared pull-to-refresh (re-probes connectivity, capped spinner). Not `isRefetching`: that is also true for background
  // refetches, which made the spinner flash on its own. The list is self-contained, so no refetch of every other query.
  const { refreshControl, refreshing } = usePullToRefresh(refetch, 0, { refetchActive: false });

  const markReadPersonal = useMarkNotificationRead();
  const markReadPage = useMarkPageNotificationRead(pageId);
  const markAllReadPersonal = useMarkAllRead();
  const markAllReadPage = useMarkAllPageNotificationsRead(pageId);
  const markRead = isPageMode ? markReadPage : markReadPersonal;
  const markAllRead = isPageMode ? markAllReadPage : markAllReadPersonal;

  const [dialog, setDialog] = useState<NotificationAction | null>(null);
  const hasUnread = notifications?.some((n) => !n.read_at);

  // Opening the list means the activity pushes in the tray have been seen.
  useEffect(() => {
    void dismissPresentedWhere((d) => d.type === "activity");
  }, []);

  const activate = useCallback(
    (n: NotificationWithActor) => {
      if (!n.read_at) markRead.mutate(n.id);
      const action = notificationAction(n);
      if (action.kind === "route") router.push(action.href as Href);
      else if (action.kind !== "none") setDialog(action);
    },
    [markRead]
  );

  // A tapped invite/credit push lands here with ?open=<notification id>: open its dialog once the list is in.
  const [handledOpen, setHandledOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!open || handledOpen === open || !notifications) return;
    setHandledOpen(open);
    const n = notifications.find((x) => x.id === open);
    if (n) activate(n);
    router.setParams({ open: undefined });
  }, [open, handledOpen, notifications, activate]);

  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        title={isPageMode ? `${identity.page.name}'s Notifications` : "Notifications"}
        right={
          hasUnread ? (
            <Pressable
              onPress={() =>
                markAllRead.mutate(undefined, {
                  onSuccess: () => void dismissPresentedWhere((d) => d.type === "activity"),
                })
              }
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text className="text-sm font-medium text-accent">Mark all read</Text>
            </Pressable>
          ) : undefined
        }
      />

      {isLoading ? (
        <Text className="py-10 text-center text-ink-muted">Loading…</Text>
      ) : (
        <FlashList showsHorizontalScrollIndicator={false}
          data={refreshing ? [] : (notifications ?? [])}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationRow n={item} onPress={activate} />}
          extraData={notifications}
          ref={onScroll.listRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListHeaderComponent={<View className="px-4"><PushPermissionCard /></View>}
          ListEmptyComponent={refreshing ? <View className="px-3"><RefreshSkeleton /></View> : <Text className="px-4 py-10 text-center text-sm text-ink-muted">Nothing yet.</Text>}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomInset }}
        />
      )}

      {dialog?.kind === "page-invite" && <PageInviteResponseModal pageId={dialog.pageId} onClose={closeDialog} />}
      {dialog?.kind === "collab-invite" && <CollaborationInviteResponseModal target={dialog.target} targetId={dialog.targetId} onClose={closeDialog} />}
      {dialog?.kind === "music-credit" && <MusicCreditResponseModal catalogueId={dialog.catalogueId} onClose={closeDialog} />}
      {dialog?.kind === "foreword-invite" && <ForewordInviteModal projectId={dialog.projectId} onClose={closeDialog} />}
      {dialog?.kind === "page-response" && <PageResponseNavigator pageId={dialog.pageId} onDone={closeDialog} />}
    </View>
  );
}
