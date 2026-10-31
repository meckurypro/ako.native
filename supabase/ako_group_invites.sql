-- ako_group_invites.sql
-- Group / cohort membership, take two:
--   1. People choose whether anyone can ADD them to a group (profiles.group_add_policy).
--   2. If they said "invite only", hosts can only INVITE them; they accept or decline.
--   3. Pending invites are logged (room_invites) so hosts can review and cancel them.
--   4. search_room_candidates(): type-ahead people search for the "add members" screen.
--   5. set_messages_anchor(): anchor / unanchor many messages at once (bulk select).
--   6. Only the sender or a room host can delete a message for everyone.
-- Applied to the Ako project as migration ako_group_invites.

-- ---------------------------------------------------------------
-- 1. Privacy setting
-- ---------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS group_add_policy text NOT NULL DEFAULT 'anyone';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_group_add_policy_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_group_add_policy_check CHECK (group_add_policy IN ('anyone', 'invite_only'));

-- ---------------------------------------------------------------
-- 2. Invites
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_invites (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_invites_pending_idx
  ON public.room_invites (project_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS room_invites_user_idx ON public.room_invites (user_id);
CREATE INDEX IF NOT EXISTS room_invites_invited_by_idx ON public.room_invites (invited_by);

ALTER TABLE public.room_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitee or host reads invites" ON public.room_invites;
CREATE POLICY "invitee or host reads invites" ON public.room_invites
  FOR SELECT
  USING (user_id = (SELECT auth.uid()) OR public.is_room_host(project_id, (SELECT auth.uid())));

-- Writes happen only through the RPCs below.
REVOKE ALL ON public.room_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_invites TO authenticated;

-- ---------------------------------------------------------------
-- Notification types (the existing list, plus the three invite ones)
-- ---------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'support','pushback','question','disagree','comment','comment_reply','comment_like','comment_dislike',
    'like','dislike','share','reshare','quote','follow','follow_request','follow_request_accepted','mention',
    'post_tagged','post_published','post_comment_activity','message','system','gift_received','project_tagged',
    'project_purchased','project_access_granted','file_downloaded','give_back_received',
    'affiliate_commission_earned','withdrawal_status','promotion_approved','promotion_declined',
    'room_meeting_scheduled','moderation_notice','admin_message','collaboration_invite','collaboration_accepted',
    'collaboration_declined','gig_created_from_collaboration','music_credit_request','foreword_invite',
    'foreword_submitted','foreword_approved','foreword_declined','page_role_invite','page_role_accepted',
    'page_role_declined','page_role_rejected','page_role_requested','page_role_approved','project_forked',
    'forked_project_tagged','custom_page_inquiry',
    'room_meeting_reminder','room_meeting_soon','room_meeting_starting','room_meeting_rescheduled',
    'room_meeting_cancelled',
    'room_join_request','room_join_approved','room_join_declined','room_member_added','room_member_removed',
    'room_invite','room_invite_accepted','room_invite_declined'
  ]::text[]));

-- ---------------------------------------------------------------
-- add_room_member: unchanged except it now refuses people who only accept invitations
-- (and settles any invite that was still pending for them).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_room_member(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_room_host(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'Only room hosts can add members' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND project_type = 'room') THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  IF public.room_is_closed(p_project_id) THEN RAISE EXCEPTION 'This room has ended'; END IF;
  IF EXISTS (SELECT 1 FROM public.room_blocklist WHERE project_id = p_project_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'This person is blacklisted. Remove them from the blacklist first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users
              WHERE (blocker_id = p_user_id AND blocked_id = v_uid)
                 OR (blocker_id = v_uid AND blocked_id = p_user_id)) THEN
    RAISE EXCEPTION 'You can''t add this person';
  END IF;
  IF public.is_room_member(p_project_id, p_user_id) THEN RETURN; END IF;

  IF coalesce((SELECT pr.group_add_policy FROM public.profiles pr WHERE pr.id = p_user_id), 'anyone') = 'invite_only' THEN
    RAISE EXCEPTION 'This person only joins groups by invitation. Invite them instead.' USING ERRCODE = '42501';
  END IF;

  SELECT p.title INTO v_title FROM public.projects p WHERE p.id = p_project_id;

  PERFORM set_config('ako.room_join_ok', p_project_id::text || ':' || p_user_id::text, true);
  INSERT INTO public.room_members (project_id, user_id, purchase_id)
  VALUES (p_project_id, p_user_id, NULL)
  ON CONFLICT (project_id, user_id) DO NOTHING;
  PERFORM set_config('ako.room_join_ok', '', true);

  UPDATE public.room_join_requests
     SET status = 'approved', decided_by = v_uid, decided_at = now()
   WHERE project_id = p_project_id AND user_id = p_user_id AND status = 'pending';

  UPDATE public.room_invites
     SET status = 'accepted', decided_at = now()
   WHERE project_id = p_project_id AND user_id = p_user_id AND status = 'pending';
  DELETE FROM public.notifications
   WHERE user_id = p_user_id AND type = 'room_invite' AND target_id = p_project_id;

  INSERT INTO public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
  VALUES (p_user_id, 'room_member_added', v_uid, 'project', p_project_id, v_title);
END;
$$;

-- ---------------------------------------------------------------
-- Invite / cancel / respond
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_room_member(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_room_host(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'Only room hosts can invite people' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND project_type = 'room') THEN
    RAISE EXCEPTION 'Room not found';
  END IF;
  IF public.room_is_closed(p_project_id) THEN RAISE EXCEPTION 'This room has ended'; END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'You can''t invite yourself'; END IF;
  IF EXISTS (SELECT 1 FROM public.room_blocklist WHERE project_id = p_project_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'This person is blacklisted. Remove them from the blacklist first.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users
              WHERE (blocker_id = p_user_id AND blocked_id = v_uid)
                 OR (blocker_id = v_uid AND blocked_id = p_user_id)) THEN
    RAISE EXCEPTION 'You can''t invite this person';
  END IF;
  IF public.is_room_member(p_project_id, p_user_id) OR public.is_room_host(p_project_id, p_user_id) THEN
    RAISE EXCEPTION 'This person is already in the group';
  END IF;
  IF EXISTS (SELECT 1 FROM public.room_invites
              WHERE project_id = p_project_id AND user_id = p_user_id AND status = 'pending') THEN
    RETURN; -- already invited; nothing to do
  END IF;

  SELECT p.title INTO v_title FROM public.projects p WHERE p.id = p_project_id;

  INSERT INTO public.room_invites (project_id, user_id, invited_by, status, created_at, decided_at)
  VALUES (p_project_id, p_user_id, v_uid, 'pending', now(), NULL)
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET invited_by = EXCLUDED.invited_by, status = 'pending', created_at = now(), decided_at = NULL;

  DELETE FROM public.notifications
   WHERE user_id = p_user_id AND type = 'room_invite' AND target_id = p_project_id;
  INSERT INTO public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
  VALUES (p_user_id, 'room_invite', v_uid, 'project', p_project_id, v_title);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_room_invite(p_project_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_room_host(p_project_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only room hosts can cancel invites' USING ERRCODE = '42501';
  END IF;

  UPDATE public.room_invites
     SET status = 'cancelled', decided_at = now()
   WHERE project_id = p_project_id AND user_id = p_user_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'That invite is no longer pending'; END IF;

  -- The invitee's notification would only lead to a dead end now.
  DELETE FROM public.notifications
   WHERE user_id = p_user_id AND type = 'room_invite' AND target_id = p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_room_invite(p_project_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text;
  v_inviter uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;

  SELECT i.invited_by INTO v_inviter
    FROM public.room_invites i
   WHERE i.project_id = p_project_id AND i.user_id = v_uid AND i.status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invite is no longer available'; END IF;

  SELECT p.title INTO v_title FROM public.projects p WHERE p.id = p_project_id;

  IF p_accept THEN
    IF EXISTS (SELECT 1 FROM public.room_blocklist WHERE project_id = p_project_id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'You can''t join this room' USING ERRCODE = '42501';
    END IF;
    IF public.room_is_closed(p_project_id) THEN RAISE EXCEPTION 'This room has ended'; END IF;

    PERFORM set_config('ako.room_join_ok', p_project_id::text || ':' || v_uid::text, true);
    INSERT INTO public.room_members (project_id, user_id, purchase_id)
    VALUES (p_project_id, v_uid, NULL)
    ON CONFLICT (project_id, user_id) DO NOTHING;
    PERFORM set_config('ako.room_join_ok', '', true);

    UPDATE public.room_join_requests
       SET status = 'approved', decided_at = now()
     WHERE project_id = p_project_id AND user_id = v_uid AND status = 'pending';
  END IF;

  UPDATE public.room_invites
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END, decided_at = now()
   WHERE project_id = p_project_id AND user_id = v_uid;

  IF v_inviter IS NOT NULL AND v_inviter <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
    VALUES (v_inviter, CASE WHEN p_accept THEN 'room_invite_accepted' ELSE 'room_invite_declined' END,
            v_uid, 'project', p_project_id, v_title);
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Type-ahead people search for the "add members" screen.
--    Ranks exact username > username prefix > name prefix > a word of the name > anywhere,
--    people you follow first within a rank. An empty query returns the people you follow.
--    add_mode says what the host can do: 'add' straight away, or only 'invite'.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_room_candidates(p_project_id uuid, p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  is_following boolean,
  state text,
  add_mode text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 40);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_room_host(p_project_id, v_uid) THEN
    RAISE EXCEPTION 'Only room hosts can search for people to add' USING ERRCODE = '42501';
  END IF;

  v_q := regexp_replace(v_q, '^@+', '');
  -- escape LIKE wildcards in what was typed
  v_like := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT pr.id,
         pr.username,
         pr.display_name,
         pr.avatar_url,
         coalesce(pr.is_verified, false),
         (f.follower_id IS NOT NULL),
         CASE
           WHEN public.is_room_member(p_project_id, pr.id) OR public.is_room_host(p_project_id, pr.id) THEN 'member'
           WHEN EXISTS (SELECT 1 FROM public.room_invites i
                         WHERE i.project_id = p_project_id AND i.user_id = pr.id AND i.status = 'pending') THEN 'invited'
           ELSE 'available'
         END,
         CASE WHEN coalesce(pr.group_add_policy, 'anyone') = 'invite_only' THEN 'invite' ELSE 'add' END
    FROM public.profiles pr
    LEFT JOIN public.follows f ON f.follower_id = v_uid AND f.following_id = pr.id
   WHERE coalesce(pr.is_deleted, false) = false
     AND pr.id <> v_uid
     AND NOT EXISTS (SELECT 1 FROM public.room_blocklist b WHERE b.project_id = p_project_id AND b.user_id = pr.id)
     AND NOT EXISTS (SELECT 1 FROM public.blocked_users bu
                      WHERE (bu.blocker_id = pr.id AND bu.blocked_id = v_uid)
                         OR (bu.blocker_id = v_uid AND bu.blocked_id = pr.id))
     AND (
       (v_q = '' AND f.follower_id IS NOT NULL)
       OR (v_q <> '' AND (
            lower(pr.username) LIKE '%' || v_like || '%' ESCAPE '\'
            OR lower(coalesce(pr.display_name, '')) LIKE '%' || v_like || '%' ESCAPE '\'
          ))
     )
   ORDER BY
     CASE
       WHEN v_q = '' THEN 5
       WHEN lower(pr.username) = v_q THEN 0
       WHEN lower(pr.username) LIKE v_like || '%' ESCAPE '\' THEN 1
       WHEN lower(coalesce(pr.display_name, '')) LIKE v_like || '%' ESCAPE '\' THEN 2
       WHEN lower(coalesce(pr.display_name, '')) LIKE '% ' || v_like || '%' ESCAPE '\' THEN 3
       ELSE 4
     END,
     (f.follower_id IS NULL),
     pr.follower_count DESC NULLS LAST,
     pr.username
   LIMIT v_limit;
END;
$$;

-- ---------------------------------------------------------------
-- 5. Bulk anchor — same rules as set_message_anchor, for a whole selection.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_messages_anchor(p_message_ids uuid[], p_anchored boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_convs uuid[];
  v_conversation uuid;
  v_project uuid;
  v_new integer;
  v_changed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_message_ids IS NULL OR cardinality(p_message_ids) = 0 THEN RETURN 0; END IF;

  SELECT array_agg(DISTINCT m.conversation_id) INTO v_convs FROM public.messages m WHERE m.id = ANY (p_message_ids);
  IF v_convs IS NULL THEN RAISE EXCEPTION 'Message not found'; END IF;
  IF cardinality(v_convs) <> 1 THEN RAISE EXCEPTION 'Select messages from one chat'; END IF;
  v_conversation := v_convs[1];

  SELECT d.project_id INTO v_project FROM public.project_room_details d WHERE d.conversation_id = v_conversation;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Only room messages can be anchored'; END IF;
  IF NOT public.is_room_host(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'Only room hosts can anchor messages' USING ERRCODE = '42501';
  END IF;

  IF p_anchored THEN
    SELECT count(*) INTO v_new FROM public.messages m
     WHERE m.id = ANY (p_message_ids) AND coalesce(m.is_deleted, false) = false AND m.visibility = 'public' AND m.anchored_at IS NULL;
    IF (SELECT count(*) FROM public.messages WHERE conversation_id = v_conversation AND anchored_at IS NOT NULL) + v_new > 100 THEN
      RAISE EXCEPTION 'A room can have at most 100 anchored messages';
    END IF;
  END IF;

  UPDATE public.messages m
     SET anchored_at = CASE WHEN p_anchored THEN now() ELSE NULL END,
         anchored_by = CASE WHEN p_anchored THEN auth.uid() ELSE NULL END
   WHERE m.id = ANY (p_message_ids)
     AND m.conversation_id = v_conversation
     -- Anchoring shows a message to people who join later, so a private answer is never anchored.
     AND (NOT p_anchored OR (coalesce(m.is_deleted, false) = false AND m.visibility = 'public'))
     AND (m.anchored_at IS NOT NULL) IS DISTINCT FROM p_anchored;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

-- ---------------------------------------------------------------
-- 6. Delete-for-everyone: the sender, or a host of the group the message is in.
--    (The messages UPDATE policy lets any participant update any message, which is what
--    "Delete for everyone" relies on — this closes the gap without changing the client call.)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.messages_delete_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_project uuid;
BEGIN
  IF coalesce(NEW.is_deleted, false) AND NOT coalesce(OLD.is_deleted, false) THEN
    IF auth.uid() IS NULL OR auth.uid() = OLD.sender_id THEN
      RETURN NEW;
    END IF;
    SELECT d.project_id INTO v_project FROM public.project_room_details d WHERE d.conversation_id = OLD.conversation_id;
    IF v_project IS NULL OR NOT public.is_room_host(v_project, auth.uid()) THEN
      RAISE EXCEPTION 'You can only delete your own messages' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_delete_rules ON public.messages;
CREATE TRIGGER trg_messages_delete_rules
  BEFORE UPDATE OF is_deleted ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_delete_rules();

-- ---------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------
REVOKE ALL ON FUNCTION public.messages_delete_rules() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'add_room_member(uuid, uuid)', 'invite_room_member(uuid, uuid)', 'cancel_room_invite(uuid, uuid)',
    'respond_room_invite(uuid, boolean)', 'search_room_candidates(uuid, text, integer)',
    'set_messages_anchor(uuid[], boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
