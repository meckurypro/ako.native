-- ako_feed_invitations_flag_seed.sql
--
-- The "Soft Feed discovery" switch (feed_invitations_enabled) had no row,
-- so the admin toggle's UPDATE matched nothing and the flag stayed ON.
-- Seed it (default ON, same convention as every other feature flag).
insert into public.feature_flags (key, enabled, label, description)
values ('feed_invitations_enabled', true, 'Soft Feed discovery',
  'The quiet doorway to the Feed shown at natural stopping points. Turning this off removes the invitation only.')
on conflict (key) do nothing;
