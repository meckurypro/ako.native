-- ako_message_kinds.sql
-- Structured group chat: every message in a cohort has a kind, communities get announcements, answers can be private,
-- and a group message can be answered privately in the author's DM.
--
--   cohort     question | answer | lecture | announcement   (a kind is required)
--   community  plain messages, plus announcement (hosts only)
--   anything else (DMs, team chats): no kind
--
-- Who may post what:   question, answer → any participant
--                      lecture, announcement → the group's hosts (is_room_host)
-- An answer has to reply to a question. A PRIVATE answer is readable by the asker, its author and the group's hosts
-- only — enforced by a RESTRICTIVE row-level-security policy, so the API and realtime hide it too.
-- The asker can open a private answer to the group (share_private_answer). A "private reply" is a DM message that
-- quotes a group message; the quote is built here, from the real message, never from the client.
--
-- Applied to the Ako project in two steps: the structure was applied directly (as cohort_kind), then migration
-- "ako_message_kinds_announcements_hardening" renamed cohort_kind → message_kind, added announcements and hardened
-- write access. This file is the idempotent end state; safe to re-run.

-- ── columns ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'cohort_kind') THEN
    ALTER TABLE public.messages RENAME COLUMN cohort_kind TO message_kind;
  END IF;
END $$;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_kind text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS private_to uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS private_reply_to_message_id uuid REFERENCES public.messages (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS private_reply_context jsonb;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_cohort_kind_check;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_message_kind_check
  CHECK (message_kind IS NULL OR message_kind IN ('question', 'answer', 'lecture', 'announcement'));
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_visibility_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_visibility_check CHECK (visibility IN ('public', 'private'));
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_private_is_answer_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_private_is_answer_check CHECK (visibility = 'public' OR message_kind = 'answer');

CREATE INDEX IF NOT EXISTS messages_private_to_idx ON public.messages (private_to) WHERE visibility = 'private';
CREATE INDEX IF NOT EXISTS messages_private_reply_idx ON public.messages (private_reply_to_message_id) WHERE private_reply_to_message_id IS NOT NULL;

-- ── who can read a message ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.message_audience_ok(p_visibility text, p_private_to uuid, p_sender_id uuid, p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select p_visibility = 'public'
    or p_user_id = p_sender_id
    or p_user_id = p_private_to
    or exists (
      select 1 from public.project_room_details d
      where d.conversation_id = p_conversation_id and public.is_room_host(d.project_id, p_user_id)
    );
$$;

-- The people a message is for (push notifications use this to avoid leaking a private answer's text).
CREATE OR REPLACE FUNCTION public.message_audience_user_ids(p_message_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select cp.user_id
  from public.messages m
  join public.conversation_participants cp on cp.conversation_id = m.conversation_id
  where m.id = p_message_id
    and public.message_audience_ok(m.visibility, m.private_to, m.sender_id, m.conversation_id, cp.user_id);
$$;

DROP POLICY IF EXISTS "private answers audience" ON public.messages;
CREATE POLICY "private answers audience" ON public.messages
  AS RESTRICTIVE FOR SELECT
  USING (public.message_audience_ok(visibility, private_to, sender_id, conversation_id, (SELECT auth.uid())));

-- ── the rules ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Runs for signed-in callers only: service-role / internal writers (auth.uid() is null) keep full control.
CREATE OR REPLACE FUNCTION public.messages_kind_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_room_kind text;
  v_is_host boolean := false;
  v_q record;
  v_src record;
  v_name text;
  v_title text;
  v_src_project uuid;
  v_preview text;
begin
  if v_uid is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Defence in depth: column grants already limit which columns a client can write.
    if new.sender_id is distinct from old.sender_id
       or new.conversation_id is distinct from old.conversation_id
       or new.content is distinct from old.content
       or new.created_at is distinct from old.created_at
       or new.reply_to_message_id is distinct from old.reply_to_message_id then
      raise exception 'A sent message can''t be edited' using errcode = '42501';
    end if;
    if new.message_kind is distinct from old.message_kind
       or new.private_to is distinct from old.private_to
       or new.private_reply_to_message_id is distinct from old.private_reply_to_message_id
       or new.private_reply_context is distinct from old.private_reply_context then
      raise exception 'A message''s type can''t be changed' using errcode = '42501';
    end if;
    if new.visibility is distinct from old.visibility
       and not (old.visibility = 'private' and new.visibility = 'public'
                and coalesce(current_setting('ako.share_answer', true), '') = '1') then
      raise exception 'A message''s audience can''t be changed' using errcode = '42501';
    end if;
    return new;
  end if;

  -- A reply has to point at a message in the same chat.
  if new.reply_to_message_id is not null and not exists (
    select 1 from public.messages r where r.id = new.reply_to_message_id and r.conversation_id = new.conversation_id
  ) then
    raise exception 'That message isn''t in this chat' using errcode = '23514';
  end if;

  select d.project_id, d.kind into v_project, v_room_kind
  from public.project_room_details d where d.conversation_id = new.conversation_id;

  if v_project is null then
    -- Not a group room: nothing is typed or private.
    new.message_kind := null;
    new.visibility := 'public';
    new.private_to := null;
  else
    v_is_host := public.is_room_host(v_project, v_uid);

    if v_room_kind = 'cohort' then
      if new.message_kind is null then
        raise exception 'Choose a message type' using errcode = '23514';
      end if;
    elsif new.message_kind is not null and new.message_kind <> 'announcement' then
      raise exception 'Only announcements are typed in a community' using errcode = '23514';
    end if;

    if new.message_kind = 'lecture' and not v_is_host then
      raise exception 'Only instructors can post lectures' using errcode = '42501';
    end if;
    if new.message_kind = 'announcement' and not v_is_host then
      raise exception 'Only hosts can post announcements' using errcode = '42501';
    end if;

    if new.message_kind = 'answer' then
      select m.id, m.sender_id, m.message_kind, m.is_deleted into v_q
      from public.messages m
      where m.id = new.reply_to_message_id and m.conversation_id = new.conversation_id;
      if not found or v_q.message_kind is distinct from 'question' or v_q.is_deleted then
        raise exception 'An answer has to reply to a question' using errcode = '23514';
      end if;
      if new.visibility = 'private' then
        if v_q.sender_id = v_uid then
          raise exception 'You can''t answer your own question privately' using errcode = '23514';
        end if;
        new.private_to := v_q.sender_id;
      else
        new.visibility := 'public';
        new.private_to := null;
      end if;
    else
      new.visibility := 'public';
      new.private_to := null;
    end if;
  end if;

  -- Private reply: the quote shown in the author's DM is built here from the real message, never trusted from the client.
  new.private_reply_context := null;
  if new.private_reply_to_message_id is not null then
    select m.id, m.sender_id, m.conversation_id, m.content, m.visibility, m.private_to, m.message_kind, m.is_deleted into v_src
    from public.messages m where m.id = new.private_reply_to_message_id;
    if not found or v_src.is_deleted then
      raise exception 'That message is no longer available' using errcode = '23514';
    end if;
    if v_src.sender_id = v_uid then
      raise exception 'You can''t reply privately to yourself' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = v_src.conversation_id and cp.user_id = v_uid and cp.left_at is null
    ) or not public.message_audience_ok(v_src.visibility, v_src.private_to, v_src.sender_id, v_src.conversation_id, v_uid) then
      raise exception 'You can''t see that message' using errcode = '42501';
    end if;
    select p.title, d.project_id into v_title, v_src_project
    from public.project_room_details d join public.projects p on p.id = d.project_id
    where d.conversation_id = v_src.conversation_id;
    if v_title is null then
      raise exception 'Private replies are for group messages' using errcode = '23514';
    end if;
    if (select count(*) from public.conversation_participants cp where cp.conversation_id = new.conversation_id) <> 2
       or not exists (select 1 from public.conversation_participants cp where cp.conversation_id = new.conversation_id and cp.user_id = v_src.sender_id)
       or exists (select 1 from public.conversations c where c.id = new.conversation_id and (c.is_group or c.team_page_id is not null))
       or exists (select 1 from public.project_room_details d where d.conversation_id = new.conversation_id) then
      raise exception 'A private reply goes to the author''s DM' using errcode = '23514';
    end if;
    select coalesce(nullif(pr.display_name, ''), pr.username) into v_name from public.profiles pr where pr.id = v_src.sender_id;
    v_preview := case
      when v_src.content like 'ako-voice-note:v1:%' then 'Voice note'
      when v_src.content like 'ako-media:v1:%' then 'Photo or file'
      else left(regexp_replace(v_src.content, '\s+', ' ', 'g'), 140)
    end;
    new.private_reply_context := jsonb_build_object(
      'message_id', v_src.id,
      'conversation_id', v_src.conversation_id,
      'project_id', v_src_project,
      'group_title', v_title,
      'sender_id', v_src.sender_id,
      'sender_name', coalesce(v_name, 'Someone'),
      'message_kind', v_src.message_kind,
      'preview', v_preview
    );
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_messages_cohort_rules ON public.messages;
DROP TRIGGER IF EXISTS trg_messages_kind_rules ON public.messages;
CREATE TRIGGER trg_messages_kind_rules
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_kind_rules();
DROP FUNCTION IF EXISTS public.messages_cohort_rules();

-- The asker opens a private answer to the whole group. private_to stays set so the UI can say "Shared by the asker".
CREATE OR REPLACE FUNCTION public.share_private_answer(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform set_config('ako.share_answer', '1', true);
  update public.messages
     set visibility = 'public'
   where id = p_message_id and visibility = 'private' and private_to = auth.uid() and not is_deleted;
  if not found then
    raise exception 'Only the person who asked can share this answer' using errcode = '42501';
  end if;
end;
$function$;

-- In-app notifications respect the audience too.
CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select cp.user_id from conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id != new.sender_id
      and public.message_audience_ok(new.visibility, new.private_to, new.sender_id, new.conversation_id, cp.user_id)
  loop
    perform create_notification(v_recipient.user_id, 'message', new.sender_id, 'conversation', new.conversation_id, null);
  end loop;
  return new;
end;
$function$;

-- ── write access ────────────────────────────────────────────────────────────────────────────────────────────────
-- Clients may only stamp delivery/read state and delete-for-everyone on messages. Everything else (anchoring, sharing a
-- private answer) goes through SECURITY DEFINER functions. Row-level security still decides WHICH rows.
REVOKE ALL ON public.messages FROM anon;
REVOKE UPDATE, DELETE ON public.messages FROM authenticated;
GRANT UPDATE (delivered_at, read_at, is_deleted) ON public.messages TO authenticated;

REVOKE EXECUTE ON FUNCTION public.messages_kind_rules() FROM PUBLIC, anon, authenticated;
-- message_audience_ok is called by the row-level-security policy AS the querying user, so signed-in users keep EXECUTE.
REVOKE EXECUTE ON FUNCTION public.message_audience_ok(text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.message_audience_ok(text, uuid, uuid, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.message_audience_user_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.share_private_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_private_answer(uuid) TO authenticated;

-- ── anchoring ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Anchoring shows a message to people who join later, so a private answer is never anchored. set_messages_anchor (bulk)
-- carries this rule in ako_group_invites.sql; the single-message version is here. Applied as migration
-- ako_anchor_single_private_guard.
CREATE OR REPLACE FUNCTION public.set_message_anchor(p_message_id uuid, p_anchored boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conversation uuid;
  v_deleted boolean;
  v_visibility text;
  v_project uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT m.conversation_id, coalesce(m.is_deleted, false), m.visibility
    INTO v_conversation, v_deleted, v_visibility
  FROM public.messages m
  WHERE m.id = p_message_id;

  IF v_conversation IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  SELECT d.project_id INTO v_project
  FROM public.project_room_details d
  WHERE d.conversation_id = v_conversation;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'Only room messages can be anchored';
  END IF;

  IF NOT public.is_room_host(v_project, auth.uid()) THEN
    RAISE EXCEPTION 'Only room hosts can anchor messages' USING ERRCODE = '42501';
  END IF;

  IF p_anchored THEN
    IF v_deleted THEN
      RAISE EXCEPTION 'A deleted message can''t be anchored';
    END IF;
    IF v_visibility <> 'public' THEN
      RAISE EXCEPTION 'A private answer can''t be anchored';
    END IF;
    IF (SELECT count(*) FROM public.messages
         WHERE conversation_id = v_conversation AND anchored_at IS NOT NULL) >= 100 THEN
      RAISE EXCEPTION 'A room can have at most 100 anchored messages';
    END IF;
  END IF;

  UPDATE public.messages
  SET anchored_at = CASE WHEN p_anchored THEN now() ELSE NULL END,
      anchored_by = CASE WHEN p_anchored THEN auth.uid() ELSE NULL END
  WHERE id = p_message_id;
END;
$function$;
