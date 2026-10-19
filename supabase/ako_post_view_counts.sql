-- Post view counts: unique viewers, counted from feed impressions, detail opens and reactions.
-- Root causes fixed:
--  1. post_views was only written from PostDetail, so posts seen/liked in the feed had 0 views.
--  2. post_views SELECT RLS is own-rows-only, so a count(*) from the client only ever saw the caller's rows.
--  3. Upsert (merge-duplicates) on post_views needs an UPDATE policy; without it repeat views errored.

create table if not exists public.post_impressions (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.post_impressions enable row level security;
-- No policies on purpose: written only via record_post_view(), never read directly.

drop policy if exists post_views_update_own on public.post_views;
create policy post_views_update_own on public.post_views
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.record_post_view(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_author uuid;
begin
  if v_uid is null then return; end if;
  select author_id into v_author from posts where id = p_post_id;
  if v_author is null or v_author = v_uid then return; end if;
  insert into post_impressions (user_id, post_id) values (v_uid, p_post_id)
  on conflict do nothing;
end $$;

create or replace function public.get_post_view_count(p_post_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select user_id from post_views where post_id = p_post_id
    union select user_id from post_impressions where post_id = p_post_id
    union select user_id from reactions where post_id = p_post_id
  ) v
  where v.user_id <> (select author_id from posts where id = p_post_id);
$$;

revoke all on function public.record_post_view(uuid) from public;
revoke all on function public.get_post_view_count(uuid) from public;
grant execute on function public.record_post_view(uuid) to authenticated;
grant execute on function public.get_post_view_count(uuid) to authenticated;
