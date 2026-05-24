-- ══════════════════════════════════════════════════════════════════
-- VELO TRADING TERMINAL — SUPABASE SCHEMA
-- Paste this into Supabase → SQL Editor → New Query and run once.
-- Idempotent: safe to re-run on an existing database.
-- ══════════════════════════════════════════════════════════════════

-- Required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── PROFILES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username        TEXT NOT NULL,
  handle          TEXT NOT NULL,
  bio             TEXT,
  avatar_url      TEXT,
  banner_url      TEXT,
  balance         NUMERIC DEFAULT 0,
  pnl_total       NUMERIC DEFAULT 0,
  realized_pnl    NUMERIC DEFAULT 0,
  win_rate        NUMERIC DEFAULT 0,
  velo_rewards    NUMERIC DEFAULT 50,
  copier_count    INTEGER DEFAULT 0,
  earned_fees     NUMERIC DEFAULT 0,
  copying         TEXT[] DEFAULT '{}',
  follower_count  INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  -- Wallet identity (build 79+). NULL for demo/email users; populated for
  -- wallet-authenticated users. The leaderboard uses wallet_address presence
  -- as its eligibility criterion.
  wallet_address      TEXT,
  velo_wallet_address TEXT,    -- Velo burner trading address (audit only)
  auth_method         TEXT CHECK (auth_method IN ('EMAIL','WALLET')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent migrations for databases created before build 79.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_address      TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS velo_wallet_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS auth_method         TEXT
  CHECK (auth_method IN ('EMAIL','WALLET'));
CREATE INDEX IF NOT EXISTS profiles_wallet_address_idx
  ON public.profiles (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;

-- Drop legacy bot column if it's hanging around from an earlier build
ALTER TABLE public.profiles DROP COLUMN IF EXISTS active_bots;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read"  ON public.profiles;
DROP POLICY IF EXISTS "Self update"  ON public.profiles;
DROP POLICY IF EXISTS "Self insert"  ON public.profiles;
CREATE POLICY "Public read"  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Self update"  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Self insert"  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Case-insensitive username uniqueness.
-- If the existing table has duplicate usernames from earlier testing the
-- CREATE UNIQUE INDEX call below would fail — so we first rename every
-- later duplicate to `<name>_<short-id>` before creating the index. This
-- is only a concern on already-populated databases; fresh DBs skip the
-- rename because the CTE yields zero rows.
WITH dupes AS (
  SELECT id, username,
         row_number() OVER (PARTITION BY lower(username) ORDER BY created_at) AS rn
    FROM public.profiles
)
UPDATE public.profiles p
   SET username = d.username || '_' || substring(p.id::text, 1, 6)
  FROM dupes d
 WHERE p.id = d.id
   AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username));

-- ── POSTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  image_url       TEXT,
  is_trade_signal BOOLEAN DEFAULT FALSE,
  trade_pair      TEXT,
  trade_side      TEXT,
  trade_leverage  NUMERIC,
  trade_entry     NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
DROP POLICY IF EXISTS "Auth insert posts" ON public.posts;
DROP POLICY IF EXISTS "Own delete posts"  ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Auth insert posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Own delete posts"  ON public.posts FOR DELETE USING (auth.uid() = author_id);

-- ── LIKES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  id      BIGSERIAL PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read likes" ON public.likes;
DROP POLICY IF EXISTS "Auth insert likes" ON public.likes;
DROP POLICY IF EXISTS "Own delete likes"  ON public.likes;
CREATE POLICY "Public read likes" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Auth insert likes" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete likes"  ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- ── REPOSTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reposts (
  id      BIGSERIAL PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(post_id, user_id)
);
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read reposts" ON public.reposts;
DROP POLICY IF EXISTS "Auth insert reposts" ON public.reposts;
DROP POLICY IF EXISTS "Own delete reposts"  ON public.reposts;
CREATE POLICY "Public read reposts" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "Auth insert reposts" ON public.reposts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete reposts"  ON public.reposts FOR DELETE USING (auth.uid() = user_id);

-- ── COMMENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read comments" ON public.comments;
DROP POLICY IF EXISTS "Auth insert comments" ON public.comments;
DROP POLICY IF EXISTS "Own delete comments"  ON public.comments;
CREATE POLICY "Public read comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Auth insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Own delete comments"  ON public.comments FOR DELETE USING (auth.uid() = author_id);

-- ── FOLLOWS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  id           BIGSERIAL PRIMARY KEY,
  follower_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read follows" ON public.follows;
DROP POLICY IF EXISTS "Auth insert follows" ON public.follows;
DROP POLICY IF EXISTS "Own delete follows"  ON public.follows;
CREATE POLICY "Public read follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Auth insert follows" ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Own delete follows"  ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- ── POSITIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.positions (
  id                 TEXT PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pair               TEXT NOT NULL,
  side               TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  entry_price        NUMERIC NOT NULL,
  size               NUMERIC NOT NULL,
  leverage           NUMERIC NOT NULL,
  margin_mode        TEXT NOT NULL DEFAULT 'ISOLATED',
  liquidation_price  NUMERIC NOT NULL,
  take_profit        NUMERIC,
  stop_loss          NUMERIC,
  is_copy_trade      BOOLEAN DEFAULT FALSE,
  copy_trader_id     UUID REFERENCES public.profiles(id),
  -- On-chain provenance (build 79+). Live positions sourced from Orderly
  -- carry these; demo positions leave them NULL.
  on_chain           BOOLEAN DEFAULT FALSE,
  orderly_order_id   BIGINT,
  orderly_order_url  TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Drop legacy bot columns if they're still on this table from a previous build
ALTER TABLE public.positions DROP COLUMN IF EXISTS is_bot_trade;
ALTER TABLE public.positions DROP COLUMN IF EXISTS bot_id;

-- Idempotent migrations
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own positions"          ON public.positions;
DROP POLICY IF EXISTS "Read others positions"  ON public.positions;
CREATE POLICY "Own positions"         ON public.positions FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "Read others positions" ON public.positions FOR SELECT USING (true);

-- ── OPEN ORDERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.open_orders (
  id                  TEXT PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pair                TEXT NOT NULL,
  side                TEXT NOT NULL,
  order_type          TEXT NOT NULL,
  price               NUMERIC NOT NULL,
  size                NUMERIC NOT NULL,
  leverage            NUMERIC NOT NULL,
  take_profit         NUMERIC,
  stop_loss           NUMERIC,
  related_position_id TEXT REFERENCES public.positions(id) ON DELETE CASCADE,
  copy_trader_id      UUID REFERENCES public.profiles(id),
  -- On-chain provenance (build 79+)
  on_chain            BOOLEAN DEFAULT FALSE,
  orderly_order_id    BIGINT,
  orderly_order_url   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.open_orders DROP COLUMN IF EXISTS bot_id;
-- Idempotent migrations
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS take_profit       NUMERIC;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS stop_loss         NUMERIC;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;

ALTER TABLE public.open_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own orders" ON public.open_orders;
CREATE POLICY "Own orders" ON public.open_orders FOR ALL USING (auth.uid() = user_id);

-- ── TRADE HISTORY ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trade_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pair              TEXT NOT NULL,
  side              TEXT NOT NULL,
  entry_price       NUMERIC NOT NULL,
  exit_price        NUMERIC,
  size              NUMERIC NOT NULL,
  pnl               NUMERIC DEFAULT 0,
  action            TEXT DEFAULT 'OPEN',
  copy_trader_id    UUID REFERENCES public.profiles(id),
  -- Enriched fields for the order-details modal. Nullable so old rows stay valid.
  leverage          NUMERIC,
  margin_mode       TEXT,
  liquidation_price NUMERIC,
  opened_at         TIMESTAMPTZ,
  -- On-chain provenance (build 79+)
  on_chain          BOOLEAN DEFAULT FALSE,
  orderly_order_id  BIGINT,
  orderly_order_url TEXT,
  tx_hash           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
-- Idempotent migration for databases created before the enriched fields existed.
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS leverage          NUMERIC;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS margin_mode       TEXT;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS liquidation_price NUMERIC;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS on_chain          BOOLEAN DEFAULT FALSE;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS orderly_order_id  BIGINT;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS orderly_order_url TEXT;
ALTER TABLE public.trade_history ADD COLUMN IF NOT EXISTS tx_hash           TEXT;
CREATE INDEX IF NOT EXISTS trade_history_user_created_idx
  ON public.trade_history (user_id, created_at DESC);
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own trade history" ON public.trade_history;
CREATE POLICY "Own trade history" ON public.trade_history FOR ALL USING (auth.uid() = user_id);

-- ── TRANSACTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAW')),
  amount         NUMERIC NOT NULL,
  status         TEXT DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  -- On-chain provenance (build 79+).
  --   on_chain        TRUE when this transaction has on-chain evidence.
  --   tx_hash         BaseScan tx hash for real deposits/withdrawals,
  --                   OR `faucet:<address>` for Orderly faucet credits.
  --   withdraw_nonce  Orderly withdraw nonce, used to track vault unlock.
  on_chain       BOOLEAN DEFAULT FALSE,
  tx_hash        TEXT,
  withdraw_nonce BIGINT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
-- Idempotent migrations
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS on_chain       BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tx_hash        TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS withdraw_nonce BIGINT;

-- Relax status check to allow PENDING (in-flight on-chain ops).
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('PENDING','COMPLETED','FAILED'));

CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_tx_hash_idx
  ON public.transactions (tx_hash) WHERE tx_hash IS NOT NULL;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own transactions" ON public.transactions;
CREATE POLICY "Own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  read       BOOLEAN DEFAULT FALSE,
  related_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own notifications" ON public.notifications;
CREATE POLICY "Own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- ── USER PREFERENCES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme       TEXT NOT NULL DEFAULT 'dark',
  active_pair TEXT NOT NULL DEFAULT 'ETH/USD',
  chart_tf    TEXT NOT NULL DEFAULT '15m',
  chart_style TEXT NOT NULL DEFAULT '1',
  indicators  TEXT[] NOT NULL DEFAULT '{}',
  overlays    JSONB NOT NULL DEFAULT '{"entry":true,"tp":true,"sl":true,"liq":true,"openPos":true,"funding":false}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own preferences" ON public.user_preferences;
CREATE POLICY "Own preferences" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- ── STORAGE (avatars bucket) ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT DO NOTHING;
DROP POLICY IF EXISTS "Public read avatars"   ON storage.objects;
DROP POLICY IF EXISTS "Auth upload avatars"   ON storage.objects;
DROP POLICY IF EXISTS "Own delete avatars"    ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Auth upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Own delete avatars"  ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── REALTIME PUBLICATION ──────────────────────────────────────────
-- Safe on re-run: if the publication doesn't include the table yet, add it.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['posts','likes','reposts','comments','follows','positions','open_orders','notifications','transactions','trade_history','profiles']) LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- table already in publication; ignore
      NULL;
    END;
  END LOOP;
END $$;

-- REPLICA IDENTITY FULL ensures Supabase Realtime sends the complete old row
-- on DELETE / UPDATE events (not just the PK). Required for cross-tab position/order
-- sync, dashboard activity reconciliation, and pending-deposit lifecycle updates.
ALTER TABLE public.transactions  REPLICA IDENTITY FULL;
ALTER TABLE public.trade_history REPLICA IDENTITY FULL;

-- REPLICA IDENTITY FULL ensures Supabase Realtime sends the complete old row
-- on DELETE events (not just the PK). Required for cross-tab position/order sync.
ALTER TABLE public.positions   REPLICA IDENTITY FULL;
ALTER TABLE public.open_orders REPLICA IDENTITY FULL;

-- ══════════════════════════════════════════════════════════════════
-- RPC: delete_own_auth_user
-- Lets a logged-in user hard-delete their own auth.users row. Every
-- public table has ON DELETE CASCADE pointing at profiles(id), and
-- profiles(id) cascades from auth.users(id), so this one call wipes
-- everything atomically and frees the username immediately.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_own_auth_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_own_auth_user() TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: adjust_balance — atomic increment/decrement of profile balance
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.adjust_balance(uid UUID, delta NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_balance NUMERIC;
BEGIN
  -- Only the owner (or service role) can adjust
  IF auth.uid() IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.profiles
     SET balance = GREATEST(0, COALESCE(balance, 0) + delta)
   WHERE id = uid
   RETURNING balance INTO new_balance;
  RETURN new_balance;
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_balance(UUID, NUMERIC) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- RPC: increment/decrement_follow_counts — cheap atomic counters
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.increment_follow_counts(follower UUID, following UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = follower;
  UPDATE public.profiles SET follower_count  = COALESCE(follower_count,  0) + 1 WHERE id = following;
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_follow_counts(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.decrement_follow_counts(follower UUID, following UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET following_count = GREATEST(0, COALESCE(following_count, 0) - 1) WHERE id = follower;
  UPDATE public.profiles SET follower_count  = GREATEST(0, COALESCE(follower_count,  0) - 1) WHERE id = following;
END;
$$;
GRANT EXECUTE ON FUNCTION public.decrement_follow_counts(UUID, UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Auto-create a profile row when a new user signs up via Supabase Auth.
-- This makes the client-side upsert a belt-and-braces safety net rather
-- than the primary mechanism.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u TEXT := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'Trader');
  h TEXT := COALESCE(NEW.raw_user_meta_data->>'handle',   '@' || regexp_replace(u, '\s+', '', 'g'));
BEGIN
  INSERT INTO public.profiles (id, username, handle, avatar_url, banner_url, balance)
  VALUES (
    NEW.id, u, h,
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || u,
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1000&q=80',
    0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── PROFILE WALL (posted_on) ──────────────────────────────────────
-- Add target_profile_id to posts so users can post on each other's walls
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS target_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_target_profile_idx ON public.posts(target_profile_id);
