// src/screens/Notifications.tsx
// The notification list for the active identity (personal, or the Page you're acting as), plus the
// contextual push-permission ask. Rows lead to the same place the matching push does
// (lib/notificationRoute.ts); invites and credits open a response dialog.
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  AtSign,
  Banknote,
  Bell,
  Briefcase,
  Coins,
  Gift,
  Handshake,
  Heart,
  Megaphone,
  MessageCircle,
  Music2,
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
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";

import { useBottomNavInset } from "@/components/nav/BottomNav";
import { useChromeScroll } from "@/components/nav/ChromeProvider";
import { CollaborationInviteResponseModal, MusicCreditResponseModal, PageInviteResponseModal } from "@/components/notifications/ResponseModals";
import { PushPermissionCard } from "@/components/notifications/PushPermissionCard";
import { AkoMark } from "@/components/ui/AkoMark";
import { Avatar } from "@/components/ui/Avatar";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useMarkAllRead, useMarkNotificationRead, useNotifications, type NotificationWithActor } from "@/hooks/useNotifications";
import { useMarkAllPageNotificationsRead, useMarkPageNotificationRead, usePageNotifications } from "@/hooks/usePageNotifications";
import { useActiveIdentity, usePageById } from "@/hooks/usePages";
import { notificationAction, type NotificationAction } from "@/lib/notificationRoute";
import { dismissPresentedWhere } from "@/lib/push";

const TYPE_CONFIG: Record<string, { icon: LucideIcon; verb: string }> = {
  like: { icon: Heart, verb: "liked your post" },
  dislike: { icon: ThumbsDown, verb: "disliked your post" },
  support: { icon: Handshake, verb: "supported your post" },
  disagree: { icon: XCircle, verb: "disagreed with your post" },
  pushback: { icon: Handshake, verb: "pushed back on your post" },
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
  post_tagged: { icon: Tag, verb: "tagged you in a post" },
  project_tagged: { icon: Tag, verb: "tagged you in a project" },
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

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

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
      className={`flex-row items-start gap-3 border-b border-border py-3.5 ${unread ? "-mx-4 bg-highlight px-4" : ""}`}
    >
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
          {showActor && <Text className="mr-1 text-sm font-medium text-ink">{n.actor!.display_name}</Text>}
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
  const { data: notifications, isLoading, refetch, isRefetching } = isPageMode ? page : personal;

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
        <FlashList
          data={notifications ?? []}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationRow n={item} onPress={activate} />}
          extraData={notifications}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListHeaderComponent={<PushPermissionCard />}
          ListEmptyComponent={<Text className="py-10 text-center text-sm text-ink-muted">Nothing yet.</Text>}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
        />
      )}

      {dialog?.kind === "page-invite" && <PageInviteResponseModal pageId={dialog.pageId} onClose={closeDialog} />}
      {dialog?.kind === "collab-invite" && <CollaborationInviteResponseModal target={dialog.target} targetId={dialog.targetId} onClose={closeDialog} />}
      {dialog?.kind === "music-credit" && <MusicCreditResponseModal catalogueId={dialog.catalogueId} onClose={closeDialog} />}
      {dialog?.kind === "page-response" && <PageResponseNavigator pageId={dialog.pageId} onDone={closeDialog} />}
    </View>
  );
}
