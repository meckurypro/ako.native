-- ako_file_projects_downloads.sql
-- Applied to the "Ako Temp" Supabase project.
--   * private-content bucket raised to 1GB (File projects accept up to 1GB)
--   * projects.download_count: completed downloads by people other than the creator
--   * project_file_downloads: one row per download attempt (opened by get-project-file, completed by the client
--     only after the whole file arrived)
--   * complete_file_download(): idempotent; bumps the count and notifies the creator ('file_downloaded')
--   * send-activity-push has a matching file_downloaded entry; get-project-file returns download_id
update storage.buckets set file_size_limit = 1073741824 where id = 'private-content';

alter table public.projects add column if not exists download_count integer not null default 0;

create table if not exists public.project_file_downloads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  bytes bigint
);
create index if not exists project_file_downloads_project_idx on public.project_file_downloads (project_id, completed_at);
alter table public.project_file_downloads enable row level security;
-- No client policies: written only by the edge function (service role) and the SECURITY DEFINER RPC below.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
'like','dislike','support','disagree','pushback','reshare','quote','comment_reply','follow','mention','gift_received','moderation_notice','system','message','follow_request','follow_request_accepted','page_role_invite','page_role_accepted','page_role_declined','comment_like','comment_dislike','post_comment_activity','admin_message','post_tagged','project_tagged','collaboration_invite','collaboration_accepted','collaboration_declined','promotion_approved','promotion_declined','post_published','room_meeting_scheduled','comment','share','give_back_received','gig_created_from_collaboration','music_credit_request','project_purchased','affiliate_commission_earned','withdrawal_status','foreword_invite','foreword_submitted','foreword_approved','foreword_declined','project_access_granted','file_downloaded']::text[]));

create or replace function public.complete_file_download(p_download_id uuid, p_bytes bigint default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.project_file_downloads%rowtype;
  v_owner uuid;
  v_title text;
  v_count integer;
begin
  select * into v_row from public.project_file_downloads where id = p_download_id for update;
  if not found or v_row.user_id is distinct from auth.uid() then
    raise exception 'Download not found';
  end if;

  select owner_id, title, download_count into v_owner, v_title, v_count
  from public.projects where id = v_row.project_id and project_type = 'file';
  if not found then raise exception 'Not a file project'; end if;

  if v_row.completed_at is not null then return v_count; end if;

  update public.project_file_downloads set completed_at = now(), bytes = p_bytes where id = p_download_id;

  if v_row.user_id = v_owner then return v_count; end if;

  update public.projects set download_count = download_count + 1
  where id = v_row.project_id returning download_count into v_count;

  insert into public.notifications (user_id, type, actor_id, target_type, target_id, preview_text)
  values (v_owner, 'file_downloaded', v_row.user_id, 'project', v_row.project_id, v_title);

  return v_count;
end $$;
revoke all on function public.complete_file_download(uuid, bigint) from public, anon;
grant execute on function public.complete_file_download(uuid, bigint) to authenticated;
