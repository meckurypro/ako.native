-- ako_thumbnail_shapes.sql
--
-- One shape per kind of project thumbnail, enforced where it is created and drawn the same everywhere.
-- Mirrors src/lib/thumbnailSpec.ts (web and native) — keep the three in step.
--
--   book 2:3 · audio 1:1 · video 16:9 · talent (gig) 2:1 · group (room) 1:1 · event 4:5 · pitch 5:4
--   course 4:3 · meeting 3:2 · link (url) 2:1 · file: no thumbnail
--   media is one project type for audio and video: the app picks 16:9 when it has a video, else 1:1, so the
--   database accepts either for media (the app enforces which).
--
-- Applied to the production "Ako" project as migrations:
--   ako_thumbnail_shape_column        (step 1: column, snapping, backfill)
--   ako_discover_audio_video_split    (see ako_discover_projects.sql)
--   ako_thumbnail_shape_enforcement   (step 2: reject off-shape thumbnails)

-- ---- Step 1 ---------------------------------------------------------------------------------------------------
-- projects.thumbnail_shape is derived from thumbnail_width / thumbnail_height by the trigger below, never trusted from
-- a client. NULL when there is no thumbnail or its shape is not a standard one (older uploads).
alter table public.projects add column if not exists thumbnail_shape text;

create or replace function public.snap_thumbnail_shape(w integer, h integer)
returns text
language sql
immutable
set search_path = public
as $$
  select s.shape
  from (values
    ('1:1',  1.0::numeric),
    ('16:9', 16.0::numeric / 9),
    ('2:3',  2.0::numeric / 3),
    ('2:1',  2.0::numeric),
    ('4:5',  0.8::numeric),
    ('5:4',  1.25::numeric),
    ('4:3',  4.0::numeric / 3),
    ('3:2',  1.5::numeric)
  ) as s(shape, r)
  where w is not null and h is not null and w > 0 and h > 0
    and abs(w::numeric / h - s.r) / s.r <= 0.02
  order by abs(w::numeric / h - s.r)
  limit 1
$$;

-- ---- Step 2 ---------------------------------------------------------------------------------------------------
-- Shapes a project of each type may carry.
create or replace function public.thumbnail_allowed_shapes(p_type text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_type
    when 'book'    then array['2:3']
    when 'gig'     then array['2:1']
    when 'media'   then array['1:1', '16:9']
    when 'room'    then array['1:1']
    when 'event'   then array['4:5']
    when 'pitch'   then array['5:4']
    when 'course'  then array['4:3']
    when 'meeting' then array['3:2']
    when 'url'     then array['2:1']
    else array['1:1']
  end
$$;

-- Recomputes thumbnail_shape on every write, and rejects a thumbnail that is being set or changed (or whose project
-- type is changing) if its shape isn't allowed for the type. Older rows are left alone until their thumbnail
-- changes, so editing a title never fails on an old picture. Files carry no thumbnail rules.
create or replace function public.projects_set_thumbnail_shape()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.thumbnail_url is null then
    new.thumbnail_shape := null;
    return new;
  end if;

  new.thumbnail_shape := public.snap_thumbnail_shape(new.thumbnail_width, new.thumbnail_height);
  if new.project_type = 'file' then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.thumbnail_url is distinct from old.thumbnail_url
     or new.thumbnail_width is distinct from old.thumbnail_width
     or new.thumbnail_height is distinct from old.thumbnail_height
     or new.project_type is distinct from old.project_type then
    if new.thumbnail_shape is null
       or not (new.thumbnail_shape = any (public.thumbnail_allowed_shapes(new.project_type))) then
      raise exception 'thumbnail_shape: a % thumbnail must be % (got %x%)',
        new.project_type,
        array_to_string(public.thumbnail_allowed_shapes(new.project_type), ' or '),
        coalesce(new.thumbnail_width::text, '?'), coalesce(new.thumbnail_height::text, '?')
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_thumbnail_shape on public.projects;
create trigger trg_projects_thumbnail_shape
  before insert or update on public.projects
  for each row execute function public.projects_set_thumbnail_shape();

update public.projects
   set thumbnail_shape = public.snap_thumbnail_shape(thumbnail_width, thumbnail_height)
 where thumbnail_url is not null;
