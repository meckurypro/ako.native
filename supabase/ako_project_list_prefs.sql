-- ako_project_list_prefs.sql
-- Connect and Library: per person, per project preferences for the items on those lists.
--
--   pinned_at  the item sits at the top of its list
--   muted_at   no updates from it: no room meeting notifications and no group chat pushes
--
-- Same idea as conversation_participants.pinned_at for chats: it only changes how things look and sound for the person
-- who set it. Nobody else sees it, and it never changes anyone's access. Removing an item from a list is still
-- project_library_removals (ako_library_visibility.sql).

create table if not exists public.project_list_prefs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  pinned_at  timestamptz,
  muted_at   timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_list_prefs_project_idx on public.project_list_prefs (project_id);

alter table public.project_list_prefs enable row level security;

drop policy if exists "read own list prefs" on public.project_list_prefs;
create policy "read own list prefs" on public.project_list_prefs
  for select using (user_id = (select auth.uid()));
drop policy if exists "insert own list prefs" on public.project_list_prefs;
create policy "insert own list prefs" on public.project_list_prefs
  for insert with check (user_id = (select auth.uid()));
drop policy if exists "update own list prefs" on public.project_list_prefs;
create policy "update own list prefs" on public.project_list_prefs
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own list prefs" on public.project_list_prefs;
create policy "delete own list prefs" on public.project_list_prefs
  for delete using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.project_list_prefs to authenticated;

-- A muted project sends no room meeting notifications. Only these "update" types are dropped; anything about money,
-- access or moderation (purchases, tickets, join decisions, removals) always gets through. Dropping the row here
-- also stops its push, because pushes are sent from notification rows.
create or replace function public.skip_muted_project_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_type = 'project'
     and new.target_id is not null
     and new.type in (
       'room_meeting_scheduled', 'room_meeting_reminder', 'room_meeting_soon',
       'room_meeting_starting', 'room_meeting_rescheduled', 'room_meeting_cancelled'
     )
     and exists (
       select 1 from public.project_list_prefs p
        where p.user_id = new.user_id and p.project_id = new.target_id and p.muted_at is not null
     )
  then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.skip_muted_project_notification() from public, anon, authenticated;

drop trigger if exists skip_muted_project_notification on public.notifications;
create trigger skip_muted_project_notification
  before insert on public.notifications
  for each row execute function public.skip_muted_project_notification();

-- Group chat pushes are sent by the send-message-push edge function, which skips anyone who muted the group
-- (it reads project_list_prefs through project_room_details.conversation_id).
