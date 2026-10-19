-- Comment threads revamp (post page + opened-comment page).
-- Applied to the "Ako Temp" project; run this file on production when ready.
--
--  1. Comments carry per-stance reply totals (support/disagree/pushback), like posts do, so an opened
--     comment can show the same breakdown a post does.
--  2. get_comment_ancestor_ids(): the lineage of a comment, root-first, in one call.
--  3. comment_views: unique views of an opened comment (record_comment_view / get_comment_view_count).
--  4. Two partial indexes for the paged reply lists.

alter table public.comments
  add column if not exists support_count  integer not null default 0,
  add column if not exists disagree_count integer not null default 0,
  add column if not exists pushback_count integer not null default 0;

-- Backfill from existing replies. Counts every reply row (not just non-deleted ones) to match how
-- reply_count itself has always been maintained (increment-on-insert only).
update public.comments p
set support_count  = s.support,
    disagree_count = s.disagree,
    pushback_count = s.pushback
from (
  select parent_comment_id,
         count(*) filter (where stance = 'support')  as support,
         count(*) filter (where stance = 'disagree') as disagree,
         count(*) filter (where stance = 'pushback') as pushback
  from public.comments
  where parent_comment_id is not null
  group by parent_comment_id
) s
where s.parent_comment_id = p.id;

create or replace function public.update_post_stance_counts()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- only top-level stance comments count toward the post's stance totals
  if TG_OP = 'INSERT' and new.stance is not null and new.parent_comment_id is null then
    if new.stance = 'support' then
      update posts set support_count = support_count + 1 where id = new.post_id;
    elsif new.stance = 'disagree' then
      update posts set disagree_count = disagree_count + 1 where id = new.post_id;
    elsif new.stance = 'pushback' then
      update posts set pushback_count = pushback_count + 1 where id = new.post_id;
    end if;
  end if;

  if TG_OP = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
    if new.parent_comment_id is not null then
      -- a reply carries its stance toward ITS parent comment, mirrored here as per-stance totals
      update comments set
        reply_count    = reply_count + 1,
        support_count  = support_count  + case when new.stance = 'support'  then 1 else 0 end,
        disagree_count = disagree_count + case when new.stance = 'disagree' then 1 else 0 end,
        pushback_count = pushback_count + case when new.stance = 'pushback' then 1 else 0 end
      where id = new.parent_comment_id;
    end if;
  end if;

  return new;
end;
$function$;

-- security invoker: RLS on comments still decides what the caller can see.
create or replace function public.get_comment_ancestor_ids(p_comment_id uuid)
returns table(id uuid, depth integer)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with recursive up as (
    select c.id, c.parent_comment_id, 0 as depth
    from comments c where c.id = p_comment_id
    union all
    select p.id, p.parent_comment_id, up.depth + 1
    from comments p join up on p.id = up.parent_comment_id
    where up.depth < 50
  )
  select up.id, up.depth from up where up.id <> p_comment_id order by up.depth desc;
$$;

grant execute on function public.get_comment_ancestor_ids(uuid) to authenticated;

create index if not exists comments_parent_created_idx
  on public.comments (parent_comment_id, created_at)
  where parent_comment_id is not null;
create index if not exists comments_post_root_created_idx
  on public.comments (post_id, created_at)
  where parent_comment_id is null;

-- ── Unique comment views ────────────────────────────────────────────────────────────────────────────────
-- Written only through record_comment_view(); never read directly (no policies on purpose).
create table if not exists public.comment_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
alter table public.comment_views enable row level security;

create index if not exists comment_views_comment_idx on public.comment_views (comment_id);

create or replace function public.record_comment_view(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_uid uuid := auth.uid(); v_author uuid;
begin
  if v_uid is null then return; end if;
  select author_id into v_author from comments where id = p_comment_id and is_deleted = false;
  if v_author is null or v_author = v_uid then return; end if;
  insert into comment_views (user_id, comment_id) values (v_uid, p_comment_id)
  on conflict do nothing;
end $$;

-- Unique viewers = people who opened it OR reacted to it, author excluded (mirrors get_post_view_count).
create or replace function public.get_comment_view_count(p_comment_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int from (
    select user_id from comment_views where comment_id = p_comment_id
    union select user_id from reactions where comment_id = p_comment_id
  ) v
  where v.user_id <> (select author_id from comments where id = p_comment_id);
$$;

revoke all on function public.record_comment_view(uuid) from public;
revoke all on function public.get_comment_view_count(uuid) from public;
grant execute on function public.record_comment_view(uuid) to authenticated;
grant execute on function public.get_comment_view_count(uuid) to authenticated;
