-- ako_notification_fixes_forks.sql
--
-- 1. Double notifications on team-invite replies.
--    notify_page_invite() (trigger on page_members) already notifies the inviter on accept/decline, WITH the page
--    name as preview_text. respond_to_page_invite() inserted a second row (no preview). Drop the RPC's insert and
--    let the trigger be the single source. Existing duplicate rows are collapsed (the one with preview_text wins).
-- 2. New notification type project_forked -> project owner, when someone forks (or re-forks) their project.
-- 3. New notification type forked_project_tagged -> project owner, when a forker tags the project they forked in a
--    published post (posts.tagged_project_ref is set server-side by create-post only for forkers).

-- ---------- types ----------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'support','pushback','question','disagree','comment','comment_reply','comment_like','comment_dislike','like','dislike',
  'share','reshare','quote','follow','follow_request','follow_request_accepted','mention','post_tagged','post_published',
  'post_comment_activity','message','system','gift_received','project_tagged','project_purchased','project_access_granted',
  'file_downloaded','give_back_received','affiliate_commission_earned','withdrawal_status','promotion_approved',
  'promotion_declined','room_meeting_scheduled','moderation_notice','admin_message','collaboration_invite',
  'collaboration_accepted','collaboration_declined','gig_created_from_collaboration','music_credit_request',
  'foreword_invite','foreword_submitted','foreword_approved','foreword_declined','page_role_invite','page_role_accepted',
  'page_role_declined','page_role_rejected','page_role_requested','page_role_approved',
  'project_forked','forked_project_tagged'
]::text[]));

-- ---------- 1. de-duplicate team-invite replies ----------
CREATE OR REPLACE FUNCTION public.respond_to_page_invite(p_page_id uuid, p_accept boolean)
RETURNS public.page_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member public.page_members;
  v_active_count integer;
  v_conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- The inviter is notified by the notify_page_invite trigger on this UPDATE (accepted / declined, with the page
  -- name). Do NOT insert a notification here as well — that produced two rows per reply.
  UPDATE public.page_members
  SET status = CASE WHEN p_accept THEN 'active' ELSE 'declined' END,
      responded_at = now()
  WHERE page_id = p_page_id AND user_id = auth.uid() AND status = 'invited'
  RETURNING * INTO v_member;

  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'No pending invite found';
  END IF;

  IF p_accept THEN
    SELECT count(*) INTO v_active_count
    FROM public.page_members
    WHERE page_id = p_page_id AND status = 'active';

    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE team_page_id = p_page_id;

    IF v_conversation_id IS NULL AND v_active_count >= 3 THEN
      INSERT INTO public.conversations (is_group, team_page_id)
      VALUES (true, p_page_id)
      RETURNING id INTO v_conversation_id;

      INSERT INTO public.conversation_participants (conversation_id, user_id)
      SELECT v_conversation_id, user_id
      FROM public.page_members
      WHERE page_id = p_page_id AND status = 'active';

    ELSIF v_conversation_id IS NOT NULL THEN
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (v_conversation_id, auth.uid())
      ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL;
    END IF;
  END IF;

  RETURN v_member;
END;
$$;

-- Collapse existing duplicates (same recipient/actor/type/page within 10 seconds); keep the row that has preview_text.
DELETE FROM public.notifications n
USING public.notifications k
WHERE n.type IN ('page_role_accepted','page_role_declined')
  AND k.type = n.type AND k.user_id = n.user_id AND k.actor_id IS NOT DISTINCT FROM n.actor_id
  AND k.target_id IS NOT DISTINCT FROM n.target_id
  AND abs(extract(epoch FROM (k.created_at - n.created_at))) < 10
  AND n.id <> k.id
  AND (
    (k.preview_text IS NOT NULL AND n.preview_text IS NULL)
    OR ((k.preview_text IS NOT NULL) = (n.preview_text IS NOT NULL) AND k.id < n.id)
  );

-- ---------- 2. someone forked your project ----------
CREATE OR REPLACE FUNCTION public.notify_on_project_fork()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_title text;
BEGIN
  -- INSERT = first fork; UPDATE unforked -> active = the same person forking again.
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  SELECT ap.creator_id, p.title INTO v_creator, v_title
  FROM public.affiliate_programs ap
  JOIN public.projects p ON p.id = ap.project_id
  WHERE ap.id = NEW.affiliate_program_id;

  IF v_creator IS NOT NULL AND v_creator <> NEW.affiliate_user_id THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
    VALUES (v_creator, 'project_forked', NEW.affiliate_user_id, 'project', NEW.project_id, v_title);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_project_fork_insert ON public.affiliate_relationships;
CREATE TRIGGER trg_notify_on_project_fork_insert
  AFTER INSERT ON public.affiliate_relationships
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_project_fork();

DROP TRIGGER IF EXISTS trg_notify_on_project_fork_update ON public.affiliate_relationships;
CREATE TRIGGER trg_notify_on_project_fork_update
  AFTER UPDATE OF status ON public.affiliate_relationships
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_project_fork();

-- ---------- 3. a forker tagged the project they forked in a post ----------
CREATE OR REPLACE FUNCTION public.notify_on_forked_project_tag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_title text;
BEGIN
  IF NEW.tagged_project_id IS NULL OR NEW.tagged_project_ref IS NULL OR NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  -- On UPDATE only fire when the post has just become published (scheduled/draft -> published) or just gained the tag.
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' AND OLD.tagged_project_id IS NOT DISTINCT FROM NEW.tagged_project_id THEN
    RETURN NEW;
  END IF;

  SELECT owner_id, title INTO v_owner, v_title FROM public.projects WHERE id = NEW.tagged_project_id;
  IF v_owner IS NULL OR v_owner = NEW.author_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.blocked_users b WHERE b.blocker_id = v_owner AND b.blocked_id = NEW.author_id) THEN
    RETURN NEW;
  END IF;

  -- One notice per post.
  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = v_owner AND type = 'forked_project_tagged' AND target_type = 'post' AND target_id = NEW.id
  ) THEN
    INSERT INTO public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
    VALUES (v_owner, 'forked_project_tagged', NEW.author_id, 'post', NEW.id, v_title);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_forked_project_tag_insert ON public.posts;
CREATE TRIGGER trg_notify_forked_project_tag_insert
  AFTER INSERT ON public.posts
  FOR EACH ROW WHEN (NEW.tagged_project_ref IS NOT NULL AND NEW.status = 'published')
  EXECUTE FUNCTION public.notify_on_forked_project_tag();

DROP TRIGGER IF EXISTS trg_notify_forked_project_tag_publish ON public.posts;
CREATE TRIGGER trg_notify_forked_project_tag_publish
  AFTER UPDATE ON public.posts
  FOR EACH ROW WHEN (NEW.tagged_project_ref IS NOT NULL AND NEW.status = 'published')
  EXECUTE FUNCTION public.notify_on_forked_project_tag();
