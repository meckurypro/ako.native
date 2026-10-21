-- supabase/ako_discard_unpublished_post.sql
--
-- Publishing (or re-saving) a resumed draft/scheduled post creates a NEW post and then deletes the old row.
-- That delete was a plain `delete from posts`, which fails with a foreign-key error as soon as the old row has
-- any post_views / post_profile_visits / post_tags / post_collaborators row (the author merely opening their own
-- draft logs a view). The error was swallowed, so the edited post went live while the stale draft stayed in Drafts.
--
-- This function removes the dependents and the row together, only for the caller's own draft/scheduled posts.
create or replace function public.discard_unpublished_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from posts
    where id = p_post_id and author_id = auth.uid() and status in ('draft', 'scheduled')
  ) then
    raise exception 'Draft not found' using errcode = 'P0002';
  end if;

  delete from post_views where post_id = p_post_id;
  delete from post_profile_visits where post_id = p_post_id;
  delete from post_tags where post_id = p_post_id;
  delete from post_collaborators where post_id = p_post_id;
  delete from post_topics where post_id = p_post_id;
  delete from posts where id = p_post_id;
end;
$$;

revoke all on function public.discard_unpublished_post(uuid) from public, anon;
grant execute on function public.discard_unpublished_post(uuid) to authenticated;
