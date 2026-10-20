-- supabase/live_counts_broadcast.sql
-- NOT YET APPLIED — run against the "Ako Temp" project (same way as post_edit_realtime_broadcast.sql).
--
-- Pushes COUNTER changes (likes, dislikes, shares, gifts, comment/reply totals, per-stance totals) and new/removed
-- replies to connected clients immediately, via Realtime Broadcast on private per-entity topics:
--     post-counts:<post id>   event "counts"          — one per post a client has on screen
--     thread:<post id>        events "comment_counts" and "comment_added" — one per conversation a client has open
-- Per-entity topics mean a client is only woken for what it is actually looking at (the reason post edits use
-- Broadcast too, rather than postgres_changes on public.posts). Client side: src/lib/liveCounts.ts.
--
-- Counters are moved by existing triggers (handle_reaction_counts, update_post_stance_counts,
-- comment_soft_delete_counts, bump_reshared_post_share_count) with plain UPDATEs on posts / comments; these new
-- AFTER UPDATE triggers only fire when one of those counters (or is_deleted) actually changed.
-- Like post edits, nothing is fanned out for private accounts' posts (their viewers pick counts up on refetch), and a
-- failed broadcast never fails the write that caused it.

create or replace function public.broadcast_post_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_private boolean;
begin
  select coalesce(p.is_private, false) into author_private from public.profiles p where p.id = new.author_id;
  if author_private then
    return null;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'like_count', new.like_count,
        'dislike_count', new.dislike_count,
        'share_count', new.share_count,
        'gift_count', new.gift_count,
        'comment_count', new.comment_count,
        'support_count', new.support_count,
        'disagree_count', new.disagree_count,
        'pushback_count', new.pushback_count
      ),
      'counts',
      'post-counts:' || new.id::text,
      true
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_broadcast_post_counts on public.posts;
create trigger trg_broadcast_post_counts
after update on public.posts
for each row
when (
  old.like_count is distinct from new.like_count
  or old.dislike_count is distinct from new.dislike_count
  or old.share_count is distinct from new.share_count
  or old.gift_count is distinct from new.gift_count
  or old.comment_count is distinct from new.comment_count
  or old.support_count is distinct from new.support_count
  or old.disagree_count is distinct from new.disagree_count
  or old.pushback_count is distinct from new.pushback_count
)
execute function public.broadcast_post_counts();


create or replace function public.broadcast_comment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_private boolean;
begin
  select coalesce(p.is_private, false) into author_private
  from public.posts po join public.profiles p on p.id = po.author_id
  where po.id = new.post_id;
  if author_private then
    return null;
  end if;

  begin
    if tg_op = 'INSERT' then
      perform realtime.send(
        jsonb_build_object('id', new.id, 'post_id', new.post_id, 'parent_comment_id', new.parent_comment_id),
        'comment_added',
        'thread:' || new.post_id::text,
        true
      );
    else
      perform realtime.send(
        jsonb_build_object(
          'id', new.id,
          'post_id', new.post_id,
          'parent_comment_id', new.parent_comment_id,
          'is_deleted', new.is_deleted,
          'like_count', new.like_count,
          'dislike_count', new.dislike_count,
          'reply_count', new.reply_count,
          'support_count', new.support_count,
          'disagree_count', new.disagree_count,
          'pushback_count', new.pushback_count
        ),
        'comment_counts',
        'thread:' || new.post_id::text,
        true
      );
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists trg_broadcast_comment_added on public.comments;
create trigger trg_broadcast_comment_added
after insert on public.comments
for each row
execute function public.broadcast_comment_event();

drop trigger if exists trg_broadcast_comment_counts on public.comments;
create trigger trg_broadcast_comment_counts
after update on public.comments
for each row
when (
  old.like_count is distinct from new.like_count
  or old.dislike_count is distinct from new.dislike_count
  or old.reply_count is distinct from new.reply_count
  or old.support_count is distinct from new.support_count
  or old.disagree_count is distinct from new.disagree_count
  or old.pushback_count is distinct from new.pushback_count
  or old.is_deleted is distinct from new.is_deleted
)
execute function public.broadcast_comment_event();


-- Signed-in users may subscribe to the per-entity count topics (receive only). Payloads carry counters and ids only —
-- never content — so nothing private rides on these topics.
drop policy if exists "authenticated can receive live counts" on realtime.messages;
create policy "authenticated can receive live counts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (realtime.topic() like 'post-counts:%' or realtime.topic() like 'thread:%')
);
