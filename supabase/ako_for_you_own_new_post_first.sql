-- Applied to "Ako Temp" (khxrbutzwkhrqzuolfvp) as migration `for_you_own_new_post_first`.
-- For You: a person's own brand-new post is always in their For You, at the very top.
--
-- Why: get_ranked_feed only returns posts that match a signal (following / topic / social / contact /
-- performance / promoted). A zero-engagement post by the viewer matches none of them unless it happens to share a
-- topic, so after publishing, the poster's own For You did not contain their post at all, and get_page_ranked_feed
-- excludes a page's own posts by design. The apps papered over this with a client-side pin that only lasted until the
-- Feed remounted. This makes the server agree with the pin.
--
-- Behaviour:
--   * get_ranked_feed: the viewer's own personal (non-Page) published posts created in the last 30 minutes are
--     candidates regardless of topic/cooldown, with a boost (w_own_new) that outranks every other signal, so they
--     sort first. match_reason = 'own_new_post'. Everything else is unchanged.
--   * get_page_ranked_feed: a page's own posts created in the last 30 minutes are included (they are otherwise
--     excluded) and sorted first.
--   * Scheduled posts keep their original created_at when the cron publishes them, so they are NOT boosted.
--
-- The 30 minute window is own_post_window in get_ranked_feed and the interval literals in get_page_ranked_feed.

CREATE OR REPLACE FUNCTION public.get_ranked_feed(p_viewer_id uuid, p_limit integer DEFAULT 15, p_offset integer DEFAULT 0)
 RETURNS TABLE(post_id uuid, score numeric, match_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w_following   constant numeric := 3;
  w_topic       constant numeric := 2;
  w_social      constant numeric := 2;
  w_performance constant numeric := 1.5;
  w_promoted    constant numeric := 2;
  -- Contact Graph weight: a real, legitimate relationship, but a
  -- broader/weaker tie on average than a mutual follow or a direct
  -- social-proof engagement — set alongside w_performance rather than
  -- at w_following/w_social strength so shared-context discovery can
  -- surface without outweighing the feed's existing intentional
  -- signals. A tuning knob, not a structural one.
  w_contact     constant numeric := 1.5;
  -- The viewer's own just-published post: far above any other signal so it always sorts first.
  w_own_new     constant numeric := 1000;
  own_post_window constant interval := interval '30 minutes';
  gravity       constant numeric := 1.8;
  reserve_cooldown constant interval := interval '5 hours';
  performance_window constant interval := interval '72 hours';
  performance_pool_size constant integer := 30;
  author_cap constant integer := 3;
BEGIN

  p_viewer_id := auth.uid();

RETURN QUERY

WITH
following AS (
  SELECT following_id AS id FROM public.follows WHERE follower_id = p_viewer_id
),
followers AS (
  SELECT follower_id AS id FROM public.follows WHERE following_id = p_viewer_id
),
connections AS (
  SELECT id FROM following
  UNION
  SELECT id FROM followers
),
excluded_authors AS (
  SELECT blocked_id AS id FROM public.blocked_users WHERE blocker_id = p_viewer_id
  UNION
  SELECT blocker_id AS id FROM public.blocked_users WHERE blocked_id = p_viewer_id
  UNION
  SELECT muted_id AS id FROM public.muted_users WHERE muter_id = p_viewer_id
),
my_topics AS (
  SELECT interest_id FROM public.user_interests WHERE user_id = p_viewer_id
),
-- Contact Graph: reuses public.get_contact_ids (see that function for
-- source-by-source detail: chat, shared Room, shared Project
-- access, accepted collaboration, shared Page team). Already excludes
-- blocked pairs internally; excluded_authors below still applies too,
-- since get_ranked_feed's own mute/block exclusion must keep governing
-- every candidate regardless of which CTE produced it.
contact_ids AS (
  SELECT contact_id FROM public.get_contact_ids(p_viewer_id)
),
on_cooldown AS (
  SELECT post_views.post_id FROM public.post_views
  WHERE user_id = p_viewer_id
    AND viewed_at > now() - reserve_cooldown
),
eligible_posts AS (
  SELECT p.*
  FROM public.posts p
  WHERE p.is_deleted = false
    AND p.is_archived = false
    AND (p.status = 'published' OR p.author_id = p_viewer_id)
    AND p.author_id NOT IN (SELECT id FROM excluded_authors)
    AND p.id NOT IN (SELECT on_cooldown.post_id FROM on_cooldown)
    AND (
      p.visibility = 'public'
      OR (p.visibility = 'followers_only' AND p.author_id IN (SELECT id FROM following))
      OR p.author_id = p_viewer_id
    )
),
following_matches AS (
  SELECT id AS post_id, true AS is_following, false AS is_topic, false AS is_social, false AS is_performance, false AS is_promoted, false AS is_contact
  FROM eligible_posts
  WHERE author_id IN (SELECT id FROM following)
),
topic_matches AS (
  SELECT DISTINCT ep.id AS post_id, false, true, false, false, false, false
  FROM eligible_posts ep
  JOIN public.post_topics pt ON pt.post_id = ep.id
  WHERE pt.interest_id IN (SELECT interest_id FROM my_topics)
),
social_matches AS (
  SELECT DISTINCT ep.id AS post_id, false, false, true, false, false, false
  FROM eligible_posts ep
  WHERE EXISTS (
    SELECT 1 FROM public.reactions r
    WHERE r.post_id = ep.id AND r.user_id IN (SELECT id FROM connections)
      AND r.created_at > now() - interval '14 days'
  ) OR EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.post_id = ep.id AND c.author_id IN (SELECT id FROM connections)
      AND c.is_deleted = false AND c.created_at > now() - interval '14 days'
  ) OR EXISTS (
    SELECT 1 FROM public.gifts g
    WHERE g.post_id = ep.id AND g.sender_id IN (SELECT id FROM connections)
      AND g.created_at > now() - interval '14 days'
  )
),
-- The Contact Graph's own candidate path: mirrors social_matches
-- exactly (same 14-day engagement-recency window, same reaction/
-- comment/gift signals) but additionally treats *authorship* by a
-- contact as a match — following_matches' equivalent, since a contact
-- is not necessarily someone the viewer follows. This is the canonical
-- "Emeka publishes Post X ... eligible for Uche's For You" path.
contact_matches AS (
  SELECT DISTINCT ep.id AS post_id, false, false, false, false, false, true
  FROM eligible_posts ep
  WHERE ep.author_id IN (SELECT contact_id FROM contact_ids)
  OR EXISTS (
    SELECT 1 FROM public.reactions r
    WHERE r.post_id = ep.id AND r.user_id IN (SELECT contact_id FROM contact_ids)
      AND r.created_at > now() - interval '14 days'
  ) OR EXISTS (
    SELECT 1 FROM public.comments c
    WHERE c.post_id = ep.id AND c.author_id IN (SELECT contact_id FROM contact_ids)
      AND c.is_deleted = false AND c.created_at > now() - interval '14 days'
  ) OR EXISTS (
    SELECT 1 FROM public.gifts g
    WHERE g.post_id = ep.id AND g.sender_id IN (SELECT contact_id FROM contact_ids)
      AND g.created_at > now() - interval '14 days'
  )
),
performance_candidates AS (
  SELECT ep.id AS perf_post_id,
         public.compute_weighted_engagement(
           ep.like_count, ep.dislike_count, ep.support_count, ep.disagree_count,
           ep.pushback_count, ep.gift_count, ep.share_count,
           (SELECT count(*) FROM public.posts rp WHERE rp.reshared_post_id = ep.id)::integer,
           (SELECT count(*) FROM public.bookmarks b WHERE b.post_id = ep.id)::integer
         ) AS perf_score
  FROM eligible_posts ep
  WHERE ep.created_at > now() - performance_window
  ORDER BY perf_score DESC
  LIMIT performance_pool_size
),
performance_matches AS (
  SELECT pc.perf_post_id AS post_id, false AS is_following, false AS is_topic, false AS is_social, true AS is_performance, false AS is_promoted, false AS is_contact
  FROM performance_candidates pc
),
promo_matches AS (
  SELECT pr.post_id, false AS is_following, false AS is_topic, false AS is_social, false AS is_performance, true AS is_promoted, false AS is_contact
  FROM public.promotions pr
  JOIN public.posts p ON p.id = pr.post_id
  WHERE pr.status = 'approved'
    AND now() BETWEEN pr.starts_at AND pr.ends_at
    AND p.is_deleted = false
    AND p.is_archived = false
    AND p.status = 'published'
    AND p.author_id NOT IN (SELECT id FROM excluded_authors)
    AND pr.post_id NOT IN (SELECT on_cooldown.post_id FROM on_cooldown)
    AND (
      pr.interest_ids = '{}'::uuid[]
      OR EXISTS (SELECT 1 FROM my_topics mt WHERE mt.interest_id = ANY(pr.interest_ids))
    )
),
token_matches AS (
  SELECT gpc.post_id, gpc.gifter_id AS creator_id
  FROM public.get_gift_priority_candidates(p_viewer_id) gpc
),
-- The viewer's own post, published in the last own_post_window. Read straight from posts (not eligible_posts) so
-- the 5h view cooldown can never hide it, and added to final_candidates below so it also bypasses the
-- prioritized-post substitution. Personal posts only: a post published in Page mode belongs to the page's feed.
own_new_posts AS (
  SELECT p.id AS post_id
  FROM public.posts p
  WHERE p.author_id = p_viewer_id
    AND p.posted_as_page_id IS NULL
    AND p.status = 'published'
    AND p.is_deleted = false
    AND p.is_archived = false
    AND p.created_at > now() - own_post_window
),
raw_candidates AS (
  SELECT m.post_id,
         bool_or(is_following) AS is_following,
         bool_or(is_topic) AS is_topic,
         bool_or(is_social) AS is_social,
         bool_or(is_performance) AS is_performance,
         bool_or(is_promoted) AS is_promoted,
         bool_or(is_contact) AS is_contact
  FROM (
    SELECT * FROM following_matches
    UNION ALL SELECT * FROM topic_matches
    UNION ALL SELECT * FROM social_matches
    UNION ALL SELECT * FROM performance_matches
    UNION ALL SELECT * FROM promo_matches
    UNION ALL SELECT * FROM contact_matches
  ) m
  GROUP BY m.post_id
),
candidates_with_author AS (
  SELECT rc.*, p.author_id
  FROM raw_candidates rc
  JOIN public.posts p ON p.id = rc.post_id
),
cage_status AS (
  SELECT pr.creator_id, pr.post_id,
    EXISTS (
      SELECT 1 FROM public.reactions r WHERE r.post_id = pr.post_id AND r.user_id = p_viewer_id
      UNION ALL
      SELECT 1 FROM public.comments c WHERE c.post_id = pr.post_id AND c.author_id = p_viewer_id AND c.is_deleted = false
      UNION ALL
      SELECT 1 FROM public.gifts g WHERE g.post_id = pr.post_id AND g.sender_id = p_viewer_id
      UNION ALL
      SELECT 1 FROM public.bookmarks b WHERE b.post_id = pr.post_id AND b.user_id = p_viewer_id
      UNION ALL
      SELECT 1 FROM public.posts rp WHERE rp.reshared_post_id = pr.post_id AND rp.author_id = p_viewer_id
    ) AS viewer_has_engaged
  FROM public.prioritized_posts pr
  WHERE pr.prioritized_date = CURRENT_DATE
),
substituted AS (
  SELECT cwa.post_id, cwa.is_following, cwa.is_topic, cwa.is_social, cwa.is_performance, cwa.is_promoted, cwa.is_contact, cwa.author_id
  FROM candidates_with_author cwa
  LEFT JOIN cage_status cs ON cs.creator_id = cwa.author_id
  WHERE cs.creator_id IS NULL OR cs.viewer_has_engaged = true
  UNION ALL
  SELECT cs.post_id, bool_or(cwa.is_following), bool_or(cwa.is_topic), bool_or(cwa.is_social), bool_or(cwa.is_performance), bool_or(cwa.is_promoted), bool_or(cwa.is_contact), cs.creator_id
  FROM cage_status cs
  JOIN candidates_with_author cwa ON cwa.author_id = cs.creator_id
  GROUP BY cs.post_id, cs.creator_id
),
final_candidates AS (
  SELECT merged.post_id,
         bool_or(is_following) AS is_following,
         bool_or(is_topic) AS is_topic,
         bool_or(is_social) AS is_social,
         bool_or(is_performance) AS is_performance,
         bool_or(is_promoted) AS is_promoted,
         bool_or(is_contact) AS is_contact,
         bool_or(is_gift_triggered) AS is_gift_triggered,
         bool_or(is_own_new) AS is_own_new
  FROM (
    SELECT substituted.post_id, is_following, is_topic, is_social, is_performance, is_promoted, is_contact, false AS is_gift_triggered, false AS is_own_new FROM substituted
    UNION ALL
    SELECT tm.post_id, false, false, false, false, false, false, true AS is_gift_triggered, false AS is_own_new
    FROM token_matches tm
    UNION ALL
    SELECT onp.post_id, false, false, false, false, false, false, false AS is_gift_triggered, true AS is_own_new
    FROM own_new_posts onp
  ) merged
  GROUP BY merged.post_id
),
scored AS (
  SELECT
    fc.post_id,
    p.author_id,
    fc.is_following,
    fc.is_topic,
    fc.is_social,
    fc.is_performance,
    fc.is_promoted,
    fc.is_contact,
    fc.is_gift_triggered,
    fc.is_own_new,
    public.compute_weighted_engagement(
      p.like_count, p.dislike_count, p.support_count, p.disagree_count,
      p.pushback_count, p.gift_count, p.share_count,
      (SELECT count(*) FROM public.posts rp WHERE rp.reshared_post_id = fc.post_id)::integer,
      (SELECT count(*) FROM public.bookmarks b WHERE b.post_id = fc.post_id)::integer
    ) AS weighted_engagement,
    GREATEST(
      p.created_at,
      COALESCE((SELECT max(created_at) FROM public.reactions r WHERE r.post_id = fc.post_id), p.created_at),
      COALESCE((SELECT max(created_at) FROM public.comments c WHERE c.post_id = fc.post_id AND c.is_deleted = false), p.created_at),
      COALESCE((SELECT max(created_at) FROM public.gifts g WHERE g.post_id = fc.post_id), p.created_at),
      COALESCE((SELECT max(created_at) FROM public.bookmarks b WHERE b.post_id = fc.post_id), p.created_at),
      COALESCE((SELECT max(rp.created_at) FROM public.posts rp WHERE rp.reshared_post_id = fc.post_id), p.created_at)
    ) AS last_engagement_at
  FROM final_candidates fc
  JOIN public.posts p ON p.id = fc.post_id
),
with_score AS (
  SELECT
    sc.post_id,
    sc.author_id,
    sc.match_reason,
    (
      (sc.is_following::int * w_following)
      + (sc.is_topic::int * w_topic)
      + (sc.is_social::int * w_social)
      + (sc.is_performance::int * w_performance)
      + (sc.is_promoted::int * w_promoted)
      + (sc.is_contact::int * w_contact)
      + (sc.is_own_new::int * w_own_new)
      + (sc.weighted_engagement / POWER(
           EXTRACT(EPOCH FROM (now() - sc.last_engagement_at)) / 3600.0 + 2,
           gravity
         ))
    ) AS score
  FROM (
    SELECT
      s.*,
      CASE
        WHEN s.is_own_new THEN 'own_new_post'
        WHEN s.is_following THEN 'following'
        WHEN s.is_topic THEN 'topic'
        WHEN s.is_social THEN 'social'
        WHEN s.is_contact THEN 'contact'
        WHEN s.is_performance THEN 'discover'
        WHEN s.is_promoted THEN 'promoted'
        WHEN s.is_gift_triggered THEN 'gift_prioritized'
        ELSE 'prioritized'
      END AS match_reason
    FROM scored s
  ) sc
),
capped AS (
  SELECT ws.*,
         row_number() OVER (PARTITION BY ws.author_id ORDER BY ws.score DESC) AS author_rank
  FROM with_score ws
)
SELECT c.post_id, c.score, c.match_reason
FROM capped c
WHERE c.author_rank <= author_cap
ORDER BY c.score DESC
LIMIT p_limit OFFSET p_offset;

END;
$function$;

-- Page mode For You: a page's own posts are normally excluded from its own feed; the last 30 minutes of them are let
-- back in and sorted first, so whoever just published as the page sees it at the top.
CREATE OR REPLACE FUNCTION public.get_page_ranked_feed(p_page_id uuid, p_limit integer DEFAULT 15, p_offset integer DEFAULT 0)
 RETURNS TABLE(post_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id as post_id
  from public.posts p
  left join lateral (
    select count(*) as topic_overlap
    from public.post_topics pt
    join public.page_interests pi on pi.interest_id = pt.interest_id
    where pt.post_id = p.id and pi.page_id = p_page_id
  ) topics on true
  where p.is_deleted = false
    and p.visibility = 'public'
    and p.is_archived = false
    and p.status = 'published'
    and (
      coalesce(p.posted_as_page_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_page_id
      or p.created_at > now() - interval '30 minutes'
    )
  order by
    (coalesce(p.posted_as_page_id = p_page_id, false) and p.created_at > now() - interval '30 minutes') desc,
    topics.topic_overlap desc,
    (
      (p.like_count + p.support_count + p.comment_count * 2 + p.gift_count * 3)
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5)
    ) desc,
    p.created_at desc
  limit p_limit offset p_offset;
$function$;
