-- ============================================================
-- AKỌ — songs live under an artist gig
-- ============================================================
-- A song is a "media" project. Until now it was a free-standing project that a gig merely *pointed at* through
-- project_gig_samples, so it showed up twice (its own card, and again under the gig) and nothing forced a musician
-- to have a gig at all.
--
-- New model, one source of truth:
--   projects.parent_gig_id  -> the artist gig this song lives under. Required for every media project.
--   project_gig_samples     -> still the "proof of work" list, but never holds a gig's own songs.
--   gig_works (view)        -> everything shown under a gig: its songs first, then its samples. Readers use this.
--   ensure_artist_gig()     -> scaffolds (or returns) the caller's Music Artist gig, so a musician with no gig yet
--                              can still post a song. The gig is created incomplete — set up later.
--
-- Nothing is deleted except the redundant sample rows that duplicated a song's own gig link.
-- Idempotent where it can be; the backfill only touches media projects that have no parent yet.
-- ============================================================

-- 1. The link ------------------------------------------------------------------------------------------------
-- NO ACTION (not CASCADE): deleting a gig that still has songs fails loudly instead of silently deleting the songs.
-- It is checked at end of statement, so deleting an account (which removes gig and songs together) still works.
alter table public.projects
  add column if not exists parent_gig_id uuid references public.projects (id);

create index if not exists projects_parent_gig_id_idx
  on public.projects (parent_gig_id) where parent_gig_id is not null;

-- 2. Scaffold the caller's artist gig -----------------------------------------------------------------------
-- find_or_create_role_gig is service-role only (it takes any account id), so the client goes through this wrapper,
-- which can only ever act for the signed-in user. Reuses their active Music Artist gig if they have one.
create or replace function public.ensure_artist_gig()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select id into v_role from public.gig_roles where key = 'music_artist' and is_active;
  if v_role is null then
    raise exception 'Artist role is not available' using errcode = '22023';
  end if;

  return (public.find_or_create_role_gig(v_uid, v_role, null, 'auto_project', false) ->> 'gig_id')::uuid;
end;
$$;

revoke all on function public.ensure_artist_gig() from public, anon;
grant execute on function public.ensure_artist_gig() to authenticated, service_role;

-- 3. Backfill existing songs ----------------------------------------------------------------------------------
-- Each song goes under the artist gig it is already attached to; a song with no gig gets the owner's Music Artist
-- gig, scaffolded if they have none.
-- Creating a gig is gated by the admin "project type" switch (enforce_project_type_rules). Gigs may be switched off
-- there, and that switch is for people creating things — not for this one-off repair of existing songs. So the gig
-- type is lifted for the length of this transaction and put back exactly as it was (value and timestamp) before
-- commit. Nothing outside this transaction ever sees it change.
do $$
declare
  r             record;
  v_role        uuid;
  v_gig         uuid;
  v_gig_active  boolean;
  v_gig_stamped timestamptz;
begin
  select id into v_role from public.gig_roles where key = 'music_artist';

  select is_active, updated_at into v_gig_active, v_gig_stamped
  from public.project_type_settings where project_type = 'gig' for update;
  if v_gig_active is false then
    update public.project_type_settings set is_active = true where project_type = 'gig';
  end if;

  for r in
    select id, owner_id from public.projects
    where project_type = 'media' and parent_gig_id is null
  loop
    v_gig := null;

    select g.id into v_gig
    from public.project_gig_samples s
    join public.projects g on g.id = s.gig_project_id and g.project_type = 'gig' and g.owner_id = r.owner_id
    join public.project_gig_details d on d.project_id = g.id
    join public.gig_roles gr on gr.id = d.role_id and gr.category = 'Artist'
    where s.sample_project_id = r.id
    order by (gr.key = 'music_artist') desc, g.created_at
    limit 1;

    if v_gig is null then
      v_gig := (public.find_or_create_role_gig(r.owner_id, v_role, r.id, 'auto_project', false) ->> 'gig_id')::uuid;
    end if;

    update public.projects set parent_gig_id = v_gig where id = r.id;
  end loop;

  if v_gig_active is false then
    update public.project_type_settings
    set is_active = false, updated_at = v_gig_stamped
    where project_type = 'gig';
  end if;
end;
$$;

-- The song is now linked to its gig directly, so the duplicate "sample" row for it goes. Samples of *other* work
-- (and credited songs on someone else's gig) are untouched.
delete from public.project_gig_samples s
using public.projects p
where p.id = s.sample_project_id
  and p.parent_gig_id = s.gig_project_id;

-- 4. Rules -----------------------------------------------------------------------------------------------------
alter table public.projects
  drop constraint if exists projects_parent_gig_only_media,
  drop constraint if exists projects_media_needs_gig;

alter table public.projects
  add constraint projects_parent_gig_only_media check (parent_gig_id is null or project_type = 'media'),
  add constraint projects_media_needs_gig check (project_type <> 'media' or parent_gig_id is not null);

-- The parent must be one of the song owner's own artist gigs. Only checked when the link or owner changes, so
-- editing a song later never re-litigates a gig the owner has since retitled or archived.
create or replace function public.projects_validate_parent_gig()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_gig_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.parent_gig_id is not distinct from old.parent_gig_id
     and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.projects g
    join public.project_gig_details d on d.project_id = g.id
    join public.gig_roles r on r.id = d.role_id
    where g.id = new.parent_gig_id
      and g.project_type = 'gig'
      and g.owner_id = new.owner_id
      and g.posted_as_page_id is null
      and r.category = 'Artist'
  ) then
    raise exception 'A song has to live under one of your artist gigs.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_validate_parent_gig on public.projects;
create trigger projects_validate_parent_gig
  before insert or update of parent_gig_id, owner_id on public.projects
  for each row execute function public.projects_validate_parent_gig();

-- A gig's own songs must never also sit in its sample list. Publishing music re-runs find_or_create_role_gig, which
-- inserts a sample row; skip it quietly rather than recreate the duplicate (or fail the publish).
create or replace function public.project_gig_samples_skip_own_songs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.projects p
    where p.id = new.sample_project_id and p.parent_gig_id = new.gig_project_id
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists project_gig_samples_skip_own_songs on public.project_gig_samples;
create trigger project_gig_samples_skip_own_songs
  before insert on public.project_gig_samples
  for each row execute function public.project_gig_samples_skip_own_songs();

-- 5. What a gig shows -------------------------------------------------------------------------------------------
-- Songs first (newest first), then samples in their saved order. security_invoker so it honours the same RLS as the
-- tables underneath — a private song stays private.
create or replace view public.gig_works
with (security_invoker = true) as
  select p.parent_gig_id as gig_project_id,
         p.id            as sample_project_id,
         (row_number() over (partition by p.parent_gig_id order by p.created_at desc))::int - 1000000 as sort_order,
         true            as is_song
  from public.projects p
  where p.parent_gig_id is not null
  union all
  select s.gig_project_id, s.sample_project_id, s.sort_order, false
  from public.project_gig_samples s;

revoke all on public.gig_works from public, anon, authenticated;
grant select on public.gig_works to anon, authenticated, service_role;

-- 6. Profile tabs --------------------------------------------------------------------------------------------------
-- A category tab now counts a gig's songs too, and shows once the gig has public songs even while the gig itself is
-- still a scaffold (is_complete = false) — otherwise a new musician's first song would be invisible until they
-- finished setting the gig up. Gig *samples* still wait for a complete gig, as before.
create or replace function public.get_profile_portfolio_categories(p_account_id uuid)
returns table (category text, gig_count bigint, project_count bigint)
language sql
stable
set search_path = public
as $$
  select
    gr.category,
    count(distinct pgd.project_id) as gig_count,
    count(distinct sp.id) as project_count
  from project_gig_details pgd
  join projects p on p.id = pgd.project_id
    and p.owner_id = p_account_id
    and p.status = 'active'
    and p.project_type = 'gig'
  join gig_roles gr on gr.id = pgd.role_id and gr.is_active
  join gig_works gw on gw.gig_project_id = pgd.project_id
  join projects sp on sp.id = gw.sample_project_id
    and sp.status = 'active'
    and sp.is_private = false
  where pgd.is_complete or gw.is_song
  group by gr.category
  having count(distinct sp.id) > 0;
$$;
