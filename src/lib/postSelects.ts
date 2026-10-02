// Shared PostgREST select fragments for post queries.
//
// PAGE_SELECT joins the page a post was published as (null on personal
// posts). PostCard swaps its byline to the page whenever this is
// present, so EVERY query that feeds a PostCard must include it —
// otherwise a page post silently falls back to showing the posting
// team member's own name and handle (Saved, Liked, History, search and
// post detail all did before this was shared).
export const PAGE_SELECT = `posted_as_page:pages(id, username, name, avatar_url, page_type, is_verified, tagline)`;
