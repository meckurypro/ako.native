-- supabase/ako_page_team_visible_by_default.sql
--
-- Team members appear in the page's "Meet the team" section by default; a page admin can still hide
-- anyone from Manage team (set_page_member_featured). The column used to default to hidden, which meant a
-- page with a full team showed nobody until an admin opted each person in.
alter table public.page_members alter column show_on_page set default true;

-- Existing active members: show them (nobody had made a deliberate choice yet).
with ordered as (
  select id, row_number() over (partition by page_id order by created_at, id) - 1 as ord
  from public.page_members
  where status = 'active' and show_on_page = false
)
update public.page_members m
   set show_on_page = true,
       display_order = least(o.ord, 32767)::smallint
  from ordered o
 where m.id = o.id;
