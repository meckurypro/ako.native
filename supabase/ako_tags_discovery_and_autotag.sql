-- ako_tags_discovery_and_autotag.sql
--
-- Unified tag system, part 2: the functions and triggers that make tags a connected layer.
-- Applied to the Ako project as migrations ako_tags_03_discovery_functions, ako_tags_04_connect_autotag_backfill
-- and ako_tags_05_autotag_precision (this file is the final state of all three).
-- Run AFTER ako_tags_schema_taxonomy.sql. The hand-curated tag_relations edges were applied as the data-only
-- migration ako_tags_02_relations (table + RLS + ~490 edges); `select * from tag_relations` is the source of truth.
--
--   discover_projects / discover_pages / discover_people   tag-filtered discovery, best match first
--   suggest_tags                                           the chips: yours -> connected to yours -> popular
--   tag_expand / related_tags                              a tag plus the tags strongly connected to it
--   tag_entity_ids                                         everything carrying given tags (scopes search)
--   auto_tag_text + triggers                               posts, projects and pages tag themselves from their text
--   hashtags.interest_id + triggers                        a #hashtag that is a tag files the post under that tag
--   rebuild_tag_affinity                                   nightly: tags that co-occur grow a soft link

-- 1. Expansion, resolution, auto-tagging ------------------------------------------------------------------
create or replace function public.tag_expand(p_ids uuid[], p_min real default 0.6)
returns table(interest_id uuid, direct boolean, weight real)
language sql stable set search_path = public as $$
  select i, true, 1.0::real from unnest(coalesce(p_ids, '{}'::uuid[])) i
  union all
  select r.related_id, false, max(r.weight)::real
  from public.tag_relations r
  where r.interest_id = any(coalesce(p_ids, '{}'::uuid[])) and r.weight >= p_min and not (r.related_id = any(coalesce(p_ids, '{}'::uuid[])))
  group by r.related_id
$$;

create or replace function public.resolve_interest(p_text text)
returns uuid language sql stable set search_path = public as $$
  select i.id from public.interests i
  where i.is_active and public.tag_key(p_text) <> ''
    and (public.tag_key(i.name) = public.tag_key(p_text) or exists (select 1 from unnest(i.aliases) a where public.tag_key(a) = public.tag_key(p_text)))
  order by (public.tag_key(i.name) = public.tag_key(p_text)) desc, i.sort_order
  limit 1
$$;

-- Which tags does a piece of text talk about? Whole-phrase match on tag names and aliases. A tag needs real
-- evidence (a name match, or two alias hits) and must score at least half of the best match.
create or replace function public.auto_tag_text(p_text text, p_limit integer default 3)
returns table(interest_id uuid, score real)
language sql stable set search_path = public as $$
  with keys as (
    select i.id, i.name as key, true as is_name from public.interests i where i.is_active
    union all
    select i.id, a, false from public.interests i, unnest(i.aliases) a where i.is_active and length(a) >= 3
  ), hits as (
    select k.id, (case when k.is_name then 3.0 else 2.0 end) * least(m.cnt, 3)::real as s
    from keys k
    cross join lateral (
      select count(*) cnt from regexp_matches(p_text, '\m' || regexp_replace(k.key, '([\\^$.|?*+()\[\]{}])', '\\\1', 'g') || '\M', 'gi')
    ) m
    where p_text is not null and m.cnt > 0
  ), scored as (
    select id, sum(s)::real sc from hits group by id having sum(s) >= 3.0
  )
  select id, sc from scored where sc >= 0.5 * (select max(sc) from scored) order by sc desc limit greatest(p_limit, 1)
$$;

create or replace function public.suggest_topics_for_text(p_text text, p_limit integer default 3)
returns table(id uuid, name text, slug text, score real)
language sql stable set search_path = public as $$
  select i.id, i.name, i.slug, t.score from public.auto_tag_text(p_text, p_limit) t join public.interests i on i.id = t.interest_id order by t.score desc
$$;

-- 2. Discovery ---------------------------------------------------------------------------------------------
-- discover_projects, tag-aware (p_interest_ids). Without tags it behaves exactly as before. NOTE: later migrations
-- (ako_discover_audio_video_split) redefine this function; the live definition keeps p_interest_ids.
-- See supabase/ako_discover_projects.sql for the current body.

create or replace function public.discover_pages(p_interest_ids uuid[] default null, p_offset integer default 0, p_limit integer default 12)
returns table(id uuid, name text, username text, tagline text, avatar_url text, page_type text, is_verified boolean, follower_count integer)
language sql stable set search_path to 'public' as $$
  with ex as (select * from public.tag_expand(p_interest_ids))
  select g.id, g.name, g.username, g.tagline, g.avatar_url, g.page_type, coalesce(g.is_verified, false), coalesce(g.follower_count, 0)
  from public.pages g
  where g.is_active = true
    and (coalesce(cardinality(p_interest_ids), 0) = 0
         or exists (select 1 from public.page_interests pi join ex on ex.interest_id = pi.interest_id where pi.page_id = g.id))
  order by
    (select coalesce(sum(case when ex.direct then 2.0 else ex.weight end), 0) from public.page_interests pi join ex on ex.interest_id = pi.interest_id where pi.page_id = g.id) desc,
    (select count(*) from public.page_interests pi join public.user_interests ui on ui.interest_id = pi.interest_id and ui.user_id = auth.uid() where pi.page_id = g.id) desc,
    coalesce(g.follower_count, 0) desc,
    g.created_at desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 50);
$$;

-- People who chose these tags (or strongly related ones). Interests stay private; only the profile is returned.
create or replace function public.discover_people(p_interest_ids uuid[], p_limit integer default 12)
returns table(id uuid, username text, display_name text, avatar_url text, tier text, follower_count integer)
language sql stable security definer set search_path = public as $$
  with ex as (select * from public.tag_expand(p_interest_ids)),
  m as (
    select ui.user_id, sum(case when ex.direct then 2.0 else ex.weight end) score
    from public.user_interests ui join ex on ex.interest_id = ui.interest_id group by ui.user_id
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.tier, coalesce(p.follower_count, 0)
  from public.profiles p join m on m.user_id = p.id
  where coalesce(p.is_deleted, false) = false and coalesce(p.is_private, false) = false
    and coalesce(p.account_status, 'approved') = 'approved'
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id)
  order by m.score desc, coalesce(p.follower_count, 0) desc
  limit least(greatest(p_limit, 1), 40)
$$;

-- Tag ids -> every thing carrying them (used to scope search to a tag).
create or replace function public.tag_entity_ids(p_interest_ids uuid[])
returns table(kind text, entity_id uuid)
language sql stable security definer set search_path = public as $$
  with ex as (select interest_id from public.tag_expand(p_interest_ids))
  select 'project'::text, pt.project_id from public.project_topics pt join ex using (interest_id)
  union
  select 'page'::text, pi.page_id from public.page_interests pi join ex using (interest_id)
  union
  select 'post'::text, x.post_id from (
    select pt.post_id from public.post_topics pt join ex using (interest_id) join public.posts po on po.id = pt.post_id
    where coalesce(po.is_deleted, false) = false order by po.created_at desc limit 500
  ) x
  union
  select 'person'::text, ui.user_id from public.user_interests ui join ex using (interest_id)
  join public.profiles pr on pr.id = ui.user_id where coalesce(pr.is_deleted, false) = false and coalesce(pr.is_private, false) = false
$$;

-- Chips for Discover: yours first, then tags connected to yours, then what is popular. Tags with nothing under
-- them are left out.
create or replace function public.suggest_tags(p_limit integer default 16)
returns table(id uuid, name text, slug text, category_id uuid, reason text, item_count integer)
language sql stable security definer set search_path = public as $$
  with uid as (select coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) u),
  me as (select ui.interest_id from public.user_interests ui, uid where ui.user_id = uid.u),
  stats as (
    select t.interest_id, count(*) n from (
      select pt.interest_id from public.project_topics pt join public.projects p on p.id = pt.project_id
        where p.status = 'active' and p.is_active = true and p.is_private = false
      union all
      select pi.interest_id from public.page_interests pi join public.pages g on g.id = pi.page_id where g.is_active = true
      union all
      select ui.interest_id from public.user_interests ui join public.profiles pr on pr.id = ui.user_id, uid
        where coalesce(pr.is_deleted, false) = false and coalesce(pr.is_private, false) = false and ui.user_id <> uid.u
    ) t group by t.interest_id
  ),
  rel as (select r.related_id id, sum(r.weight) s from public.tag_relations r join me on me.interest_id = r.interest_id group by r.related_id),
  sib as (
    select i2.id, 0.3::real s from public.interests i2
    join public.interests i1 on i1.category_id = i2.category_id join me on me.interest_id = i1.id
    where i2.is_active group by i2.id
  )
  select c.id, c.name, c.slug, c.category_id, c.reason, c.n::integer from (
    select i.id, i.name, i.slug, i.category_id, s.n,
      case when exists (select 1 from me where me.interest_id = i.id) then 'mine'
           when coalesce(r.s, 0) + coalesce(sb.s, 0) > 0 then 'related' else 'popular' end reason,
      case when exists (select 1 from me where me.interest_id = i.id) then 1
           when coalesce(r.s, 0) + coalesce(sb.s, 0) > 0 then 2 else 3 end rk,
      coalesce(r.s, 0) + coalesce(sb.s, 0) rs
    from public.interests i
    join stats s on s.interest_id = i.id
    left join rel r on r.id = i.id
    left join sib sb on sb.id = i.id
    where i.is_active
  ) c
  order by c.rk, c.rs desc, c.n desc, c.name
  limit least(greatest(p_limit, 1), 60)
$$;

create or replace function public.related_tags(p_interest_ids uuid[], p_limit integer default 8)
returns table(id uuid, name text, slug text, weight real)
language sql stable set search_path = public as $$
  select i.id, i.name, i.slug, sum(r.weight)::real w
  from public.tag_relations r join public.interests i on i.id = r.related_id
  where r.interest_id = any(coalesce(p_interest_ids, '{}'::uuid[])) and not (r.related_id = any(coalesce(p_interest_ids, '{}'::uuid[]))) and i.is_active
  group by i.id, i.name, i.slug order by w desc, i.name limit least(greatest(p_limit, 1), 30)
$$;

revoke all on function public.discover_people(uuid[], integer) from public, anon;
revoke all on function public.tag_entity_ids(uuid[]) from public, anon;
revoke all on function public.suggest_tags(integer) from public, anon;
grant execute on function public.discover_people(uuid[], integer) to authenticated;
grant execute on function public.tag_entity_ids(uuid[]) to authenticated;
grant execute on function public.suggest_tags(integer) to authenticated;

-- 3. Connecting content to tags -----------------------------------------------------------------------------
-- Where did a content<->tag link come from? manual = the author chose it; auto = matched from the text;
-- hashtag = a #hashtag that resolves to the tag.
alter table public.post_topics    add column if not exists source text not null default 'manual' check (source in ('manual','auto','hashtag'));
alter table public.project_topics add column if not exists source text not null default 'manual' check (source in ('manual','auto','hashtag'));
alter table public.page_interests add column if not exists source text not null default 'manual' check (source in ('manual','auto','hashtag'));

alter table public.hashtags add column if not exists interest_id uuid references public.interests(id) on delete set null;
create index if not exists idx_hashtags_interest on public.hashtags(interest_id) where interest_id is not null;

create or replace function public.trg_hashtags_link_interest() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.interest_id is null then new.interest_id := public.resolve_interest(new.tag); end if;
  return new;
end $$;
drop trigger if exists trg_hashtags_link_interest on public.hashtags;
create trigger trg_hashtags_link_interest before insert on public.hashtags for each row execute function public.trg_hashtags_link_interest();

update public.hashtags set interest_id = public.resolve_interest(tag) where interest_id is null;
insert into public.hashtags (tag, usage_count, interest_id)
select public.tag_key(i.name), 0, i.id from public.interests i
where i.is_active and public.tag_key(i.name) <> '' and not exists (select 1 from public.hashtags h where h.tag = public.tag_key(i.name));

-- A tag created later (admin screen) gets its hashtag too.
create or replace function public.trg_interests_hashtag() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.tag_key(new.name) <> '' and not exists (select 1 from public.hashtags h where h.tag = public.tag_key(new.name)) then
    insert into public.hashtags (tag, usage_count, interest_id) values (public.tag_key(new.name), 0, new.id);
  end if;
  return null;
end $$;
drop trigger if exists trg_interests_hashtag on public.interests;
create trigger trg_interests_hashtag after insert on public.interests for each row execute function public.trg_interests_hashtag();

-- Using a hashtag that is a tag also files the post under that tag.
create or replace function public.trg_post_hashtags_topic() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.post_topics (post_id, interest_id, source)
  select new.post_id, h.interest_id, 'hashtag' from public.hashtags h where h.id = new.hashtag_id and h.interest_id is not null
  on conflict do nothing;
  return null;
end $$;
drop trigger if exists trg_post_hashtags_topic on public.post_hashtags;
create trigger trg_post_hashtags_topic after insert on public.post_hashtags for each row execute function public.trg_post_hashtags_topic();

-- Auto-tagging: posts, projects and pages tag themselves from their text; the author's own picks always win.
create or replace function public.retag_post(p_post_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_text text; v_author uuid;
begin
  select coalesce(heading, '') || ' ' || coalesce(content, ''), author_id into v_text, v_author from public.posts where id = p_post_id;
  if not found then return; end if;
  delete from public.post_topics where post_id = p_post_id and source = 'auto';
  if exists (select 1 from public.post_topics where post_id = p_post_id and source = 'manual') then return; end if;
  insert into public.post_topics (post_id, interest_id, source) select p_post_id, t.interest_id, 'auto' from public.auto_tag_text(v_text, 3) t on conflict do nothing;
  -- an automated voice with nothing matched falls back to its own beat
  if not exists (select 1 from public.post_topics where post_id = p_post_id)
     and exists (select 1 from public.automated_accounts a where a.user_id = v_author) then
    insert into public.post_topics (post_id, interest_id, source)
    select p_post_id, ui.interest_id, 'auto' from public.user_interests ui where ui.user_id = v_author order by ui.created_at limit 2 on conflict do nothing;
  end if;
end $$;

create or replace function public.retag_project(p_project_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  select coalesce(title, '') || ' ' || coalesce(description, '') into v_text from public.projects where id = p_project_id;
  if not found then return; end if;
  delete from public.project_topics where project_id = p_project_id and source = 'auto';
  if exists (select 1 from public.project_topics where project_id = p_project_id and source = 'manual') then return; end if;
  insert into public.project_topics (project_id, interest_id, source) select p_project_id, t.interest_id, 'auto' from public.auto_tag_text(v_text, 3) t on conflict do nothing;
end $$;

create or replace function public.retag_page(p_page_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  select coalesce(g.name, '') || ' ' || coalesce(g.tagline, '') || ' ' || coalesce(to_jsonb(g) ->> 'bio', '') || ' ' || coalesce(to_jsonb(g) ->> 'description', '')
    into v_text from public.pages g where g.id = p_page_id;
  if not found then return; end if;
  delete from public.page_interests where page_id = p_page_id and source = 'auto';
  if exists (select 1 from public.page_interests where page_id = p_page_id and source = 'manual') then return; end if;
  insert into public.page_interests (page_id, interest_id, source) select p_page_id, t.interest_id, 'auto' from public.auto_tag_text(v_text, 3) t on conflict do nothing;
end $$;

create or replace function public.trg_retag_post() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.retag_post(new.id); return null; end $$;
create or replace function public.trg_retag_project() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.retag_project(new.id); return null; end $$;
create or replace function public.trg_retag_page() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.retag_page(new.id); return null; end $$;

drop trigger if exists trg_posts_retag on public.posts;
create trigger trg_posts_retag after insert or update of content, heading on public.posts for each row execute function public.trg_retag_post();
drop trigger if exists trg_projects_retag on public.projects;
create trigger trg_projects_retag after insert or update of title, description on public.projects for each row execute function public.trg_retag_project();
drop trigger if exists trg_pages_retag on public.pages;
create trigger trg_pages_retag after insert or update of name, tagline on public.pages for each row execute function public.trg_retag_page();

-- When the author picks tags by hand, those win over anything auto-matched.
create or replace function public.trg_topics_manual_wins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'post_topics' then delete from public.post_topics where post_id = new.post_id and source = 'auto';
  elsif tg_table_name = 'project_topics' then delete from public.project_topics where project_id = new.project_id and source = 'auto';
  else delete from public.page_interests where page_id = new.page_id and source = 'auto';
  end if;
  return null;
end $$;
drop trigger if exists trg_post_topics_manual_wins on public.post_topics;
create trigger trg_post_topics_manual_wins after insert on public.post_topics for each row when (new.source = 'manual') execute function public.trg_topics_manual_wins();
drop trigger if exists trg_project_topics_manual_wins on public.project_topics;
create trigger trg_project_topics_manual_wins after insert on public.project_topics for each row when (new.source = 'manual') execute function public.trg_topics_manual_wins();
drop trigger if exists trg_page_interests_manual_wins on public.page_interests;
create trigger trg_page_interests_manual_wins after insert on public.page_interests for each row when (new.source = 'manual') execute function public.trg_topics_manual_wins();

-- 4. Self-tuning ----------------------------------------------------------------------------------------------
-- Tags that keep showing up together grow a soft link (weight < 0.6, so they inform suggestions but never widen a
-- filter). Curated ('manual') edges are never touched.
create or replace function public.rebuild_tag_affinity() returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.tag_relations where kind = 'affinity';
  with co as (
    select a.interest_id a_id, b.interest_id b_id, count(*)::numeric c from public.user_interests a join public.user_interests b on a.user_id = b.user_id and a.interest_id < b.interest_id group by 1, 2
    union all select a.interest_id, b.interest_id, count(*) * 2 from public.post_topics a join public.post_topics b on a.post_id = b.post_id and a.interest_id < b.interest_id group by 1, 2
    union all select a.interest_id, b.interest_id, count(*) * 2 from public.project_topics a join public.project_topics b on a.project_id = b.project_id and a.interest_id < b.interest_id group by 1, 2
    union all select a.interest_id, b.interest_id, count(*) * 2 from public.page_interests a join public.page_interests b on a.page_id = b.page_id and a.interest_id < b.interest_id group by 1, 2
  ), agg as (select a_id, b_id, sum(c) c from co group by 1, 2 having sum(c) >= 2),
  edges as (
    select a_id x, b_id y, least(0.55, 0.1 + 0.1 * ln(1 + c))::real w from agg
    union all select b_id, a_id, least(0.55, 0.1 + 0.1 * ln(1 + c))::real from agg
  )
  insert into public.tag_relations (interest_id, related_id, weight, kind) select x, y, w, 'affinity' from edges on conflict (interest_id, related_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rebuild_tag_affinity() from public, anon, authenticated;

-- Nightly refresh (03:15 UTC) when pg_cron is available.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('ako-tag-affinity') where exists (select 1 from cron.job where jobname = 'ako-tag-affinity');
  perform cron.schedule('ako-tag-affinity', '15 3 * * *', 'select public.rebuild_tag_affinity()');
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
