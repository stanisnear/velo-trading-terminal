-- ════════════════════════════════════════════════════════════════════════
-- VELO · Supabase migration — fix empty notifications + activity/history sync
-- Run once:  Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe & idempotent — you can run it again with no harm.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. RPC: write a notification for ANOTHER user ─────────────────────────
-- THE main reason the bell stays empty. A like / follow / transfer creates a
-- notification for the *recipient*, whose user_id ≠ auth.uid(), so a direct
-- insert is blocked by RLS. The app calls this SECURITY DEFINER function
-- (which runs as owner and bypasses RLS). If it isn't deployed, the fallback
-- direct insert is rejected and no cross-user notification is ever saved.
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

-- ── 2. RPC: record a transaction for ANOTHER user (transfers / RECEIVE) ───
-- Same pattern for the activity feed: when you SEND funds, the recipient's
-- RECEIVE row carries their user_id, so it needs a definer function too.
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

-- ── 3. Make sure every column the app writes actually exists ──────────────
-- trade_history silently degrades to a legacy insert when columns are missing,
-- so trades save but the enriched / on-chain fields (and the activity merge)
-- come back empty. These adds let the full row persist.
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

-- ── 4. RLS — signed-in user can read/write their own rows ─────────────────
-- Idempotent: only manages these velo_* policies, additive to anything you
-- already have. (If your DB already had working RLS this just re-asserts it.)
alter table public.notifications enable row level security;
drop policy if exists velo_notif_select on public.notifications;
create policy velo_notif_select on public.notifications for select using (user_id = auth.uid());
drop policy if exists velo_notif_insert on public.notifications;
create policy velo_notif_insert on public.notifications for insert with check (user_id = auth.uid());
drop policy if exists velo_notif_update on public.notifications;
create policy velo_notif_update on public.notifications for update using (user_id = auth.uid());

alter table public.trade_history enable row level security;
drop policy if exists velo_th_read on public.trade_history;
create policy velo_th_read on public.trade_history for select using (true);  -- public read → leaderboard/profiles
drop policy if exists velo_th_insert on public.trade_history;
create policy velo_th_insert on public.trade_history for insert with check (user_id = auth.uid());

alter table public.transactions enable row level security;
drop policy if exists velo_tx_select on public.transactions;
create policy velo_tx_select on public.transactions for select using (user_id = auth.uid());
drop policy if exists velo_tx_insert on public.transactions;
create policy velo_tx_insert on public.transactions for insert with check (user_id = auth.uid());

-- ── 5. Force PostgREST to reload so the new columns are visible immediately ─
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- Done. Expected result:
--   • Notifications populate (likes/follows/transfers now persist for the recipient)
--   • Activity feed + history capture transfers and full trade metadata
-- If section 4 errors because related_id is a uuid column in your schema,
-- change `p_related_id text` → `p_related_id uuid` in section 1 and re-run.
-- ════════════════════════════════════════════════════════════════════════
