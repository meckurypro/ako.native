-- ============================================================
-- Page landing-page revamp
--
--   1. Hero slides  — page_hero_slides (+ hero settings on pages)
--   2. Team showcase — page_members.show_on_page / display_order,
--      so an admin chooses which team members visitors see.
--   3. Banner       — NO schema change: it reuses pages.cover_url
--      (already in the table and editable by anyone who can edit
--      the page). The UI now calls it the banner and renders it.
--
-- Safe to run more than once. The apps tolerate this migration not
-- having been run yet (hero/featured team simply don't show), so the
-- order of "deploy the app" vs "run this" does not matter.
-- ============================================================

-- ---- 1a. Hero settings on the page itself ---------------------------------

alter table public.pages
  add column if not exists hero_autoplay boolean not null default true,
  add column if not exists hero_interval_seconds smallint not null default 5,
  add column if not exists hero_direction text not null default 'forward';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pages_hero_interval_chk') then
    alter table public.pages
      add constraint pages_hero_interval_chk check (hero_interval_seconds between 2 and 15);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pages_hero_direction_chk') then
    alter table public.pages
      add constraint pages_hero_direction_chk check (hero_direction in ('forward', 'backward'));
  end if;
end $$;

-- ---- who may edit a page's landing content --------------------------------
-- Page admins, or a member an admin granted "edit page details" to — the
-- same rule the Edit page screen already applies in the UI.

create or replace function public.can_edit_page_content(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.page_members m
    where m.page_id = p_page_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (m.is_admin or coalesce((m.permissions ->> 'edit_page')::boolean, false))
  );
$$;

grant execute on function public.can_edit_page_content(uuid) to authenticated;

-- ---- 1b. Hero slides -------------------------------------------------------

create table if not exists public.page_hero_slides (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages(id) on delete cascade,
  image_url   text not null,
  title       text check (title is null or char_length(title) <= 80),
  caption     text check (caption is null or char_length(caption) <= 160),
  position    integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists page_hero_slides_page_position_idx
  on public.page_hero_slides (page_id, position);

alter table public.page_hero_slides enable row level security;

drop policy if exists "hero slides are public on active pages" on public.page_hero_slides;
create policy "hero slides are public on active pages"
  on public.page_hero_slides for select
  to anon, authenticated
  using (exists (select 1 from public.pages p where p.id = page_id and p.is_active));

drop policy if exists "page editors add hero slides" on public.page_hero_slides;
create policy "page editors add hero slides"
  on public.page_hero_slides for insert
  to authenticated
  with check (public.can_edit_page_content(page_id));

drop policy if exists "page editors change hero slides" on public.page_hero_slides;
create policy "page editors change hero slides"
  on public.page_hero_slides for update
  to authenticated
  using (public.can_edit_page_content(page_id))
  with check (public.can_edit_page_content(page_id));

drop policy if exists "page editors remove hero slides" on public.page_hero_slides;
create policy "page editors remove hero slides"
  on public.page_hero_slides for delete
  to authenticated
  using (public.can_edit_page_content(page_id));

grant select on public.page_hero_slides to anon, authenticated;
grant insert, update, delete on public.page_hero_slides to authenticated;

-- At most 8 slides per page, and keep updated_at honest.
create or replace function public.guard_page_hero_slide()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.page_hero_slides where page_id = new.page_id) >= 8 then
      raise exception 'A page can have at most 8 hero slides.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists page_hero_slides_guard on public.page_hero_slides;
create trigger page_hero_slides_guard
  before insert or update on public.page_hero_slides
  for each row execute function public.guard_page_hero_slide();

-- Reorder in one round trip: p_ids is the full desired order.
create or replace function public.reorder_page_hero_slides(p_page_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_page_content(p_page_id) then
    raise exception 'You can''t edit this page.';
  end if;

  update public.page_hero_slides s
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where s.id = o.id
     and s.page_id = p_page_id;
end $$;

grant execute on function public.reorder_page_hero_slides(uuid, uuid[]) to authenticated;

-- ---- 2. Team showcase ------------------------------------------------------
-- Visitors only ever see members an admin ticked "Show on page" for. Nothing on
-- the public page reveals how many people are on the team.

alter table public.page_members
  add column if not exists show_on_page boolean not null default false,
  add column if not exists display_order smallint not null default 0;

create or replace function public.set_page_member_featured(
  p_page_id uuid,
  p_user_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next smallint;
begin
  if not exists (
    select 1 from public.page_members
     where page_id = p_page_id and user_id = auth.uid() and status = 'active' and is_admin
  ) then
    raise exception 'Only a page admin can choose who appears on the page.';
  end if;

  if p_featured then
    if (select count(*) from public.page_members
         where page_id = p_page_id and show_on_page and status = 'active' and user_id <> p_user_id) >= 12 then
      raise exception 'You can show up to 12 team members on the page.';
    end if;

    select coalesce(max(display_order), -1) + 1 into v_next
      from public.page_members
     where page_id = p_page_id and show_on_page;

    update public.page_members
       set show_on_page = true,
           display_order = case when show_on_page then display_order else v_next end
     where page_id = p_page_id and user_id = p_user_id and status = 'active';
  else
    update public.page_members
       set show_on_page = false
     where page_id = p_page_id and user_id = p_user_id;
  end if;
end $$;

grant execute on function public.set_page_member_featured(uuid, uuid, boolean) to authenticated;

-- p_user_ids is the full desired order of the featured members.
create or replace function public.reorder_page_featured_members(p_page_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.page_members
     where page_id = p_page_id and user_id = auth.uid() and status = 'active' and is_admin
  ) then
    raise exception 'Only a page admin can choose who appears on the page.';
  end if;

  update public.page_members m
     set display_order = o.ord - 1
    from unnest(p_user_ids) with ordinality as o(id, ord)
   where m.page_id = p_page_id
     and m.user_id = o.id;
end $$;

grant execute on function public.reorder_page_featured_members(uuid, uuid[]) to authenticated;
