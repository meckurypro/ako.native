// Shared PostgREST select fragments for post queries.
//
// PAGE_SELECT joins the page a post was published as (null on personal
// posts). PostCard swaps its byline to the page whenever this is
// present, so EVERY query that feeds a PostCard must include it —
// otherwise a page post silently falls back to showing the posting
// team member's own name and handle (Saved, Liked, History, search and
// post detail all did before this was shared).
export const PAGE_SELECT = `posted_as_page:pages(id, username, name, avatar_url, page_type, is_verified, tagline)`;

// The tagged project's card-preview fields only (not `*`): thumbnail, title, type, price, status, owner byline —
// exactly what TaggedProjectEmbed renders. Every query that feeds a PostCard must include it, or the project
// card silently disappears on that surface (post detail, reached from a notification, used to omit it).
export const TAGGED_PROJECT_SELECT = `tagged_project:projects!posts_tagged_project_id_fkey(id, title, thumbnail_url, project_type, price_usd, promo_price_usd, status, slug, owner:profiles!projects_owner_id_fkey(username, display_name), posted_as_page:pages(username))`;
