-- ════════════════════════════════════════════════════════════════════════
-- VELO · CONSOLIDATED Supabase migration  (single source of truth)
-- ────────────────────────────────────────────────────────────────────────
-- Run once:  Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Fully idempotent — safe to run repeatedly and safe on a fresh project.
--
-- This file supersedes the four older partial migrations
-- (notifications_activity, realtime_fix, notifications_read, comments_v2).
-- Running it brings any Velo database — fresh or partially migrated — to the
-- exact backend the app expects.
--
-- WHAT IT FIXES / GUARANTEES
--   1. admin_set_verification  — was MISSING on the live DB (verify-badge
--      panel silently failed). Added here as SECURITY DEFINER.
--   2. velo_admins RLS infinite recursion (Postgres 42P17) — any direct read
--      of velo_admins 500'd. Replaced with a non-recursive policy.
--   3. create_notification_for_user / record_transaction_for_user — the
--      cross-user RLS-bypass RPCs (re-asserted for fresh-DB portability).
--   4. adjust_balance / increment_/decrement_follow_counts — re-asserted.
--   5. Enriched trade_history + transactions columns.
--   6. RLS policies (public reads where needed, own-row writes).
--   7. Realtime publication membership + REPLICA IDENTITY FULL so DELETE
--      events carry the old row (likes/reposts/comments/follows).
--   8. PostgREST schema reload.
-- ════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 1 · velo_admins — fix infinite-recursion RLS, keep it admin-only
-- ════════════════════════════════════════════════════════════════════════
-- The recursion happens when velo_admins' own SELECT policy references
-- velo_admins (directly or via is_velo_admin()), so evaluating the policy
-- re-evaluates the policy forever. We drop every existing policy on the table
-- and replace reads with a SECURITY DEFINER helper that never triggers RLS.
create table if not exists public.velo_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.velo_admins enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'velo_admins'
  loop
    execute format('drop policy if exists %I on public.velo_admins', pol.policyname);
  end loop;
end $$;

-- No direct table access for anon/authenticated. Membership is checked only
-- through the SECURITY DEFINER is_velo_admin() function below, which bypasses
-- RLS and therefore cannot recurse. (Service role bypasses RLS entirely.)
-- We intentionally create NO permissive policy, so direct selects return 0
-- rows instead of recursing/erroring.

-- is_velo_admin(): true iff the caller is in the allowlist. SECURITY DEFINER
-- so it reads velo_admins without engaging the table's RLS.
create or replace function public.is_velo_admin()
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.velo_admins where user_id = auth.uid());
$$;
grant execute on function public.is_velo_admin() to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 2 · admin_set_verification  (THE MISSING FUNCTION)
-- ════════════════════════════════════════════════════════════════════════
-- Sets or clears profiles.verified_reason for a target user. Only callable by
-- an admin. Pass new_reason = null to un-verify. SECURITY DEFINER so it can
-- write any profile row after the admin check, bypassing the per-row RLS that
-- would otherwise restrict writes to the caller's own profile.
create or replace function public.admin_set_verification(
  target_user_id uuid,
  new_reason     text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_velo_admin() then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  update public.profiles
     set verified_reason = new_reason
   where id = target_user_id;
end; $$;
grant execute on function public.admin_set_verification(uuid, text)
  to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 3 · Cross-user RLS-bypass RPCs (notifications + transactions)
-- ════════════════════════════════════════════════════════════════════════
-- A like / follow / comment / transfer creates a row owned by the RECIPIENT,
-- whose user_id ≠ auth.uid(), so a direct insert is RLS-blocked. These
-- SECURITY DEFINER functions perform the insert as owner after the implicit
-- server-side context. (Already deployed on the live DB; re-asserted here so
-- a fresh project is complete in one run.)
create or replace function public.create_notification_for_user(
  target_user_id uuid,
  p_type         text,
  p_message      text,
  p_related_id   text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, message, related_id, read)
  values (target_user_id, p_type, p_message, p_related_id, false);
end; $$;
grant execute on function public.create_notification_for_user(uuid, text, text, text)
  to authenticated, anon;

create or replace function public.record_transaction_for_user(
  target_user_id uuid,
  p_type         text,
  p_amount       numeric,
  p_tx_hash      text    default null,
  p_counterparty text    default null,
  p_on_chain     boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.transactions (user_id, type, amount, status, on_chain, tx_hash, counterparty)
  values (target_user_id, p_type, p_amount, 'COMPLETED', p_on_chain, p_tx_hash, p_counterparty);
end; $$;
grant execute on function public.record_transaction_for_user(uuid, text, numeric, text, text, boolean)
  to authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 4 · Balance + follow-count helpers (re-asserted)
-- ════════════════════════════════════════════════════════════════════════
-- adjust_balance: credit/debit a profile balance atomically. Only the owner
-- may adjust their own balance (the app calls it for the signed-in user only).
create or replace function public.adjust_balance(uid uuid, delta numeric)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid <> auth.uid() then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  update public.profiles
     set balance = greatest(0, coalesce(balance, 0) + delta)
   where id = uid;
end; $$;
grant execute on function public.adjust_balance(uuid, numeric) to authenticated;

create or replace function public.increment_follow_counts(follower uuid, following uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set following_count = coalesce(following_count, 0) + 1 where id = follower;
  update public.profiles set follower_count  = coalesce(follower_count, 0) + 1 where id = following;
end; $$;
grant execute on function public.increment_follow_counts(uuid, uuid) to authenticated;

create or replace function public.decrement_follow_counts(follower uuid, following uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set following_count = greatest(0, coalesce(following_count, 0) - 1) where id = follower;
  update public.profiles set follower_count  = greatest(0, coalesce(follower_count, 0) - 1) where id = following;
end; $$;
grant execute on function public.decrement_follow_counts(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 5 · Enriched columns (additive, idempotent)
-- ════════════════════════════════════════════════════════════════════════
alter table public.trade_history add column if not exists leverage          numeric;
alter table public.trade_history add column if not exists margin_mode        text;
alter table public.trade_history add column if not exists liquidation_price  numeric;
alter table public.trade_history add column if not exists opened_at          timestamptz;
alter table public.trade_history add column if not exists on_chain           boolean default false;
alter table public.trade_history add column if not exists orderly_order_id   text;
alter table public.trade_history add column if not exists orderly_order_url  text;
alter table public.trade_history add column if not exists tx_hash            text;

alter table public.transactions add column if not exists status        text default 'COMPLETED';
alter table public.transactions add column if not exists on_chain      boolean default true;
alter table public.transactions add column if not exists tx_hash       text;
alter table public.transactions add column if not exists counterparty  text;
alter table public.transactions add column if not exists withdraw_nonce numeric;

-- profiles columns the app reads (no-ops if already present)
alter table public.profiles add column if not exists verified_reason text;
alter table public.profiles add column if not exists follower_count  integer default 0;
alter table public.profiles add column if not exists following_count integer default 0;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 6 · RLS policies (public reads where needed, own-row writes)
-- ════════════════════════════════════════════════════════════════════════
-- profiles — public read
alter table public.profiles enable row level security;
drop policy if exists velo_profiles_select on public.profiles;
create policy velo_profiles_select on public.profiles for select using (true);
drop policy if exists velo_profiles_update_own on public.profiles;
create policy velo_profiles_update_own on public.profiles for update using (id = auth.uid());

-- posts — public read, own write/delete
alter table public.posts enable row level security;
drop policy if exists velo_posts_select_public on public.posts;
create policy velo_posts_select_public on public.posts for select using (true);
drop policy if exists velo_posts_insert on public.posts;
create policy velo_posts_insert on public.posts for insert with check (author_id = auth.uid());
drop policy if exists velo_posts_delete on public.posts;
create policy velo_posts_delete on public.posts for delete using (author_id = auth.uid());

-- likes — public read, own write
alter table public.likes enable row level security;
drop policy if exists velo_likes_select on public.likes;
create policy velo_likes_select on public.likes for select using (true);
drop policy if exists velo_likes_insert on public.likes;
create policy velo_likes_insert on public.likes for insert with check (user_id = auth.uid());
drop policy if exists velo_likes_delete on public.likes;
create policy velo_likes_delete on public.likes for delete using (user_id = auth.uid());

-- reposts — public read, own write
alter table public.reposts enable row level security;
drop policy if exists velo_reposts_select on public.reposts;
create policy velo_reposts_select on public.reposts for select using (true);
drop policy if exists velo_reposts_insert on public.reposts;
create policy velo_reposts_insert on public.reposts for insert with check (user_id = auth.uid());
drop policy if exists velo_reposts_delete on public.reposts;
create policy velo_reposts_delete on public.reposts for delete using (user_id = auth.uid());

-- comments — public read, own write/delete
alter table public.comments enable row level security;
drop policy if exists velo_comments_select on public.comments;
create policy velo_comments_select on public.comments for select using (true);
drop policy if exists velo_comments_insert on public.comments;
create policy velo_comments_insert on public.comments for insert with check (author_id = auth.uid());
drop policy if exists velo_comments_delete on public.comments;
create policy velo_comments_delete on public.comments for delete using (author_id = auth.uid());

-- follows — public read, own write/delete
alter table public.follows enable row level security;
drop policy if exists velo_follows_select on public.follows;
create policy velo_follows_select on public.follows for select using (true);
drop policy if exists velo_follows_insert on public.follows;
create policy velo_follows_insert on public.follows for insert with check (follower_id = auth.uid());
drop policy if exists velo_follows_delete on public.follows;
create policy velo_follows_delete on public.follows for delete using (follower_id = auth.uid());

-- notifications — owner read/insert/update
alter table public.notifications enable row level security;
drop policy if exists velo_notif_select on public.notifications;
create policy velo_notif_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists velo_notif_insert on public.notifications;
create policy velo_notif_insert on public.notifications for insert with check (user_id = auth.uid());
drop policy if exists velo_notif_update on public.notifications;
create policy velo_notif_update on public.notifications for update using (user_id = auth.uid());

-- trade_history — public read (leaderboard/profiles), own insert
alter table public.trade_history enable row level security;
drop policy if exists velo_th_read on public.trade_history;
create policy velo_th_read on public.trade_history for select using (true);
drop policy if exists velo_th_insert on public.trade_history;
create policy velo_th_insert on public.trade_history for insert with check (user_id = auth.uid());

-- transactions — owner read, own insert
alter table public.transactions enable row level security;
drop policy if exists velo_tx_select on public.transactions;
create policy velo_tx_select on public.transactions for select using (user_id = auth.uid());
drop policy if exists velo_tx_insert on public.transactions;
create policy velo_tx_insert on public.transactions for insert with check (user_id = auth.uid());

-- positions / open_orders — owner read/write (defensive; tables may already
-- have policies). Wrapped in DO blocks so a missing table never aborts the run.
do $$ begin
  if to_regclass('public.positions') is not null then
    execute 'alter table public.positions enable row level security';
    execute 'drop policy if exists velo_pos_all on public.positions';
    execute 'create policy velo_pos_all on public.positions for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;
do $$ begin
  if to_regclass('public.open_orders') is not null then
    execute 'alter table public.open_orders enable row level security';
    execute 'drop policy if exists velo_ord_all on public.open_orders';
    execute 'create policy velo_ord_all on public.open_orders for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 7 · Realtime: publication membership + REPLICA IDENTITY FULL
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  tables text[] := array['posts','likes','comments','reposts','profiles','follows','notifications','transactions','positions','open_orders'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- FULL replica identity so DELETE payloads include the old row (needed for the
-- like/repost/comment/follow DELETE handlers to know which row was removed).
do $$
declare
  t text;
  tables text[] := array['likes','reposts','comments','follows','posts'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- SECTION 8 · Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- DONE.
--   • admin_set_verification now exists (verify-badge panel works).
--   • velo_admins no longer recurses on read.
--   • All cross-user RPCs, balance/follow helpers, columns, RLS, and realtime
--     are in their expected state.
-- To make yourself an admin, insert your auth user id once:
--     insert into public.velo_admins (user_id) values ('<your-auth-uid>')
--     on conflict do nothing;
-- ════════════════════════════════════════════════════════════════════════
