-- supabase/ako_stances_question_comment.sql
--
-- Stances are now: support, pushback, question, comment.
--   * "disagree" is gone: it was folded into "pushback" (rows, counters and notifications).
--   * "question" and "comment" (the neutral, uncoloured one) are new.
--   * Untagged legacy comments become "comment".
-- posts/comments get question_count + neutral_count beside support_count / pushback_count. The disagree_count columns
-- stay (always 0 now) so older app builds that still select them keep working.
-- Run before deploying the create-comment / create-page-comment edge functions that accept the new stances.

alter table public.posts    add column if not exists question_count integer not null default 0,
                            add column if not exists neutral_count  integer not null default 0;
alter table public.comments add column if not exists question_count integer not null default 0,
                            add column if not exists neutral_count  integer not null default 0;

-- Rewrite existing rows. The edit-rules trigger would otherwise treat this as a user edit.
alter table public.comments disable trigger comments_enforce_edit_rules;
alter table public.comments drop constraint if exists comments_stance_check;
update public.comments set stance = 'pushback' where stance = 'disagree';
update public.comments set stance = 'comment'  where stance is null;
alter table public.comments add constraint comments_stance_check
  check (stance in ('support', 'pushback', 'question', 'comment'));
alter table public.comments enable trigger comments_enforce_edit_rules;

update public.posts    set pushback_count = pushback_count + disagree_count, disagree_count = 0 where disagree_count <> 0;
update public.comments set pushback_count = pushback_count + disagree_count, disagree_count = 0 where disagree_count <> 0;

-- Recompute the two new counters from the rows (top-level for posts, direct replies for comments).
update public.posts p set
  question_count = (select count(*) from public.comments c where c.post_id = p.id and c.parent_comment_id is null and not c.is_deleted and c.stance = 'question'),
  neutral_count  = (select count(*) from public.comments c where c.post_id = p.id and c.parent_comment_id is null and not c.is_deleted and c.stance = 'comment');
update public.comments p set
  question_count = (select count(*) from public.comments c where c.parent_comment_id = p.id and not c.is_deleted and c.stance = 'question'),
  neutral_count  = (select count(*) from public.comments c where c.parent_comment_id = p.id and not c.is_deleted and c.stance = 'comment');

-- Notifications: existing "disagree" rows read as "pushback"; "question" is a new type.
update public.notifications set type = 'pushback' where type = 'disagree';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'support','pushback','question','disagree','comment','comment_reply','comment_like','comment_dislike','like','dislike','share','reshare','quote',
  'follow','follow_request','follow_request_accepted','mention','post_tagged','post_published','post_comment_activity','message','system',
  'gift_received','project_tagged','project_purchased','project_access_granted','file_downloaded','give_back_received','affiliate_commission_earned',
  'withdrawal_status','promotion_approved','promotion_declined','room_meeting_scheduled','moderation_notice','admin_message',
  'collaboration_invite','collaboration_accepted','collaboration_declined','gig_created_from_collaboration','music_credit_request',
  'foreword_invite','foreword_submitted','foreword_approved','foreword_declined',
  'page_role_invite','page_role_accepted','page_role_declined','page_role_rejected','page_role_requested','page_role_approved'
]::text[]));

-- Counters on insert (top-level -> the post, reply -> its parent comment) …
create or replace function public.update_post_stance_counts()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' and new.stance is not null and new.parent_comment_id is null then
    update posts set
      support_count  = support_count  + case when new.stance = 'support'  then 1 else 0 end,
      pushback_count = pushback_count + case when new.stance = 'pushback' then 1 else 0 end,
      question_count = question_count + case when new.stance = 'question' then 1 else 0 end,
      neutral_count  = neutral_count  + case when new.stance = 'comment'  then 1 else 0 end
    where id = new.post_id;
  end if;

  if TG_OP = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id;
    if new.parent_comment_id is not null then
      update comments set
        reply_count    = reply_count + 1,
        support_count  = support_count  + case when new.stance = 'support'  then 1 else 0 end,
        pushback_count = pushback_count + case when new.stance = 'pushback' then 1 else 0 end,
        question_count = question_count + case when new.stance = 'question' then 1 else 0 end,
        neutral_count  = neutral_count  + case when new.stance = 'comment'  then 1 else 0 end
      where id = new.parent_comment_id;
    end if;
  end if;
  return new;
end;
$$;

-- … and on soft delete / restore.
create or replace function public.comment_soft_delete_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d int := case when NEW.is_deleted then -1 else 1 end;
begin
  update public.posts set
    comment_count  = greatest(comment_count + d, 0),
    support_count  = greatest(support_count  + case when OLD.parent_comment_id is null and OLD.stance = 'support'  then d else 0 end, 0),
    pushback_count = greatest(pushback_count + case when OLD.parent_comment_id is null and OLD.stance = 'pushback' then d else 0 end, 0),
    question_count = greatest(question_count + case when OLD.parent_comment_id is null and OLD.stance = 'question' then d else 0 end, 0),
    neutral_count  = greatest(neutral_count  + case when OLD.parent_comment_id is null and OLD.stance = 'comment'  then d else 0 end, 0)
  where id = OLD.post_id;

  if OLD.parent_comment_id is not null then
    update public.comments set
      reply_count    = greatest(reply_count + d, 0),
      support_count  = greatest(support_count  + case when OLD.stance = 'support'  then d else 0 end, 0),
      pushback_count = greatest(pushback_count + case when OLD.stance = 'pushback' then d else 0 end, 0),
      question_count = greatest(question_count + case when OLD.stance = 'question' then d else 0 end, 0),
      neutral_count  = greatest(neutral_count  + case when OLD.stance = 'comment'  then d else 0 end, 0)
    where id = OLD.parent_comment_id;
  end if;
  return NEW;
end;
$$;

-- Usage ranking for the reaction tray.
create or replace function public.get_my_engagement_counts()
returns table(action text, usage_count bigint)
language sql security definer set search_path = public as $$
  select action, count(*) as usage_count
  from (
    select 'like' as action from public.reactions where user_id = auth.uid() and type = 'like'
    union all select 'dislike' from public.reactions where user_id = auth.uid() and type = 'dislike'
    union all select 'share' from public.reactions where user_id = auth.uid() and type = 'share'
    union all select 'bookmark' from public.bookmarks where user_id = auth.uid()
    union all select 'support' from public.comments where author_id = auth.uid() and stance = 'support'
    union all select 'pushback' from public.comments where author_id = auth.uid() and stance = 'pushback'
    union all select 'question' from public.comments where author_id = auth.uid() and stance = 'question'
    union all select 'comment' from public.comments where author_id = auth.uid() and stance = 'comment'
    union all select 'gift' from public.gifts where sender_id = auth.uid()
  ) t
  group by action;
$$;
