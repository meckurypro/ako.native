-- Share counts for comments: one row per (comment, user) so re-sharing doesn't inflate the number.
-- Applied to Ako Temp as `comment_share_counts`.
alter table public.comments add column if not exists share_count integer not null default 0;

create table if not exists public.comment_shares (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.comment_shares enable row level security;
-- No direct policies: clients go through record_comment_share() below.

create or replace function public.tg_comment_share_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if TG_OP = 'INSERT' then
    update public.comments set share_count = share_count + 1 where id = new.comment_id;
  elsif TG_OP = 'DELETE' then
    update public.comments set share_count = greatest(share_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_share_count on public.comment_shares;
create trigger trg_comment_share_count
  after insert or delete on public.comment_shares
  for each row execute function public.tg_comment_share_count();

create or replace function public.record_comment_share(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.comment_shares (comment_id, user_id)
  select c.id, auth.uid() from public.comments c where c.id = p_comment_id and not c.is_deleted
  on conflict do nothing;
end;
$$;

revoke all on function public.record_comment_share(uuid) from public, anon;
grant execute on function public.record_comment_share(uuid) to authenticated;
