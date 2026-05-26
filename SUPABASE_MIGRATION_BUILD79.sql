-- ═══════════════════════════════════════════════════════════════════════════
-- VELO — Schema migration for build 79
-- ═══════════════════════════════════════════════════════════════════════════
-- Apply this to your existing Supabase database. It is idempotent — safe to
-- re-run. It does NOT drop or rename existing data; only adds new columns,
-- relaxes a CHECK constraint, and enables Realtime on tables that need it.
--
-- What changed and why:
--
--   1. profiles
--      + wallet_address     — primary owner wallet (MetaMask/Rabby), used to
--                             distinguish demo users (NULL) from live users.
--                             The leaderboard filter now uses this directly
--                             instead of inferring from client-side state.
--      + velo_wallet_address — derived burner address used to sign Orderly
--                             requests. Stored for audit/recovery only;
--                             the keypair itself stays in localStorage.
--      + auth_method        — 'EMAIL' or 'WALLET'. Set on signup.
--
--   2. transactions
--      + on_chain           — was already inserted by code with fallback;
--                             now formally part of the schema.
--      + tx_hash            — BaseScan tx hash for real on-chain deposits,
--                             OR `faucet:<addr>` for Orderly faucet credits.
--      + withdraw_nonce     — Orderly withdraw nonce, used to track the
--                             vault unlock state.
--      + Status check now allows 'PENDING' (was 'COMPLETED' only).
--      + Realtime enabled so dashboard activity updates without polling.
--
--   3. positions
--      + on_chain           — TRUE for Orderly positions, FALSE for sim.
--      + orderly_order_id   — the originating order id from Orderly.
--      + orderly_order_url  — link to Orderly's order detail page.
--
--   4. open_orders
--      + on_chain
--      + orderly_order_id
--      + orderly_order_url
--      + take_profit / stop_loss — were already in TS type but missing here.
--
--   5. trade_history
--      + on_chain
--      + orderly_order_id
--      + orderly_order_url
--      + tx_hash
--
--   6. trade_history & transactions added to the realtime publication.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. profiles ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_address      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS velo_wallet_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_method         TEXT
  CHECK (auth_method IN ('EMAIL','WALLET'));

-- Lowercase index on wallet_address for fast leaderboard filtering.
CREATE INDEX IF NOT EXISTS profiles_wallet_address_idx
  ON public.profiles (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;

-- ── 2. transactions ──────────────────────────────────────────────────────────
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS on_chain       BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tx_hash        TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS withdraw_nonce BIGINT;

-- Allow PENDING status for in-flight on-chain deposits/withdrawals.
DO $$
BEGIN
  -- Drop old check constraint if its definition is too strict
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_status_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%PENDING%'
  ) THEN
    ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;
  END IF;
END $$;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('PENDING','COMPLETED','FAILED'));

-- Useful indexes for the dashboard activity query.
CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_tx_hash_idx
  ON public.transactions (tx_hash) WHERE tx_hash IS NOT NULL;

-- ── 3. positions ─────────────────────────────────────────────────────────────
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;

-- ── 4. open_orders ───────────────────────────────────────────────────────────
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS take_profit       NUMERIC;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS stop_loss         NUMERIC;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;

-- ── 5. trade_history ─────────────────────────────────────────────────────────
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS tx_hash           TEXT;

CREATE INDEX IF NOT EXISTS trade_history_user_created_idx
  ON public.trade_history (user_id, created_at DESC);

-- ── 6. Realtime publication ──────────────────────────────────────────────────
-- Add tables that benefit from live updates (transactions for the dashboard
-- activity feed, trade_history for the live history tab, profiles so wallet
-- connect status propagates).
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['transactions','trade_history','profiles']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL so DELETE/UPDATE events carry full row context to
-- subscribed clients (otherwise only the PK is sent, breaking optimistic
-- reconciliation in the activity feed).
ALTER TABLE public.transactions  REPLICA IDENTITY FULL;
ALTER TABLE public.trade_history REPLICA IDENTITY FULL;

-- Supabase/PostgREST reads through a schema cache. Reload it so newly-added
-- columns like on_chain/tx_hash are immediately usable by the REST API.
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification queries — run these after the migration to confirm the new
-- columns exist. Each should return at least one row.
-- ═══════════════════════════════════════════════════════════════════════════
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'profiles' AND column_name IN
--          ('wallet_address','velo_wallet_address','auth_method');
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'transactions' AND column_name IN
--          ('on_chain','tx_hash','withdraw_nonce');
--
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--      AND tablename IN ('transactions','trade_history','profiles');
--
-- ═══════════════════════════════════════════════════════════════════════════
