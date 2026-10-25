-- ako_custom_pages_fk_indexes.sql
--
-- Applied to the Ako Supabase project as migration `custom_pages_fk_indexes`.
--
-- Two foreign keys on the Custom Pages tables had no covering index. Deleting a page (referred_by_page_id is
-- ON DELETE SET NULL) or a profile (inquiries.sender_id is ON DELETE SET NULL) has to find the referencing rows;
-- without an index that is a scan of the whole table. Partial indexes keep them tiny — most rows have NULL here.
CREATE INDEX IF NOT EXISTS custom_pages_referred_by_idx
  ON public.custom_pages (referred_by_page_id) WHERE referred_by_page_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS custom_page_inquiries_sender_idx
  ON public.custom_page_inquiries (sender_id) WHERE sender_id IS NOT NULL;
