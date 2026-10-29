-- AKỌ — Gamified post length: verified users start at 1,200 and earn +10 characters on the first
-- published post of each (UTC) day. Losing verified status resets the bonus to 0 (back to 1,200).
-- Non-verified users stay at 450. Page posts (posted_as_page_id) neither earn nor use the bonus.
-- Limit = 1200 + profiles.post_limit_bonus, enforced in create-post / update-post edge functions.
-- posts_content_check is raised to a 20,000 backstop. Applied to the Ako project as migration
-- `ako_post_limit_gamification`.

alter table public.profiles
  add column if not exists post_limit_bonus integer not null default 0 check (post_limit_bonus >= 0),
  add column if not exists post_limit_bonus_day date;

alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts add constraint posts_content_check check (char_length(content) <= 20000);

create or replace function public.guard_post_limit_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('ako.post_bonus', true), '') <> '1'
     and not public.is_admin_or_moderator(auth.uid()) then
    new.post_limit_bonus := old.post_limit_bonus;
    new.post_limit_bonus_day := old.post_limit_bonus_day;
  end if;
  if old.is_verified is true and new.is_verified is not true then
    new.post_limit_bonus := 0;
    new.post_limit_bonus_day := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_zz_guard_post_limit_bonus on public.profiles;
create trigger trg_zz_guard_post_limit_bonus
  before update on public.profiles
  for each row execute function public.guard_post_limit_bonus();

create or replace function public.tg_post_limit_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'utc')::date;
begin
  if new.status is distinct from 'published' or new.posted_as_page_id is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'published' then
    return new;
  end if;
  perform set_config('ako.post_bonus', '1', true);
  update public.profiles
     set post_limit_bonus = post_limit_bonus + 10,
         post_limit_bonus_day = v_today
   where id = new.author_id
     and is_verified is true
     and (post_limit_bonus_day is null or post_limit_bonus_day < v_today);
  perform set_config('ako.post_bonus', '0', true);
  return new;
end $$;

drop trigger if exists trg_post_limit_bonus_ins on public.posts;
create trigger trg_post_limit_bonus_ins after insert on public.posts
  for each row execute function public.tg_post_limit_bonus();
drop trigger if exists trg_post_limit_bonus_upd on public.posts;
create trigger trg_post_limit_bonus_upd after update of status on public.posts
  for each row execute function public.tg_post_limit_bonus();
