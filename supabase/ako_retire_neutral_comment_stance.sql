-- Every comment is an Add (support), a Question or a Pushback. The neutral "comment" stance is retired:
-- legacy rows fold into "support", counters are recomputed, and any insert/update that still says "comment"
-- (older app builds) is normalised to "support" by a BEFORE trigger. Applied to Ako Temp as
-- `retire_neutral_comment_stance`.

create or replace function public.normalize_comment_stance()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.stance = 'comment' then
    new.stance := 'support';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_comment_stance on public.comments;
create trigger trg_normalize_comment_stance
  before insert or update of stance on public.comments
  for each row execute function public.normalize_comment_stance();

create temp table _touched_posts on commit drop as
  select distinct post_id as id from public.comments where stance = 'comment' and parent_comment_id is null;
create temp table _touched_parents on commit drop as
  select distinct parent_comment_id as id from public.comments where stance = 'comment' and parent_comment_id is not null;

update public.comments set stance = 'support' where stance = 'comment';

update public.posts p set
  support_count = (select count(*) from public.comments c where c.post_id = p.id and c.parent_comment_id is null and not c.is_deleted and c.stance = 'support'),
  neutral_count = 0
where p.id in (select id from _touched_posts) or p.neutral_count <> 0;

update public.comments p set
  support_count = (select count(*) from public.comments c where c.parent_comment_id = p.id and not c.is_deleted and c.stance = 'support'),
  neutral_count = 0
where p.id in (select id from _touched_parents) or p.neutral_count <> 0;

alter table public.comments drop constraint if exists comments_stance_check;
alter table public.comments add constraint comments_stance_check
  check (stance = any (array['support'::text, 'pushback'::text, 'question'::text]));
