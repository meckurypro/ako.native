-- ============================================================
-- Page templates: which layout a page uses (see src/lib/pageTemplates.ts).
-- null = "classic". Safe to run more than once.
-- Applied to the "Ako Temp" project as migration `page_template_column`.
-- ============================================================
alter table public.pages
  add column if not exists page_template text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pages_page_template_chk') then
    alter table public.pages
      add constraint pages_page_template_chk
      check (page_template is null or page_template in (
        'classic','spotlight','magazine','gallery','hub','storefront','studio','story','minimal','poster'
      ));
  end if;
end $$;

comment on column public.pages.page_template is 'Layout template chosen by the page editors; null = classic.';
