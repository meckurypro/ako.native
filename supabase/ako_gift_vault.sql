-- supabase/ako_gift_vault.sql
--
-- Gift Vault: every gift the signed-in user has RECEIVED, with the gift's artwork,
-- the sender and the price — one row per gift, newest first. The client groups
-- them into the artifact grid (count per gift) and per-artifact history.
--
-- SECURITY DEFINER on purpose: gift_types is only publicly readable while
-- is_active = true, so a gift retired by an admin would otherwise vanish from a
-- user's vault. The function only ever returns rows where recipient_id = auth.uid().
create or replace function public.get_gift_vault(p_limit int default 1000)
returns table (
  id uuid,
  created_at timestamptz,
  amount numeric,
  gift_type_id uuid,
  gift_name text,
  gift_icon_url text,
  sender_id uuid,
  sender_username text,
  sender_display_name text,
  sender_avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.created_at,
    g.amount,
    g.gift_type_id,
    gt.name,
    gt.icon_url,
    case when p.is_deleted then null else g.sender_id end,
    case when p.is_deleted then null else p.username end,
    case when p.is_deleted then null else p.display_name end,
    case when p.is_deleted then null else p.avatar_url end
  from gifts g
  left join gift_types gt on gt.id = g.gift_type_id
  left join profiles p on p.id = g.sender_id
  where g.recipient_id = auth.uid()
  order by g.created_at desc
  limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;

revoke all on function public.get_gift_vault(int) from public, anon;
grant execute on function public.get_gift_vault(int) to authenticated;
