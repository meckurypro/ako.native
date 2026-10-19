-- Batched view counts for feed cards (one round trip per screenful instead of one per card).
create or replace function public.get_post_view_counts(p_post_ids uuid[])
returns table (post_id uuid, views integer)
language sql stable security definer set search_path = public as $$
  select p.id, (
    select count(*)::int from (
      select user_id from post_views where post_id = p.id
      union select user_id from post_impressions where post_id = p.id
      union select user_id from reactions where post_id = p.id
    ) v where v.user_id <> p.author_id
  )
  from posts p where p.id = any(p_post_ids);
$$;
revoke all on function public.get_post_view_counts(uuid[]) from public;
grant execute on function public.get_post_view_counts(uuid[]) to authenticated;
