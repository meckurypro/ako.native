// src/lib/notificationRoute.ts
// Where does a notification lead? One pure function shared by the Notifications list (row press) and
// the push-notification tap handler, so a push and the row it mirrors always open the same place.
// Mirrors the web's notificationLink() + the per-type invite modals, translated to app routes
// (a comment notification opens that comment's own page, /post/<postId>/comment/<id>).

export interface RoutableNotification {
  id: string;
  type: string;
  target_type: string | null;
  target_id: string | null;
  actor: { username: string } | null;
  comment_post_id?: string | null;
  project_type?: string | null;
}

/** Project types whose detail lives on a dedicated screen instead of /projects/:id. */
const PROJECT_TYPE_ROUTE: Record<string, (id: string) => string> = {
  room: (id) => `/rooms/${id}`,
  course: (id) => `/courses/${id}`,
  book: (id) => `/books/${id}`,
  meeting: (id) => `/meetings/${id}`,
};

export type NotificationAction =
  | { kind: "route"; href: string }
  | { kind: "page-invite"; pageId: string }
  | { kind: "page-response"; pageId: string }
  | { kind: "collab-invite"; target: "post" | "project"; targetId: string }
  | { kind: "music-credit"; catalogueId: string }
  | { kind: "foreword-invite"; projectId: string }
  | { kind: "none" };

export function notificationAction(n: RoutableNotification): NotificationAction {
  if (n.type === "page_role_invite" && n.target_id) return { kind: "page-invite", pageId: n.target_id };
  // accepted/declined: an invitee answered. approved/rejected: an admin decided on a role you were waiting on.
  // All four land on the page's team roster. (page_role_requested is for admins, who review on the web.)
  if (
    (n.type === "page_role_accepted" || n.type === "page_role_declined" || n.type === "page_role_approved" || n.type === "page_role_rejected") &&
    n.target_id
  ) {
    return { kind: "page-response", pageId: n.target_id };
  }
  if (n.type === "collaboration_invite" && n.target_id && (n.target_type === "post" || n.target_type === "project")) {
    return { kind: "collab-invite", target: n.target_type, targetId: n.target_id };
  }
  if (n.type === "music_credit_request" && n.target_id) return { kind: "music-credit", catalogueId: n.target_id };
  // A foreword invite needs a real answer (read, decline or write), so it opens the response dialog.
  if (n.type === "foreword_invite" && n.target_id) return { kind: "foreword-invite", projectId: n.target_id };
  // Creator-side foreword notices land on the project page with the Forewords panel open, where the decision is made.
  if ((n.type === "foreword_submitted" || n.type === "foreword_declined") && n.target_id) {
    return { kind: "route", href: `/projects/${n.target_id}?forewords=1` };
  }

  const href = notificationLink(n);
  return href ? { kind: "route", href } : { kind: "none" };
}

/** The plain navigation target, or null when the notification doesn't lead anywhere. */
export function notificationLink(n: RoutableNotification): string | null {
  if (n.type === "follow_request") return "/requests";
  // A join request is answered in the room's settings panel, so open it there.
  if (n.type === "room_join_request" && n.target_id) return `/rooms/${n.target_id}?settings=1`;
  if (n.target_type === "post" && n.target_id) return `/post/${n.target_id}`;
  if (n.target_type === "project" && n.target_id) {
    const route = n.project_type ? PROJECT_TYPE_ROUTE[n.project_type] : undefined;
    return route ? route(n.target_id) : `/projects/${n.target_id}`;
  }
  // A visitor's inquiry on a Custom Page opens that page's control room (its messages live there).
  if (n.target_type === "custom_page" && n.target_id) return `/me/custom-pages/${n.target_id}`;
  if (n.target_type === "promotion" || n.target_type === "withdrawal") return "/wallet";
  if (n.target_type === "comment" && n.target_id) {
    return n.comment_post_id ? `/post/${n.comment_post_id}/comment/${n.target_id}` : null;
  }
  if (n.target_type === "conversation" && n.target_id) return `/messages/${n.target_id}`;
  if (n.target_type === "profile" && n.actor) return `/profile/${n.actor.username}`;
  return null;
}

/** What a tapped push should do. Activity pushes only carry a notification id (no target — by design,
 *  so nothing sensitive sits in the OS tray), so the caller resolves the row first. */
export type PushTapData =
  | { type: "message"; conversationId: string }
  | { type: "activity"; notificationId: string; source: "user" | "page"; notificationType?: string }
  | null;

/** Where a tapped chat push leads: the inbox (it resolves to the Page inbox when acting as a Page). */
export const INBOX_ROUTE = "/inbox";

/** Where an activity push leads when its row can't be read (offline, deleted): the closest screen for its type. */
export function fallbackRouteForType(type: string | undefined): string {
  switch (type) {
    case "follow_request":
      return "/requests";
    case "give_back_received":
    case "project_purchased":
    case "affiliate_commission_earned":
    case "withdrawal_status":
    case "promotion_approved":
    case "promotion_declined":
      return "/wallet";
    default:
      return "/notifications";
  }
}

export function parsePushData(data: unknown): PushTapData {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === "message" && typeof d.conversationId === "string") return { type: "message", conversationId: d.conversationId };
  if (d.type === "activity" && typeof d.notificationId === "string") {
    return {
      type: "activity",
      notificationId: d.notificationId,
      source: d.source === "page" ? "page" : "user",
      notificationType: typeof d.notificationType === "string" ? d.notificationType : undefined,
    };
  }
  return null;
}
