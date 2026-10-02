// src/types/database.ts
// Hand-maintained types matching the SQL schema (00_foundation.sql
// through 31_onboarding_recommendations.sql). Once the schema
// stabilizes, consider generating these automatically via:
//   npx supabase gen types typescript --project-id <ref> > database.ts
// For now, hand-maintained keeps us honest about what's actually built
// vs. planned.

export type Tier = "newcomer" | "contributor" | "publisher" | "host" | "creator_business";

export interface Role {
  id: string;
  label: string;
  sort_order: number;
}

// A single job/hobby tag attached to a profile, in display order.
export interface ProfileRole {
  role_id: string;
  label: string;
  position: number; // 1-3
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  website_url: string | null;
  tier: Tier;
  follower_count: number;
  following_count: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  is_private: boolean;
  last_seen_at: string | null;
  hide_followers_list: boolean;
  hide_following_list: boolean;
  // Null = acting as yourself. Set = you're currently acting as one of
  // the pages you have an active role on (see /areas/account-mode).
  active_page_id: string | null;
  // Added in 31_onboarding_recommendations.sql. Backfilled to true for
  // every profile that existed before that migration ran — only
  // genuinely new signups start out false. See useOnboardingStatus.
  onboarding_completed: boolean;
  // Incubation Account Review & Access Gate — never set directly by
  // clients (see admin_approve_account() and the profiles update
  // trigger). 'approved' for every profile that existed before this
  // migration ran; only new signups start out 'pending'.
  account_status: "pending" | "approved" | "declined" | "suspended";
  reviewed_at: string | null;
  reviewed_by: string | null;
  // Admin-assigned public identity badge — independent of
  // account_status/KYC/founding status. Never set directly by
  // clients (see admin_set_verified()/admin_bulk_set_verified()).
  is_verified: boolean;
}

// ------------------------------------------------------------
// Account mode: organisation/brand pages, and the role-based
// membership that lets a personal account act as one.
// ------------------------------------------------------------

export type PageType = "organization" | "brand" | "product";
export type PageMemberStatus = "invited" | "active" | "declined" | "removed";

export interface Page {
  id: string;
  page_type: PageType;
  name: string;
  username: string;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  website_url: string | null;
  category_id: string | null;
  parent_organization_id: string | null;
  created_by: string;
  is_verified: boolean;
  is_active: boolean;
  follower_count: number;
  created_at: string;
  updated_at: string;
}

// Enough of a page to render a byline/avatar anywhere a page can
// appear as an author (post card, comment, notification) — mirrors
// AuthorSummary's role for profiles.
export type PageSummary = Pick<Page, "id" | "username" | "name" | "avatar_url" | "page_type" | "is_verified"> & {
  // Shown under the page name on post bylines (instead of the posting
  // team member's handle). Optional so selects that don't need it —
  // notifications, invites — stay valid.
  tagline?: string | null;
};

export interface PageMember {
  id: string;
  page_id: string;
  user_id: string;
  role_label: string;
  is_admin: boolean;
  status: PageMemberStatus;
  invited_by: string | null;
  invited_at: string;
  responded_at: string | null;
  created_at: string;
}

export interface PageMemberWithProfile extends PageMember {
  profile: Pick<Profile, "id" | "username" | "display_name" | "avatar_url">;
}

// A page in the "pages I can switch into" list — the page plus my own
// membership row on it.
export interface PageWithMyMembership extends Page {
  my_role_label: string;
  my_is_admin: boolean;
}

// A pending invite, joined with enough of the page to render it.
export interface PendingPageInvite extends PageMember {
  page: PageSummary;
}

// One line under a personal profile's name, e.g. "Graphics Designer at
// PromptIQ" — computed from an active page_members row, not stored.
export interface PageAffiliation {
  page_id: string;
  page_username: string;
  page_name: string;
  role_label: string;
}

// What "who am I posting/browsing as right now" resolves to.
export type ActiveIdentity =
  | { mode: "personal" }
  | { mode: "page"; page: Page; role_label: string; is_admin: boolean };

export interface ProfileWithRoles extends Profile {
  roles: ProfileRole[]; // 0-3, ordered by position
}

// Enough of a profile to render an author byline anywhere in the app
// (post card, comment, message, notification).
export type AuthorSummary = Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "tier" | "is_private" | "is_verified"> & {
  roles: ProfileRole[];
};

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Interest {
  id: string;
  category_id: string | null;
  name: string;
  is_active: boolean;
}

export type Stance = "support" | "disagree" | "pushback";

export interface Post {
  id: string;
  author_id: string;
  heading: string | null;
  // Optional named palette key for the heading's color — see
  // src/lib/headingColors.ts for the fixed set of valid keys and
  // their per-theme hex values. null = the original single default
  // heading color (--color-post-header), same as every post created
  // before this field existed.
  heading_color: string | null;
  content: string;
  media_urls: string[];
  category_id: string | null;
  visibility: "public" | "followers_only";
  like_count: number;
  dislike_count: number;
  share_count: number;
  support_count: number;
  disagree_count: number;
  pushback_count: number;
  gift_count: number;
  comment_count: number;
  is_deleted: boolean;
  is_archived: boolean;
  edited_at: string | null;
  created_at: string;
  // Set when this post is a reshare or quote of another post.
  // reshared_post_id set + content === "" → plain reshare (looks like the
  // original, badge instead of the usual comment/share corner).
  // reshared_post_id set + content !== "" → quote (own post, original
  // embedded as a card underneath the caption).
  reshared_post_id: string | null;
  // Set when this post was published in Page mode — author_id is still
  // the human who posted it, but display/attribution should prefer the
  // page (see posted_as_page below) whenever this is non-null.
  posted_as_page_id: string | null;
  // Requires supabase-fixes/add_post_drafts_and_scheduling.sql —
  // confirmed already applied to the live DB (posts_status_check /
  // posts_scheduled_for_matches_status both exist there), but this
  // type-side addition had gone missing from a prior merge — restored
  // here. See useMyDraftPosts/useMyScheduledPosts in usePosts.ts.
  status?: "draft" | "scheduled" | "published";
  scheduled_for?: string | null;
  // Optional soundtrack layer — see src/types/music.ts and the
  // music_catalogue_v1 migration. Always a currently-published
  // catalogue entry when non-null (enforced server-side by the
  // posts_validate_music_catalogue trigger).
  music_catalogue_id?: string | null;
}

// Joined shape used when rendering a feed card — the post plus
// enough author info to render without a separate fetch per post.
export interface PostWithAuthor extends Post {
  author: AuthorSummary;
  // Present (non-null) when posted_as_page_id is set — the byline
  // should show this page's name/avatar instead of `author`'s.
  posted_as_page?: PageSummary | null;
  // Embedded original when this post is a reshare/quote. Absent (undefined)
  // when not fetched; null when reshared_post_id points at nothing fetchable
  // (shouldn't happen); RepostSource itself carries is_deleted/is_archived
  // so the UI can render the "no longer available" state.
  reshared_post?: RepostSource | null;
}

// One level deep only — the embedded original never carries its own
// reshared_post, so a repost-of-a-repost just links to the immediate
// parent rather than recursing. Carries every Post field (not just
// display ones) so a plain reshare can engage against the original's
// own id/counts, matching standard retweet behavior.
export type RepostSource = Omit<Post, "reshared_post_id"> & { author: AuthorSummary };

export function isPlainReshare(post: Pick<Post, "reshared_post_id" | "content">): boolean {
  return !!post.reshared_post_id && post.content.trim() === "";
}

export function isQuote(post: Pick<Post, "reshared_post_id" | "content">): boolean {
  return !!post.reshared_post_id && post.content.trim() !== "";
}

export interface Comment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  content: string;
  stance: Stance | null;
  like_count: number;
  dislike_count: number;
  reply_count: number;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
}

export type ReactionType = "like" | "dislike" | "share";

export interface GiftType {
  id: string;
  name: string;
  icon_url: string | null;
  cost_usd: number;
  is_active: boolean;
  sort_order: number;
}

export interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  pending_balance: number;
  currency: "USD";
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

export interface MessageUserState {
  message_id: string;
  starred_at: string | null;
  pinned_at: string | null;
}

export interface UserEmojiUsage {
  user_id: string;
  emoji: string;
  use_count: number;
  last_used_at: string;
}

export type ExchangeRateKind = "deposit" | "withdrawal";

export interface ExchangeRate {
  kind: ExchangeRateKind;
  rate: number;
  updated_at: string;
  updated_by: string | null;
}

export interface Deposit {
  id: string;
  user_id: string;
  amount_usd: number;
  amount_ngn: number;
  exchange_rate: number;
  paystack_reference: string;
  status: "pending" | "success" | "failed";
  wallet_transaction_id: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface PayoutBatch {
  id: string;
  run_date: string;
  status: "processing" | "completed";
  total_usd: number;
  total_ngn: number;
  withdrawal_count: number;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
}
