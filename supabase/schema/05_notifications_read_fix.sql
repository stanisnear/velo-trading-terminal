-- ════════════════════════════════════════════════════════════════════════
-- VELO · FIX — notifications exist in the table but the bell shows none.
-- Cause: the restrictive read policy (user_id = auth.uid()) filters them out.
-- The app already filters by user_id on the client, so the SELECT can be
-- public-read — exactly how trade_history already works. This unblocks the bell.
-- Run in: Supabase → SQL Editor → New query → Run.
-- ════════════════════════════════════════════════════════════════════════

drop policy if exists velo_notif_select on public.notifications;
create policy velo_notif_select on public.notifications
  for select using (true);

notify pgrst, 'reload schema';

-- ── Optional check: confirm your logged-in account actually owns rows ──────
-- Replace 'trading1' with the handle you're testing. If this returns rows,
-- the public-read fix above will make the bell populate. If it returns the
-- profile but zero notifications, that account simply has none yet.
--
--   select p.handle, p.id as profile_id, n.type, n.created_at
--   from profiles p
--   left join notifications n on n.user_id = p.id
--   where p.handle ilike 'trading1'
--   order by n.created_at desc nulls last
--   limit 20;
