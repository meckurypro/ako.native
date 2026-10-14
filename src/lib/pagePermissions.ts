// src/lib/pagePermissions.ts
// ============================================================
// Granular per-member permissions on a Page.
//
// Admins always have every permission (they also manage the team). A
// non-admin member only gets what the admin who invited them ticked —
// stored as page_members.permissions (jsonb). A member row with no
// stored permissions (everyone who joined before this existed) resolves
// to LEGACY_MEMBER_PERMISSIONS, i.e. exactly what a plain member could
// already do, so nothing changes for them until an admin edits it.
//
// The server enforces the same keys (has_page_permission() + triggers +
// the create-page-post / create-page-comment edge functions); this file
// only drives what the UI offers.
// ============================================================

export const PAGE_PERMISSION_KEYS = [
  "create_posts",
  "create_projects",
  "comment",
  "edit_page",
  "reply_messages",
] as const;

export type PagePermissionKey = (typeof PAGE_PERMISSION_KEYS)[number];
export type PagePermissions = Record<PagePermissionKey, boolean>;

export const PAGE_PERMISSION_META: { key: PagePermissionKey; label: string; description: string }[] = [
  { key: "create_posts", label: "Create posts", description: "Publish, schedule and save drafts as the page" },
  { key: "create_projects", label: "Create projects", description: "Start and publish projects as the page" },
  { key: "comment", label: "Comment & react", description: "Comment on posts and react as the page" },
  { key: "edit_page", label: "Edit page details", description: "Change the name, tagline, bio, photo and links" },
  { key: "reply_messages", label: "Reply to messages", description: "Answer people in the page inbox" },
];

export const ALL_PAGE_PERMISSIONS: PagePermissions = {
  create_posts: true,
  create_projects: true,
  comment: true,
  edit_page: true,
  reply_messages: true,
};

// What a non-admin member could already do before permissions existed.
export const LEGACY_MEMBER_PERMISSIONS: PagePermissions = {
  create_posts: false,
  create_projects: true,
  comment: true,
  edit_page: false,
  reply_messages: true,
};

export function resolvePagePermissions(
  isAdmin: boolean,
  raw: Partial<Record<string, unknown>> | null | undefined
): PagePermissions {
  if (isAdmin) return { ...ALL_PAGE_PERMISSIONS };
  const out = { ...LEGACY_MEMBER_PERMISSIONS };
  if (raw && typeof raw === "object") {
    for (const key of PAGE_PERMISSION_KEYS) {
      if (typeof raw[key] === "boolean") out[key] = raw[key] as boolean;
    }
  }
  return out;
}

export function samePermissions(a: PagePermissions, b: PagePermissions): boolean {
  return PAGE_PERMISSION_KEYS.every((k) => a[k] === b[k]);
}
