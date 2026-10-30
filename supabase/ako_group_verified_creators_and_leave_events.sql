-- Groups: verified-only creation + a host-only trail of people leaving.
-- Applied to the Ako project as migration groups_verified_creators_and_silent_leave_events.
--
-- 1) trg_enforce_group_creator_verified (BEFORE INSERT on projects): a 'room' project (a community or a cohort) can
--    only be created by an account that is verified (or whose posting Page is verified), approved and not restricted.
--    Admins are exempt. The apps hide the entry points too (useCanCreateGroup); this is the real enforcement.
-- 2) room_member_events: written by leave_room / remove_room_member, readable by hosts only (RLS). Members are never
--    told that someone left; hosts see a small "<name> left" badge in the group chat.

CREATE OR REPLACE FUNCTION public.enforce_group_creator_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ok boolean;
BEGIN
  IF NEW.project_type IS DISTINCT FROM 'room' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = NEW.owner_id) THEN RETURN NEW; END IF;
  SELECT (
      coalesce(pr.is_verified, false)
      OR (NEW.posted_as_page_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.pages pg WHERE pg.id = NEW.posted_as_page_id AND coalesce(pg.is_verified, false)))
    )
    AND coalesce(pr.account_status, 'approved') = 'approved'
    AND public.fn_can_access_app(NEW.owner_id)
  INTO v_ok FROM public.profiles pr WHERE pr.id = NEW.owner_id;
  IF coalesce(v_ok, false) IS FALSE THEN
    RAISE EXCEPTION 'Only verified accounts can create groups.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_group_creator_verified ON public.projects;
CREATE TRIGGER trg_enforce_group_creator_verified BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_group_creator_verified();

CREATE TABLE IF NOT EXISTS public.room_member_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('left', 'removed')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_member_events_project_created_idx ON public.room_member_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_member_events_user_idx ON public.room_member_events (user_id);
CREATE INDEX IF NOT EXISTS room_member_events_actor_idx ON public.room_member_events (actor_id);
ALTER TABLE public.room_member_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hosts read member events" ON public.room_member_events;
CREATE POLICY "hosts read member events" ON public.room_member_events
  FOR SELECT USING (public.is_room_host(project_id, (SELECT auth.uid())));

-- leave_room and remove_room_member additionally insert a room_member_events row ('left' / 'removed'); see the live
-- function definitions (leave_room is still silent for members: no chat message, no notification).
