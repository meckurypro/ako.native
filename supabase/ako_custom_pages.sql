-- ============================================================
-- Custom Pages: low-code landing pages published at myako.site/<slug>.
-- (Not Pages — those are account-like identities. See src/lib/customPage.ts.)
--
-- Applied to the "Ako" Supabase project as migration `ako_custom_pages`; this file mirrors what is live.
-- A page keeps a `draft` config (what the editor saves) and a `published` snapshot (what visitors see). Everything
-- is written through SECURITY DEFINER functions that validate the config (custom_page_config_problem) and check
-- ownership; the tables themselves only expose owner-scoped reads to the client.
-- Slugs share one namespace with Projects (/:slug): public_slug_in_use() and the two guard triggers enforce that in
-- both directions, and retired slugs keep resolving through custom_page_slug_history.
-- Safe to re-run: tables/indexes use IF NOT EXISTS, functions use CREATE OR REPLACE.
-- ============================================================

create table if not exists public.custom_pages (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  slug                text not null,
  name                text not null,
  visibility          text not null default 'public',
  is_published        boolean not null default false,
  draft               jsonb not null default '{}'::jsonb,
  published           jsonb,
  published_at        timestamptz,
  referred_by_page_id uuid references public.custom_pages(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint custom_pages_name_len check (char_length(btrim(name)) between 1 and 80),
  constraint custom_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  constraint custom_pages_visibility_check check (visibility in ('public', 'unlisted', 'private'))
);
create unique index if not exists custom_pages_slug_key on public.custom_pages (slug);
create index if not exists custom_pages_owner_idx on public.custom_pages (owner_id, updated_at desc);

-- Retired slugs: they keep redirecting, and can't be taken by anyone else.
create table if not exists public.custom_page_slug_history (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null,
  slug        text not null unique,
  replaced_at timestamptz not null default now()
);
create index if not exists custom_page_slug_history_page_idx on public.custom_page_slug_history (page_id);

create table if not exists public.custom_page_inquiries (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.custom_pages(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  name       text not null,
  contact    text not null,
  subject    text,
  message    text not null,
  status     text not null default 'new',
  created_at timestamptz not null default now(),
  constraint custom_page_inquiries_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint custom_page_inquiries_contact_check check (char_length(btrim(contact)) between 3 and 120),
  constraint custom_page_inquiries_subject_check check (subject is null or char_length(subject) <= 120),
  constraint custom_page_inquiries_message_check check (char_length(btrim(message)) between 1 and 2000),
  constraint custom_page_inquiries_status_check check (status in ('new', 'read', 'archived'))
);
create index if not exists custom_page_inquiries_page_idx on public.custom_page_inquiries (page_id, created_at desc);
create index if not exists custom_page_inquiries_new_idx on public.custom_page_inquiries (page_id) where status = 'new';

-- Analytics. Written only by record_custom_page_event(); read only through get_custom_page_stats().
create table if not exists public.custom_page_events (
  id         bigint generated always as identity primary key,
  page_id    uuid not null references public.custom_pages(id) on delete cascade,
  event_type text not null,
  cta_id     text,
  visitor_id text,
  created_at timestamptz not null default now()
);
create index if not exists custom_page_events_page_time_idx on public.custom_page_events (page_id, created_at desc);
create index if not exists custom_page_events_page_type_idx on public.custom_page_events (page_id, event_type);

alter table public.custom_pages enable row level security;
alter table public.custom_page_slug_history enable row level security;
alter table public.custom_page_inquiries enable row level security;
alter table public.custom_page_events enable row level security;

drop policy if exists "Owners read their custom pages" on public.custom_pages;
create policy "Owners read their custom pages" on public.custom_pages
  for select using (owner_id = (select auth.uid()));

drop policy if exists "Owners read their inquiries" on public.custom_page_inquiries;
create policy "Owners read their inquiries" on public.custom_page_inquiries
  for select using (exists (select 1 from public.custom_pages cp where cp.id = custom_page_inquiries.page_id and cp.owner_id = (select auth.uid())));
drop policy if exists "Owners update their inquiries" on public.custom_page_inquiries;
create policy "Owners update their inquiries" on public.custom_page_inquiries
  for update using (exists (select 1 from public.custom_pages cp where cp.id = custom_page_inquiries.page_id and cp.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.custom_pages cp where cp.id = custom_page_inquiries.page_id and cp.owner_id = (select auth.uid())));
drop policy if exists "Owners delete their inquiries" on public.custom_page_inquiries;
create policy "Owners delete their inquiries" on public.custom_page_inquiries
  for delete using (exists (select 1 from public.custom_pages cp where cp.id = custom_page_inquiries.page_id and cp.owner_id = (select auth.uid())));

-- ---- Slug namespace shared with Projects --------------------------------------------------------------------
create or replace function public.public_slug_in_use(p_slug text, p_exclude_project_id uuid default null, p_exclude_page_id uuid default null)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select
    exists (select 1 from public.projects where slug = p_slug and id is distinct from p_exclude_project_id)
    or exists (select 1 from public.project_slug_history where slug = p_slug and project_id is distinct from p_exclude_project_id)
    or exists (select 1 from public.custom_pages where slug = p_slug and id is distinct from p_exclude_page_id)
    or exists (select 1 from public.custom_page_slug_history where slug = p_slug and page_id is distinct from p_exclude_page_id);
$function$;

create or replace function public.guard_custom_page_slug_vs_projects()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ako_public_slug:' || new.slug, 0));

  if exists (select 1 from public.projects where slug = new.slug)
     or exists (select 1 from public.project_slug_history where slug = new.slug)
     or exists (
       select 1 from public.custom_page_slug_history
       where slug = new.slug and page_id is distinct from new.id
     ) then
    raise exception 'That link is already taken. Try another.';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_custom_page_slug_vs_projects on public.custom_pages;
create trigger guard_custom_page_slug_vs_projects
  before insert or update on public.custom_pages
  for each row execute function public.guard_custom_page_slug_vs_projects();

create or replace function public.guard_project_slug_vs_pages()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.slug is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ako_public_slug:' || new.slug, 0));

  if exists (select 1 from public.custom_pages where slug = new.slug)
     or exists (select 1 from public.custom_page_slug_history where slug = new.slug) then
    raise exception 'That link is already taken. Try another.';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_project_slug_vs_pages on public.projects;
create trigger guard_project_slug_vs_pages
  before insert or update of slug on public.projects
  for each row execute function public.guard_project_slug_vs_pages();

-- ---- Config validation. Drafts save leniently (p_strict = false: lengths and shapes only, so a half-typed email or an
-- ---- unfinished button never blocks autosave); publishing validates strictly. Client twins: draftProblem / publishProblem
-- ---- in src/lib/customPage.ts. -----------------------------------------------------------------------------------
-- ---- Numeric range helper for the validator: true when the value is present but not a number inside [lo, hi]. ----
create or replace function public.custom_page_num_bad(p_val jsonb, p_lo numeric, p_hi numeric)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_val is not null
     and jsonb_typeof(p_val) <> 'null'
     and (jsonb_typeof(p_val) <> 'number' or (p_val #>> '{}')::numeric not between p_lo and p_hi);
$function$;

drop function if exists public.custom_page_config_problem(jsonb, uuid);
create or replace function public.custom_page_config_problem(p_config jsonb, p_owner uuid, p_strict boolean default true)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_prefix text := p_owner::text || '/';
  v_el jsonb;
  v_text text;
  v_action text;
  v_ids text[] := '{}';
  v_id text;
  v_label text;
  v_n integer := 0;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return 'Invalid page content.';
  end if;
  if octet_length(p_config::text) > 60000 then
    return 'This page has too much content. Remove something and try again.';
  end if;

  if jsonb_typeof(coalesce(p_config -> 'identity', '{}'::jsonb)) <> 'object' then return 'Invalid page identity.'; end if;
  if char_length(coalesce(p_config #>> '{identity,name}', '')) > 80 then return 'Page name must be 80 characters or fewer.'; end if;
  if char_length(coalesce(p_config #>> '{identity,tagline}', '')) > 140 then return 'Tagline must be 140 characters or fewer.'; end if;
  if char_length(coalesce(p_config #>> '{identity,intro}', '')) > 1500 then return 'The page message must be 1500 characters or fewer.'; end if;
  if char_length(coalesce(p_config #>> '{identity,copyright}', '')) > 160 then return 'The copyright line must be 160 characters or fewer.'; end if;

  foreach v_text in array array['primary', 'secondary', 'accent'] loop
    if p_config #>> array['brand', v_text] is not null
       and p_config #>> array['brand', v_text] !~ '^#[0-9a-fA-F]{6}$' then
      return 'Colours must be hex values like #3D5A45.';
    end if;
  end loop;

  if coalesce(p_config #>> '{contact,email}', '') <> ''
     and (char_length(p_config #>> '{contact,email}') > 120
          or (p_strict and p_config #>> '{contact,email}' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')) then
    return 'Enter a valid contact email address.';
  end if;
  if coalesce(p_config #>> '{contact,phone}', '') <> ''
     and (char_length(p_config #>> '{contact,phone}') > 30
          or (p_strict and p_config #>> '{contact,phone}' !~ '^[0-9+()\-\s.]{5,30}$')) then
    return 'Enter a valid contact phone number.';
  end if;
  if char_length(coalesce(p_config #>> '{contact,address}', '')) > 240 then return 'The address must be 240 characters or fewer.'; end if;

  foreach v_text in array array['style', 'template', 'animation'] loop
    if p_config #>> array['design', v_text] is not null
       and p_config #>> array['design', v_text] !~ '^[a-z][a-z0-9-]{0,23}$' then
      return 'Invalid design setting.';
    end if;
  end loop;

  foreach v_text in array array['identity,icon_path', 'seo,share_image_path', 'document,path', 'brand,background,path', 'foreground,path'] loop
    if p_config #>> string_to_array(v_text, ',') is not null
       and (p_config #>> string_to_array(v_text, ',') not like v_prefix || '%'
            or p_config #>> string_to_array(v_text, ',') like '%..%') then
      return 'A file on this page is not valid. Re-upload it and try again.';
    end if;
  end loop;
  if char_length(coalesce(p_config #>> '{document,title}', '')) > 120 then return 'The document title must be 120 characters or fewer.'; end if;

  if jsonb_typeof(coalesce(p_config -> 'brand' -> 'hero', '[]'::jsonb)) <> 'array' then return 'Invalid hero images.'; end if;
  if jsonb_array_length(coalesce(p_config -> 'brand' -> 'hero', '[]'::jsonb)) > 8 then return 'Use up to 8 hero images.'; end if;
  for v_el in select * from jsonb_array_elements(coalesce(p_config -> 'brand' -> 'hero', '[]'::jsonb)) loop
    v_text := v_el ->> 'path';
    if v_text is null or v_text not like v_prefix || '%' or v_text like '%..%' then
      return 'A hero image is not valid. Re-upload it and try again.';
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_config -> 'gallery', '[]'::jsonb)) <> 'array' then return 'Invalid gallery.'; end if;
  if jsonb_array_length(coalesce(p_config -> 'gallery', '[]'::jsonb)) > 24 then return 'Use up to 24 gallery images.'; end if;
  for v_el in select * from jsonb_array_elements(coalesce(p_config -> 'gallery', '[]'::jsonb)) loop
    v_text := v_el ->> 'path';
    if v_text is null or v_text not like v_prefix || '%' or v_text like '%..%' then
      return 'A gallery image is not valid. Re-upload it and try again.';
    end if;
    if char_length(coalesce(v_el ->> 'caption', '')) > 160 then return 'Gallery captions must be 160 characters or fewer.'; end if;
  end loop;

  -- Page background picture: a file in the owner's folder plus two short slugs (fit, look).
  if p_config -> 'brand' -> 'background' is not null and jsonb_typeof(p_config -> 'brand' -> 'background') <> 'object' then
    return 'Invalid background.';
  end if;
  foreach v_text in array array['fit', 'look'] loop
    if p_config #>> array['brand', 'background', v_text] is not null
       and p_config #>> array['brand', 'background', v_text] !~ '^[a-z][a-z0-9-]{0,23}$' then
      return 'Invalid background setting.';
    end if;
  end loop;

  -- Foreground picture: shape is a short slug (or "none"); placement, rotation, crop and shadow are bounded numbers.
  if p_config -> 'foreground' is not null then
    if jsonb_typeof(p_config -> 'foreground') <> 'object' then return 'Invalid foreground picture.'; end if;
    if p_config #>> '{foreground,shape}' is not null and p_config #>> '{foreground,shape}' !~ '^[a-z][a-z0-9-]{0,23}$' then
      return 'Invalid foreground shape.';
    end if;
    if public.custom_page_num_bad(p_config #> '{foreground,size}', 5, 100)
       or public.custom_page_num_bad(p_config #> '{foreground,x}', 0, 100)
       or public.custom_page_num_bad(p_config #> '{foreground,y}', 0, 100)
       or public.custom_page_num_bad(p_config #> '{foreground,rotation}', -360, 360) then
      return 'The foreground picture''s size, position or rotation is out of range.';
    end if;
    if (p_config #> '{foreground,crop}' is not null and jsonb_typeof(p_config #> '{foreground,crop}') <> 'object')
       or public.custom_page_num_bad(p_config #> '{foreground,crop,zoom}', 1, 5)
       or public.custom_page_num_bad(p_config #> '{foreground,crop,x}', 0, 100)
       or public.custom_page_num_bad(p_config #> '{foreground,crop,y}', 0, 100) then
      return 'The foreground picture''s crop is out of range.';
    end if;
    if (p_config #> '{foreground,shadow}' is not null and jsonb_typeof(p_config #> '{foreground,shadow}') <> 'object')
       or public.custom_page_num_bad(p_config #> '{foreground,shadow,intensity}', 0, 100)
       or public.custom_page_num_bad(p_config #> '{foreground,shadow,angle}', 0, 360)
       or (p_config #> '{foreground,shadow,enabled}' is not null and jsonb_typeof(p_config #> '{foreground,shadow,enabled}') <> 'boolean') then
      return 'The foreground picture''s shadow is out of range.';
    end if;
  end if;

  -- Page menu: up to 6 items, each a short label that points at a section slug.
  if p_config -> 'nav' is not null then
    if jsonb_typeof(p_config -> 'nav') <> 'object' then return 'Invalid menu.'; end if;
    foreach v_text in array array['scroll', 'position', 'look'] loop
      if p_config #>> array['nav', v_text] is not null and p_config #>> array['nav', v_text] !~ '^[a-z][a-z0-9-]{0,23}$' then
        return 'Invalid menu setting.';
      end if;
    end loop;
    if p_config #> '{nav,enabled}' is not null and jsonb_typeof(p_config #> '{nav,enabled}') <> 'boolean' then return 'Invalid menu setting.'; end if;
    if jsonb_typeof(coalesce(p_config #> '{nav,items}', '[]'::jsonb)) <> 'array' then return 'Invalid menu items.'; end if;
    if jsonb_array_length(coalesce(p_config #> '{nav,items}', '[]'::jsonb)) > 6 then return 'Use up to 6 menu items.'; end if;
    v_ids := '{}';
    v_n := 0;
    for v_el in select * from jsonb_array_elements(coalesce(p_config #> '{nav,items}', '[]'::jsonb)) loop
      v_n := v_n + 1;
      v_id := v_el ->> 'id';
      if v_id is null or v_id !~ '^[a-z0-9-]{1,24}$' then return 'A menu item is missing its id.'; end if;
      if v_id = any (v_ids) then return 'Two menu items share an id.'; end if;
      v_ids := v_ids || v_id;
      if char_length(btrim(coalesce(v_el ->> 'label', ''))) > 24 then
        return format('Menu item %s: the label must be 24 characters or fewer.', v_n);
      end if;
      if p_strict and char_length(btrim(coalesce(v_el ->> 'label', ''))) = 0 then
        return format('Menu item %s needs a label.', v_n);
      end if;
      if coalesce(v_el ->> 'target', '') !~ '^[a-z][a-z0-9-]{0,23}$' then
        return format('Menu item %s needs a section to go to.', v_n);
      end if;
    end loop;
    v_ids := '{}';
    v_n := 0;
  end if;

  if jsonb_typeof(coalesce(p_config -> 'ctas', '[]'::jsonb)) <> 'array' then return 'Invalid buttons.'; end if;
  if jsonb_array_length(coalesce(p_config -> 'ctas', '[]'::jsonb)) > 6 then return 'Use up to 6 buttons.'; end if;
  for v_el in select * from jsonb_array_elements(coalesce(p_config -> 'ctas', '[]'::jsonb)) loop
    v_n := v_n + 1;
    v_id := v_el ->> 'id';
    if v_id is null or v_id !~ '^[a-z0-9-]{1,24}$' then return 'A button is missing its id.'; end if;
    if v_id = any (v_ids) then return 'Two buttons share an id.'; end if;
    v_ids := v_ids || v_id;

    v_label := btrim(coalesce(v_el ->> 'label', ''));
    if char_length(v_label) > 40 then
      return format('Button %s: the label must be 40 characters or fewer.', v_n);
    end if;
    if p_strict and char_length(v_label) = 0 then
      return format('Button %s needs a label.', v_n);
    end if;

    v_action := v_el ->> 'action';
    if v_action is null or v_action not in ('url', 'ako', 'message', 'inquiry', 'download', 'email', 'call') then
      return format('Button %s has an unknown action.', v_n);
    end if;

    v_text := coalesce(v_el ->> 'url', '');
    if char_length(v_text) > 500 then
      return format('Button %s: the link is too long.', v_n);
    end if;

    if v_action = 'url' and p_strict then
      if v_text !~* '^https?://[^\s]+$' then
        return format('Button "%s" needs a full web address starting with http:// or https://.', v_label);
      end if;
    elsif v_action = 'ako' and p_strict then
      if v_text !~ '^/[A-Za-z0-9/_.~%?=&#-]*$' or v_text like '//%' or char_length(v_text) > 200 then
        return format('Button "%s" needs a valid Akọ link.', v_label);
      end if;
    elsif v_action = 'download' then
      v_text := v_el ->> 'file_path';
      if v_text is null then
        if p_strict then return format('Button "%s" needs an uploaded file.', v_label); end if;
      elsif v_text not like v_prefix || '%' or v_text like '%..%' then
        return format('The file for button "%s" is not valid. Re-upload it.', v_label);
      end if;
    elsif v_action = 'email' and p_strict and coalesce(p_config #>> '{contact,email}', '') = '' then
      return format('Button "%s" sends an email — add your contact email first.', v_label);
    elsif v_action = 'call' and p_strict and coalesce(p_config #>> '{contact,phone}', '') = '' then
      return format('Button "%s" makes a call — add your contact phone number first.', v_label);
    end if;
  end loop;

  return null;
end;
$function$;

-- ---- Owner actions -------------------------------------------------------------------------------------------
create or replace function public.create_custom_page(p_name text, p_slug text, p_ref_slug text default null)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_ref uuid;
  v_page public.custom_pages;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.fn_can_access_feature('custom_pages', v_uid) then
    raise exception 'Custom pages are not available on your account yet.';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Give your page a name (up to 80 characters).';
  end if;
  if char_length(v_slug) not between 3 and 60 then
    raise exception 'Link must be between 3 and 60 characters';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Link can only contain lowercase letters, numbers, and single hyphens between them';
  end if;
  if public.is_reserved_project_slug(v_slug) then
    raise exception 'That link is reserved. Please choose another.';
  end if;
  if (select count(*) from public.custom_pages where owner_id = v_uid) >= 10 then
    raise exception 'You can have up to 10 custom pages. Delete one to make another.';
  end if;

  if p_ref_slug is not null then
    select id into v_ref from public.custom_pages where slug = lower(trim(p_ref_slug)) and is_published;
  end if;

  begin
    insert into public.custom_pages (owner_id, slug, name, draft, referred_by_page_id)
    values (
      v_uid, v_slug, v_name,
      jsonb_build_object('v', 1, 'identity', jsonb_build_object('name', v_name)),
      v_ref
    )
    returning * into v_page;
  exception when unique_violation then
    raise exception 'That link is already taken. Try another.';
  end;

  return v_page;
end;
$function$;

create or replace function public.save_custom_page_draft(p_page_id uuid, p_config jsonb)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_page public.custom_pages;
  v_problem text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_page from public.custom_pages where id = p_page_id;
  if v_page.id is null or v_page.owner_id <> v_uid then
    raise exception 'Page not found';
  end if;

  v_problem := public.custom_page_config_problem(p_config, v_page.owner_id, false);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  v_name := btrim(coalesce(p_config #>> '{identity,name}', ''));
  if v_name = '' then
    v_name := v_page.name;
  end if;

  update public.custom_pages
  set draft = p_config, name = v_name, updated_at = now()
  where id = p_page_id
  returning * into v_page;

  return v_page;
end;
$function$;

create or replace function public.publish_custom_page(p_page_id uuid)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_page public.custom_pages;
  v_problem text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.fn_can_access_feature('custom_pages', v_uid) then
    raise exception 'Custom pages are not available on your account yet.';
  end if;

  select * into v_page from public.custom_pages where id = p_page_id;
  if v_page.id is null or v_page.owner_id <> v_uid then
    raise exception 'Page not found';
  end if;

  v_problem := public.custom_page_config_problem(v_page.draft, v_page.owner_id, true);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;
  if btrim(coalesce(v_page.draft #>> '{identity,name}', '')) = '' then
    raise exception 'Give your page a name before publishing.';
  end if;

  update public.custom_pages
  set published = draft, is_published = true, published_at = coalesce(published_at, now()), updated_at = now()
  where id = p_page_id
  returning * into v_page;

  return v_page;
end;
$function$;

create or replace function public.unpublish_custom_page(p_page_id uuid)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.custom_pages;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  update public.custom_pages
  set is_published = false, updated_at = now()
  where id = p_page_id and owner_id = auth.uid()
  returning * into v_page;

  if v_page.id is null then
    raise exception 'Page not found';
  end if;
  return v_page;
end;
$function$;

create or replace function public.set_custom_page_visibility(p_page_id uuid, p_visibility text)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.custom_pages;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_visibility not in ('public', 'unlisted', 'private') then
    raise exception 'Invalid visibility';
  end if;

  update public.custom_pages
  set visibility = p_visibility, updated_at = now()
  where id = p_page_id and owner_id = auth.uid()
  returning * into v_page;

  if v_page.id is null then
    raise exception 'Page not found';
  end if;
  return v_page;
end;
$function$;

create or replace function public.set_custom_page_slug(p_page_id uuid, p_slug text)
returns public.custom_pages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_page public.custom_pages;
  v_old text;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;

  select * into v_page from public.custom_pages where id = p_page_id;
  if v_page.id is null or v_page.owner_id <> v_uid then
    raise exception 'Page not found';
  end if;

  if char_length(v_slug) not between 3 and 60 then
    raise exception 'Link must be between 3 and 60 characters';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Link can only contain lowercase letters, numbers, and single hyphens between them';
  end if;
  if public.is_reserved_project_slug(v_slug) then
    raise exception 'That link is reserved. Please choose another.';
  end if;

  v_old := v_page.slug;
  if v_old = v_slug then
    return v_page;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ako_public_slug:' || v_slug, 0));

  if public.public_slug_in_use(v_slug, null, p_page_id) then
    raise exception 'That link is already taken. Try another.';
  end if;

  delete from public.custom_page_slug_history where slug = v_slug and page_id = p_page_id;

  insert into public.custom_page_slug_history (page_id, slug) values (p_page_id, v_old)
  on conflict (slug) do nothing;

  begin
    update public.custom_pages set slug = v_slug, updated_at = now()
    where id = p_page_id
    returning * into v_page;
  exception when unique_violation then
    raise exception 'That link is already taken. Try another.';
  end;

  return v_page;
end;
$function$;

create or replace function public.check_custom_page_slug_available(p_slug text, p_exclude_page_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_slug text := lower(trim(p_slug));
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 60 then
    return false;
  end if;
  if public.is_reserved_project_slug(v_slug) then
    return false;
  end if;
  return not public.public_slug_in_use(v_slug, null, p_exclude_page_id);
end;
$function$;

create or replace function public.delete_custom_page(p_page_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.custom_pages;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into v_page from public.custom_pages where id = p_page_id and owner_id = auth.uid();
  if v_page.id is null then
    raise exception 'Page not found';
  end if;

  -- The link stays reserved after deletion so a printed QR code can't be hijacked by someone else's page.
  insert into public.custom_page_slug_history (page_id, slug) values (v_page.id, v_page.slug)
  on conflict (slug) do nothing;

  delete from public.custom_pages where id = v_page.id;
end;
$function$;

create or replace function public.list_my_custom_pages()
returns table(id uuid, slug text, name text, visibility text, is_published boolean, has_unpublished_changes boolean,
              published_at timestamptz, updated_at timestamptz, icon_path text, new_inquiries bigint, views_30d bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    cp.id, cp.slug, cp.name, cp.visibility, cp.is_published,
    (cp.published is distinct from cp.draft) as has_unpublished_changes,
    cp.published_at, cp.updated_at,
    cp.draft #>> '{identity,icon_path}' as icon_path,
    (select count(*) from public.custom_page_inquiries i where i.page_id = cp.id and i.status = 'new') as new_inquiries,
    (select count(*) from public.custom_page_events e
       where e.page_id = cp.id and e.event_type = 'view' and e.created_at > now() - interval '30 days') as views_30d
  from public.custom_pages cp
  where cp.owner_id = auth.uid()
  order by cp.updated_at desc;
$function$;

-- ---- Public / visitor side -----------------------------------------------------------------------------------
create or replace function public.get_public_custom_page(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_page public.custom_pages;
  v_owner public.profiles;
  v_is_owner boolean;
  v_state text;
begin
  if v_slug = '' then
    return null;
  end if;

  select * into v_page from public.custom_pages where slug = v_slug;
  if v_page.id is null then
    select cp.* into v_page
    from public.custom_page_slug_history h
    join public.custom_pages cp on cp.id = h.page_id
    where h.slug = v_slug;
  end if;
  if v_page.id is null then
    return null;
  end if;

  select * into v_owner from public.profiles where id = v_page.owner_id;
  if v_owner.id is null or coalesce(v_owner.is_deleted, false) or v_owner.account_status <> 'approved' then
    return null;
  end if;

  v_is_owner := (select auth.uid()) is not null and v_page.owner_id = (select auth.uid());

  if not v_is_owner then
    if not v_page.is_published or v_page.visibility = 'private' then
      return null;
    end if;
    v_state := 'live';
  else
    v_state := case
      when not v_page.is_published then 'unpublished'
      when v_page.visibility = 'private' then 'private'
      else 'live'
    end;
  end if;

  return jsonb_build_object(
    'id', v_page.id,
    'slug', v_page.slug,
    'name', v_page.name,
    'state', v_state,
    'is_owner', v_is_owner,
    'visibility', v_page.visibility,
    'published_at', v_page.published_at,
    'config', coalesce(v_page.published, v_page.draft),
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'username', v_owner.username,
      'display_name', v_owner.display_name,
      'avatar_url', v_owner.avatar_url
    )
  );
end;
$function$;

create or replace function public.submit_custom_page_inquiry(
  p_page_id uuid, p_name text, p_contact text, p_subject text, p_message text, p_hp text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_page public.custom_pages;
  v_name text := btrim(coalesce(p_name, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  -- Honeypot: a real person never fills the hidden field. Pretend it worked.
  if coalesce(p_hp, '') <> '' then
    return gen_random_uuid();
  end if;

  select * into v_page from public.custom_pages where id = p_page_id;
  if v_page.id is null or not v_page.is_published or v_page.visibility = 'private'
     or coalesce((v_page.published #>> '{engagement,inquiry}')::boolean, true) is not true then
    raise exception 'This page is not accepting messages.';
  end if;

  if char_length(v_name) not between 1 and 80 then raise exception 'Please enter your name.'; end if;
  if char_length(v_contact) not between 3 and 120 then raise exception 'Please enter an email address or phone number.'; end if;
  if v_contact !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and v_contact !~ '^[0-9+()\-\s.]{5,30}$' then
    raise exception 'Enter a valid email address or phone number.';
  end if;
  if v_subject is not null and char_length(v_subject) > 120 then raise exception 'The subject is too long.'; end if;
  if char_length(v_message) not between 1 and 2000 then raise exception 'Please write a message (up to 2000 characters).'; end if;

  if (select count(*) from public.custom_page_inquiries
        where page_id = p_page_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'This page is receiving a lot of messages right now. Please try again later.';
  end if;
  if (select count(*) from public.custom_page_inquiries
        where page_id = p_page_id and lower(contact) = lower(v_contact) and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'You''ve already sent a few messages. Please wait a while before sending another.';
  end if;
  if v_uid is not null and (select count(*) from public.custom_page_inquiries
        where sender_id = v_uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You''re sending messages too quickly. Please try again later.';
  end if;

  insert into public.custom_page_inquiries (page_id, sender_id, name, contact, subject, message)
  values (p_page_id, v_uid, v_name, v_contact, v_subject, v_message)
  returning id into v_id;

  insert into public.custom_page_events (page_id, event_type) values (p_page_id, 'inquiry');

  perform public.create_notification(
    v_page.owner_id,
    'custom_page_inquiry',
    v_uid,
    'custom_page',
    v_page.id,
    left(v_name || ' · ' || v_page.name, 140)
  );

  return v_id;
end;
$function$;

create or replace function public.record_custom_page_event(
  p_page_id uuid, p_type text, p_cta_id text default null, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_page public.custom_pages;
  v_visitor text := nullif(left(btrim(coalesce(p_visitor, '')), 64), '');
  v_cta text := nullif(btrim(coalesce(p_cta_id, '')), '');
begin
  if p_type not in ('view', 'cta_click', 'download', 'create_click') then
    return;
  end if;
  if v_cta is not null and v_cta !~ '^[a-z0-9-]{1,24}$' then
    return;
  end if;

  select * into v_page from public.custom_pages where id = p_page_id;
  if v_page.id is null or not v_page.is_published or v_page.visibility = 'private' then
    return;
  end if;
  -- The owner browsing their own page isn't traffic.
  if (select auth.uid()) is not null and v_page.owner_id = (select auth.uid()) then
    return;
  end if;

  if v_visitor is not null then
    if p_type = 'view' and exists (
      select 1 from public.custom_page_events
      where page_id = p_page_id and event_type = 'view' and visitor_id = v_visitor
        and created_at > now() - interval '30 minutes'
    ) then
      return;
    end if;
    if p_type <> 'view' and exists (
      select 1 from public.custom_page_events
      where page_id = p_page_id and event_type = p_type and visitor_id = v_visitor
        and cta_id is not distinct from v_cta
        and created_at > now() - interval '5 seconds'
    ) then
      return;
    end if;
  end if;

  insert into public.custom_page_events (page_id, event_type, cta_id, visitor_id)
  values (p_page_id, p_type, v_cta, v_visitor);
exception when others then
  return;
end;
$function$;

create or replace function public.get_custom_page_stats(p_page_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.custom_pages where id = p_page_id and owner_id = auth.uid()) then
    raise exception 'Page not found';
  end if;

  v_since := date_trunc('day', now()) - ((v_days - 1) || ' days')::interval;

  select jsonb_build_object(
    'days', v_days,
    'views', count(*) filter (where event_type = 'view'),
    'visitors', count(distinct visitor_id) filter (where event_type = 'view'),
    'clicks', count(*) filter (where event_type = 'cta_click'),
    'downloads', count(*) filter (where event_type = 'download'),
    'inquiries', count(*) filter (where event_type = 'inquiry'),
    'create_clicks', count(*) filter (where event_type = 'create_click')
  ) into v_result
  from public.custom_page_events
  where page_id = p_page_id and created_at >= v_since;

  return v_result || jsonb_build_object(
    'per_cta', coalesce((
      select jsonb_agg(jsonb_build_object('cta_id', cta_id, 'event_type', event_type, 'count', c) order by c desc)
      from (
        select cta_id, event_type, count(*) as c
        from public.custom_page_events
        where page_id = p_page_id and created_at >= v_since
          and event_type in ('cta_click', 'download') and cta_id is not null
        group by cta_id, event_type
      ) t
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(v.views, 0)) order by d)
      from generate_series(v_since, date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', created_at) as day, count(*) as views
        from public.custom_page_events
        where page_id = p_page_id and event_type = 'view' and created_at >= v_since
        group by 1
      ) v on v.day = d
    ), '[]'::jsonb)
  );
end;
$function$;

-- ---- Grants (anon is default-deny since the hardening migrations) -------------------------------------------
revoke all on function public.create_custom_page(text, text, text) from public, anon;
revoke all on function public.save_custom_page_draft(uuid, jsonb) from public, anon;
revoke all on function public.publish_custom_page(uuid) from public, anon;
revoke all on function public.unpublish_custom_page(uuid) from public, anon;
revoke all on function public.set_custom_page_visibility(uuid, text) from public, anon;
revoke all on function public.set_custom_page_slug(uuid, text) from public, anon;
revoke all on function public.check_custom_page_slug_available(text, uuid) from public, anon;
revoke all on function public.delete_custom_page(uuid) from public, anon;
revoke all on function public.list_my_custom_pages() from public, anon;
revoke all on function public.get_custom_page_stats(uuid, integer) from public, anon;
grant execute on function public.create_custom_page(text, text, text) to authenticated;
grant execute on function public.save_custom_page_draft(uuid, jsonb) to authenticated;
grant execute on function public.publish_custom_page(uuid) to authenticated;
grant execute on function public.unpublish_custom_page(uuid) to authenticated;
grant execute on function public.set_custom_page_visibility(uuid, text) to authenticated;
grant execute on function public.set_custom_page_slug(uuid, text) to authenticated;
grant execute on function public.check_custom_page_slug_available(text, uuid) to authenticated;
grant execute on function public.delete_custom_page(uuid) to authenticated;
grant execute on function public.list_my_custom_pages() to authenticated;
grant execute on function public.get_custom_page_stats(uuid, integer) to authenticated;
-- Visitors (signed out included):
grant execute on function public.get_public_custom_page(text) to anon, authenticated;
grant execute on function public.record_custom_page_event(uuid, text, text, text) to anon, authenticated;
grant execute on function public.submit_custom_page_inquiry(uuid, text, text, text, text, text) to anon, authenticated;

-- Internal helpers and trigger functions are never callable from the API (migration custom_pages_revoke_trigger_fn_execute).
revoke all on function public.public_slug_in_use(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.guard_custom_page_slug_vs_projects() from public, anon, authenticated;
revoke all on function public.guard_project_slug_vs_pages() from public, anon, authenticated;

-- ---- Storage: public bucket, writes confined to <user id>/… --------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-pages', 'custom-pages', true, 104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/csv', 'text/plain']
)
on conflict (id) do nothing;
-- Files up to 100 MB (was 30 MB). `on conflict do nothing` won't touch an existing bucket, so set it explicitly.
update storage.buckets set file_size_limit = 104857600 where id = 'custom-pages';

drop policy if exists "Custom page files are publicly readable" on storage.objects;
create policy "Custom page files are publicly readable" on storage.objects
  for select using (bucket_id = 'custom-pages');
drop policy if exists "Owners upload custom page files" on storage.objects;
create policy "Owners upload custom page files" on storage.objects
  for insert with check (bucket_id = 'custom-pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners update custom page files" on storage.objects;
create policy "Owners update custom page files" on storage.objects
  for update using (bucket_id = 'custom-pages' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Owners delete custom page files" on storage.objects;
create policy "Owners delete custom page files" on storage.objects
  for delete using (bucket_id = 'custom-pages' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---- Design presets ------------------------------------------------------------------------------------------
-- A creator's saved looks for the editor's Design tab: style, template, animation and the share button. They belong to
-- the person, not to a page, so one preset can be applied to any of their pages (web and native read the same rows).
-- Colours, content and uploaded images are deliberately not part of a preset. Writes go through the functions below.
create table if not exists public.custom_page_presets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  design      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint custom_page_presets_name_len check (char_length(btrim(name)) between 1 and 40),
  constraint custom_page_presets_design_object check (jsonb_typeof(design) = 'object')
);
create unique index if not exists custom_page_presets_owner_name_key on public.custom_page_presets (owner_id, lower(btrim(name)));

alter table public.custom_page_presets enable row level security;

drop policy if exists "Owners read their presets" on public.custom_page_presets;
create policy "Owners read their presets" on public.custom_page_presets
  for select using (owner_id = (select auth.uid()));

-- Pure validator for a preset's design object (same short-slug rule as custom_page_config_problem). NULL = valid.
create or replace function public.custom_page_preset_problem(p_design jsonb)
returns text
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_key text;
begin
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    return 'Invalid preset.';
  end if;

  for v_key in select jsonb_object_keys(p_design) loop
    if v_key not in ('style', 'template', 'animation', 'share') then
      return 'Invalid preset.';
    end if;
  end loop;

  foreach v_key in array array['style', 'template', 'animation'] loop
    if p_design -> v_key is not null
       and (jsonb_typeof(p_design -> v_key) <> 'string' or p_design ->> v_key !~ '^[a-z][a-z0-9-]{0,23}$') then
      return 'Invalid design setting.';
    end if;
  end loop;

  if p_design -> 'share' is not null then
    if jsonb_typeof(p_design -> 'share') <> 'object' then
      return 'Invalid share button setting.';
    end if;
    for v_key in select jsonb_object_keys(p_design -> 'share') loop
      if v_key not in ('enabled', 'look', 'position') then
        return 'Invalid share button setting.';
      end if;
    end loop;
    if p_design #> '{share,enabled}' is not null and jsonb_typeof(p_design #> '{share,enabled}') <> 'boolean' then
      return 'Invalid share button setting.';
    end if;
    if p_design #> '{share,look}' is not null
       and (jsonb_typeof(p_design #> '{share,look}') <> 'string' or p_design #>> '{share,look}' not in ('auto', 'minimal', 'round', 'pill')) then
      return 'Invalid share button setting.';
    end if;
    if p_design #> '{share,position}' is not null
       and (jsonb_typeof(p_design #> '{share,position}') <> 'string'
            or p_design #>> '{share,position}' not in ('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')) then
      return 'Invalid share button setting.';
    end if;
  end if;

  return null;
end;
$function$;

create or replace function public.list_my_custom_page_presets()
returns table(id uuid, name text, design jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.name, p.design, p.updated_at
  from public.custom_page_presets p
  where p.owner_id = auth.uid()
  order by lower(p.name);
$function$;

-- Saves a preset. With p_preset_id it overwrites (and may rename) that preset; without it, it creates one.
create or replace function public.save_custom_page_preset(p_name text, p_design jsonb, p_preset_id uuid default null)
returns public.custom_page_presets
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_problem text;
  v_row public.custom_page_presets;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.fn_can_access_feature('custom_pages', v_uid) then
    raise exception 'Custom pages are not available on your account yet.';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'Give your preset a name (up to 40 characters).';
  end if;
  v_problem := public.custom_page_preset_problem(p_design);
  if v_problem is not null then
    raise exception '%', v_problem;
  end if;

  if p_preset_id is null then
    if (select count(*) from public.custom_page_presets where owner_id = v_uid) >= 20 then
      raise exception 'You can keep up to 20 presets. Delete one to save another.';
    end if;
    insert into public.custom_page_presets (owner_id, name, design)
    values (v_uid, v_name, p_design)
    returning * into v_row;
  else
    update public.custom_page_presets
    set name = v_name, design = p_design, updated_at = now()
    where id = p_preset_id and owner_id = v_uid
    returning * into v_row;
    if v_row.id is null then
      raise exception 'Preset not found';
    end if;
  end if;

  return v_row;
exception
  when unique_violation then
    raise exception 'You already have a preset called "%".', v_name;
end;
$function$;

create or replace function public.delete_custom_page_preset(p_preset_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from public.custom_page_presets where id = p_preset_id and owner_id = auth.uid();
  if not found then
    raise exception 'Preset not found';
  end if;
end;
$function$;

revoke all on function public.custom_page_preset_problem(jsonb) from public, anon, authenticated;
revoke all on function public.list_my_custom_page_presets() from public, anon;
revoke all on function public.save_custom_page_preset(text, jsonb, uuid) from public, anon;
revoke all on function public.delete_custom_page_preset(uuid) from public, anon;
grant execute on function public.list_my_custom_page_presets() to authenticated;
grant execute on function public.save_custom_page_preset(text, jsonb, uuid) to authenticated;
grant execute on function public.delete_custom_page_preset(uuid) to authenticated;
