-- AKỌ — Edit windows + verified-badge posting streak
--
-- 1. Posts: editable for exactly 7 days (was 15 minutes).
-- 2. Comments: editable until ANYONE engages (reaction, reply or gift).
--    Always deletable by their author. Content edits must go through the
--    update-comment edge function (moderation); direct client writes to
--    `content` are refused. Soft-deleting/restoring a comment now keeps
--    post.comment_count / parent.reply_count / stance totals in step.
-- 3. Verified badge: profiles.is_verified stays the admin-assigned status
--    (never touched here). The badge only SHOWS while the user has posted
--    at least once in each of the last four 7-day windows. Admins are exempt.
--    Computed live, no cron: PostgREST computed columns `badge_visible`
--    and `badge_streak` on profiles.

-- ---------------------------------------------------------------
-- 1. Posts: 7-day edit window
-- ---------------------------------------------------------------
create or replace function public.enforce_post_edit_window()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if (
    NEW.heading is distinct from OLD.heading
    or NEW.content is distinct from OLD.content
    or NEW.media_urls is distinct from OLD.media_urls
    or NEW.category_id is distinct from OLD.category_id
  ) then
    if (now() - OLD.created_at) > interval '7 days' then
      raise exception 'Posts can only be edited within 7 days of posting';
    end if;
    NEW.edited_at := now();
  end if;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------
-- 2. Comments: edit until engagement
-- ---------------------------------------------------------------
create or replace function public.comment_has_engagement(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.reactions r where r.comment_id = p_comment_id)
      or exists (select 1 from public.comments c where c.parent_comment_id = p_comment_id)
      or exists (select 1 from public.gifts g where g.comment_id = p_comment_id);
$$;

revoke all on function public.comment_has_engagement(uuid) from public, anon, authenticated;
grant execute on function public.comment_has_engagement(uuid) to service_role;

create or replace function public.enforce_comment_edit_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.content is distinct from OLD.content then
    -- Moderation lives in the update-comment edge function (service role).
    if coalesce(auth.role(), 'service_role') in ('authenticated', 'anon') then
      raise exception 'Comments must be edited through update-comment';
    end if;
    if OLD.is_deleted then
      raise exception 'This comment has been deleted';
    end if;
    if public.comment_has_engagement(OLD.id) then
      raise exception 'Comments can''t be edited once anyone has engaged with them';
    end if;
    NEW.edited_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists comments_enforce_edit_rules on public.comments;
create trigger comments_enforce_edit_rules
before update on public.comments
for each row execute function public.enforce_comment_edit_rules();

-- ---------------------------------------------------------------
-- 2b. Comments: counters follow soft delete / restore
-- ---------------------------------------------------------------
create or replace function public.comment_soft_delete_counts()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  d int := case when NEW.is_deleted then -1 else 1 end;
begin
  update public.posts set
    comment_count  = greatest(comment_count + d, 0),
    support_count  = greatest(support_count  + case when OLD.parent_comment_id is null and OLD.stance = 'support'  then d else 0 end, 0),
    disagree_count = greatest(disagree_count + case when OLD.parent_comment_id is null and OLD.stance = 'disagree' then d else 0 end, 0),
    pushback_count = greatest(pushback_count + case when OLD.parent_comment_id is null and OLD.stance = 'pushback' then d else 0 end, 0)
  where id = OLD.post_id;

  if OLD.parent_comment_id is not null then
    update public.comments set
      reply_count    = greatest(reply_count + d, 0),
      support_count  = greatest(support_count  + case when OLD.stance = 'support'  then d else 0 end, 0),
      disagree_count = greatest(disagree_count + case when OLD.stance = 'disagree' then d else 0 end, 0),
      pushback_count = greatest(pushback_count + case when OLD.stance = 'pushback' then d else 0 end, 0)
    where id = OLD.parent_comment_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_comment_soft_delete_counts on public.comments;
create trigger trg_comment_soft_delete_counts
after update of is_deleted on public.comments
for each row
when (NEW.is_deleted is distinct from OLD.is_deleted)
execute function public.comment_soft_delete_counts();

-- ---------------------------------------------------------------
-- 3. Verified badge: 4-week posting streak
-- ---------------------------------------------------------------
-- Consecutive 7-day windows (most recent first, max 4) that each contain
-- at least one of the user's own posts. Counts published, non-deleted
-- personal posts; page posts and plain reshares don't count.
create or replace function public.posting_streak_weeks(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  with w as (
    select k,
      exists (
        select 1 from public.posts po
        where po.author_id = p_user
          and po.is_deleted = false
          and po.status = 'published'
          and po.posted_as_page_id is null
          and not (po.reshared_post_id is not null and btrim(po.content) = '')
          and coalesce(po.scheduled_for, po.created_at) >  now() - make_interval(days => 7 * k)
          and coalesce(po.scheduled_for, po.created_at) <= now() - make_interval(days => 7 * (k - 1))
      ) as ok
    from generate_series(1, 4) k
  )
  select coalesce(min(k) filter (where not ok) - 1, 4)::int from w;
$$;

revoke all on function public.posting_streak_weeks(uuid) from public, anon, authenticated;
grant execute on function public.posting_streak_weeks(uuid) to service_role;

-- What the UI shows. Admin-verified AND (admin OR 4/4 weeks).
create or replace function public.badge_visible(p public.profiles)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.is_verified is true
     and (
       exists (select 1 from public.admin_roles ar where ar.user_id = p.id)
       or public.posting_streak_weeks(p.id) >= 4
     );
$$;

-- Owner-only progress (0–4) for the profile-page note. Null for everyone
-- else, for unverified users, and for admins (who are exempt).
create or replace function public.badge_streak(p public.profiles)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p.is_verified is true
     and auth.uid() = p.id
     and not exists (select 1 from public.admin_roles ar where ar.user_id = p.id)
    then public.posting_streak_weeks(p.id)
    else null
  end;
$$;

grant execute on function public.badge_visible(public.profiles) to anon, authenticated;
grant execute on function public.badge_streak(public.profiles) to authenticated;

notify pgrst, 'reload schema';
