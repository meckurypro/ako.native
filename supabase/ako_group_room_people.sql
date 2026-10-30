-- Everyone in a group, owner and hosts included, with their role.
-- room_members only holds people who joined; the owner and hosts are not in it, which is why the
-- group header counted 1 and chat bubbles from the owner fell back to "Member".
-- Applied to the Ako project as migration ako_group_room_people.
create or replace function public.room_people(p_project_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not (public.is_room_host(p_project_id, auth.uid()) or public.is_room_member(p_project_id, auth.uid())) then
    raise exception 'Not a member of this group' using errcode = '42501';
  end if;

  return query
  with hosts_raw as (
    select p.owner_id as uid, 'owner'::text as who, p.created_at as at
      from public.projects p where p.id = p_project_id
    union all
    select m.user_id, 'host'::text, m.created_at
      from public.room_moderators m where m.project_id = p_project_id
    union all
    select pm.user_id, 'host'::text, coalesce(pm.responded_at, pm.created_at)
      from public.projects p
      join public.page_members pm on pm.page_id = p.posted_as_page_id and pm.status = 'active'
     where p.id = p_project_id and p.posted_as_page_id is not null
  ),
  hosts as (
    select distinct on (h.uid) h.uid, h.who, h.at
      from hosts_raw h
     order by h.uid, case h.who when 'owner' then 0 else 1 end
  ),
  members as (
    select rm.user_id as uid, 'member'::text as who, rm.joined_at as at
      from public.room_members rm
     where rm.project_id = p_project_id
       and rm.user_id not in (select h.uid from hosts h)
  ),
  everyone as (
    select * from hosts
    union all
    select * from members
  )
  select pr.id, pr.username, pr.display_name, pr.avatar_url, coalesce(pr.is_verified, false), e.who, e.at
    from everyone e
    join public.profiles pr on pr.id = e.uid and coalesce(pr.is_deleted, false) = false
   order by case e.who when 'owner' then 0 when 'host' then 1 else 2 end, e.at;
end;
$$;

revoke all on function public.room_people(uuid) from public, anon;
grant execute on function public.room_people(uuid) to authenticated;
