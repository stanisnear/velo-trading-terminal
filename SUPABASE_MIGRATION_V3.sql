-- ============================================================
-- SUPABASE_MIGRATION_V3.sql
-- Run once in Supabase SQL editor (safe to re-run — all idempotent).
-- ============================================================
-- What this adds:
--   1. on_chain_order_id   — stores the V3 contract's orderId so we
--      can match an on-chain conditional order to its Supabase row.
--      Used to sync order status (cancelled, executed) and to build
--      the correct cancel call from the UI.
--   2. tx_hash on open_orders — the transaction hash when the order
--      was placed on-chain. Lets users click through to Basescan.
--   3. Ensure margin_mode column exists on open_orders and that the
--      CHECK constraint accepts 'CROSS' (previously only 'ISOLATED').
--   4. Reload PostgREST schema cache so the REST API sees new columns
--      immediately without a project restart.
-- ============================================================

-- 1. on_chain_order_id (bigint, nullable — null for off-chain orders)
ALTER TABLE public.open_orders
  ADD COLUMN IF NOT EXISTS on_chain_order_id BIGINT;

-- 2. tx_hash for the placement transaction
ALTER TABLE public.open_orders
  ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- 3. margin_mode column (was added in build79 but without CHECK — ensure it's there)
ALTER TABLE public.open_orders
  ADD COLUMN IF NOT EXISTS margin_mode TEXT DEFAULT 'ISOLATED';

-- Drop and re-add the margin_mode check to allow both ISOLATED and CROSS.
-- (safe: the existing data only contains 'ISOLATED' which passes the new check too)
ALTER TABLE public.open_orders
  DROP CONSTRAINT IF EXISTS open_orders_margin_mode_check;
ALTER TABLE public.open_orders
  ADD CONSTRAINT open_orders_margin_mode_check
    CHECK (margin_mode IS NULL OR margin_mode IN ('ISOLATED', 'CROSS'));

-- 4. Index for fast lookup by on_chain_order_id (for sync queries)
CREATE INDEX IF NOT EXISTS open_orders_on_chain_order_id_idx
  ON public.open_orders (on_chain_order_id)
  WHERE on_chain_order_id IS NOT NULL;

-- 5. Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
