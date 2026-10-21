-- supabase/ako_profile_website_urls.sql
--
-- Profiles can list up to 3 websites. Everyone keeps the single website they
-- already had; adding a 2nd or 3rd is for accounts that are admin-verified
-- (profiles.is_verified) AND unrestricted (not "pending" while the incubation
-- review gate is on — same rule as useIsRestricted on the client).
--
-- profiles.website_urls (text[]) is the source of truth. profiles.website_url
-- stays as a mirror of the FIRST entry so existing readers, and older app
-- builds that still write website_url alone, keep working.
--
-- Enforcement is server-side (this trigger); the client only hides the UI.
-- If an account stops being verified/unrestricted, extras beyond the first
-- are trimmed automatically instead of lingering.

alter table public.profiles
  add column if not exists website_urls text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_website_urls_max_3;
alter table public.profiles
  add constraint profiles_website_urls_max_3 check (cardinality(website_urls) <= 3);

-- Backfill from the legacy single column (before the trigger exists).
update public.profiles
   set website_urls = array[btrim(website_url)]
 where cardinality(website_urls) = 0
   and nullif(btrim(coalesce(website_url, '')), '') is not null;

create or replace function public.sync_profile_website_urls()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cleaned text[];
  urls_changed boolean;
  can_multi boolean;
  gate_on boolean;
begin
  -- 1. Work out the intended list. A writer that only touched website_url
  --    (older app builds) replaces the first entry and keeps the rest.
  if tg_op = 'INSERT' then
    if new.website_urls is null or cardinality(new.website_urls) = 0 then
      new.website_urls := case
        when nullif(btrim(coalesce(new.website_url, '')), '') is null then '{}'::text[]
        else array[btrim(new.website_url)]
      end;
    end if;
  elsif new.website_urls is not distinct from old.website_urls
        and new.website_url is distinct from old.website_url then
    new.website_urls := case
      when nullif(btrim(coalesce(new.website_url, '')), '') is null
        then old.website_urls[2:cardinality(old.website_urls)]
      else array[btrim(new.website_url)] || old.website_urls[2:cardinality(old.website_urls)]
    end;
  end if;

  -- 2. Normalise: trim, drop blanks, drop duplicates, keep order.
  select coalesce(array_agg(url order by first_pos), '{}'::text[])
    into cleaned
    from (
      select url, min(ord) as first_pos
        from (
          select nullif(btrim(x), '') as url, ord
            from unnest(coalesce(new.website_urls, '{}'::text[])) with ordinality as t(x, ord)
        ) s
       where url is not null
       group by url
    ) d;

  if exists (select 1 from unnest(cleaned) u where char_length(u) > 300) then
    raise exception 'Website addresses must be 300 characters or fewer.';
  end if;
  if cardinality(cleaned) > 3 then
    raise exception 'You can add up to 3 websites.';
  end if;

  -- 3. More than one website needs a verified, unrestricted account.
  if cardinality(cleaned) > 1 then
    select exists (
      select 1 from public.feature_flags
       where key = 'incubation_review_gate_enabled' and enabled
    ) into gate_on;
    can_multi := new.is_verified is true
                 and not (gate_on and new.account_status = 'pending');

    if not can_multi then
      urls_changed := tg_op = 'INSERT' or cleaned is distinct from old.website_urls;
      if urls_changed then
        raise exception 'Only verified accounts can add more than one website.';
      end if;
      -- Eligibility was lost (verification removed / account restricted):
      -- keep the first website, drop the extras.
      cleaned := cleaned[1:1];
    end if;
  end if;

  new.website_urls := cleaned;
  new.website_url := cleaned[1];
  return new;
end;
$$;

-- "zz" so it runs after trg_protect_admin_controlled_profile_fields has
-- reset any user-supplied is_verified / account_status.
drop trigger if exists trg_zz_sync_profile_website_urls on public.profiles;
create trigger trg_zz_sync_profile_website_urls
  before insert or update of website_url, website_urls, is_verified, account_status
  on public.profiles
  for each row execute function public.sync_profile_website_urls();

notify pgrst, 'reload schema';
