-- "Gig" is now "Talent" in the product. Wire names (tables, columns, RPCs, project_type = 'gig') are unchanged so
-- shipped native builds keep working; only user-facing copy and the new route slug change here.
-- Applied to the Ako project as migration `ako_talent_rename_copy`.

-- 1) /talents is the new route; keep /gigs reserved too (it redirects).
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.is_reserved_project_slug'::regproc);
  n := replace(d, '''gigs'',', '''gigs'',''talents'',');
  if n = d then raise exception 'is_reserved_project_slug: pattern not found'; end if;
  execute n;
end $$;

-- 2) Error text raised when a song has no valid parent.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.projects_validate_parent_gig'::regproc);
  n := replace(d, 'one of your artist gigs.', 'one of your artist talents.');
  if n = d then raise exception 'projects_validate_parent_gig: pattern not found'; end if;
  execute n;
end $$;

-- 3) Copy stored as data.
update public.project_faq_templates
   set answer = replace(answer, 'for this gig.', 'for this talent.')
 where project_type = 'gig' and answer like '%for this gig.%';

update public.feature_flags
   set description = replace(replace(description, 'courses, gigs,', 'courses, talents,'), 'paid projects and gigs.', 'paid projects and talents.')
 where key in ('projects_enabled', 'purchases_enabled');
