-- AKỌ — Tiered post length: 450 standard / 1,200 verified
--
-- posts.content hard ceiling raised 1000 -> 1200 so verified users can write up to 1,200
-- characters. The tiered rule itself lives in the create-post and update-post edge functions
-- (the only write paths for posts): everyone gets 450, users with profiles.is_verified = true
-- get 1,200. The gate is is_verified (permanent, admin-assigned), NOT badge_visible, so a verified
-- user whose badge is hidden for missing the weekly posting streak keeps the longer limit.
-- This CHECK is the absolute backstop at the verified ceiling. Existing rows are all <= 1000, so
-- the new constraint validates cleanly.
--
-- Applied to the Ako Temp project as migration `posts_content_limit_1200`.

alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts
  add constraint posts_content_check check (char_length(content) <= 1200);
