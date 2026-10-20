-- supabase/post_edit_realtime_broadcast.sql
-- Applied to the "Ako Temp" project (migrations: post_edit_realtime_broadcast, post_edit_broadcast_drop_updated_at).
--
-- Pushes post CONTENT edits to connected clients immediately, via Realtime Broadcast on the private "post-edits" topic.
-- Broadcast (rather than postgres_changes on public.posts) means clients are only woken for real content edits, not for
-- every like_count / share_count bump on every post. The client side is src/hooks/usePostRealtime.ts.
--
-- NOTE: public.posts has no updated_at column, so none is sent.

create or replace function public.broadcast_post_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_private boolean;
begin
  -- Private accounts: don't fan their edits out to every connected client (their viewers pick edits up on refetch).
  select coalesce(p.is_private, false) into author_private from public.profiles p where p.id = new.author_id;
  if author_private then
    return null;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'heading', new.heading,
        'heading_color', new.heading_color,
        'content', new.content,
        'media_urls', new.media_urls,
        'category_id', new.category_id,
        'music_catalogue_id', new.music_catalogue_id,
        'is_deleted', new.is_deleted,
        'is_archived', new.is_archived
      ),
      'post_edited',
      'post-edits',
      true
    );
  exception when others then
    -- A failed broadcast must never fail the edit itself.
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_broadcast_post_edit on public.posts;
create trigger trg_broadcast_post_edit
after update on public.posts
for each row
when (
  old.heading is distinct from new.heading
  or old.heading_color is distinct from new.heading_color
  or old.content is distinct from new.content
  or old.media_urls is distinct from new.media_urls
  or old.category_id is distinct from new.category_id
  or old.music_catalogue_id is distinct from new.music_catalogue_id
  or old.is_deleted is distinct from new.is_deleted
  or old.is_archived is distinct from new.is_archived
)
execute function public.broadcast_post_edit();

-- Signed-in users may subscribe to the private "post-edits" topic (receive only).
drop policy if exists "authenticated can receive post edits" on realtime.messages;
create policy "authenticated can receive post edits"
on realtime.messages
for select
to authenticated
using (realtime.topic() = 'post-edits' and realtime.messages.extension = 'broadcast');
