-- Supabase migration: VeloPerps on-chain venue support
-- Run this in Supabase SQL Editor when ready to wire the frontend.
-- It's safe to run multiple times (uses IF NOT EXISTS).
--
-- Adds the columns needed so trade_history and positions rows can carry the
-- on-chain proof (tx hash + trade id) alongside the cached display data.

-- ── trade_history additions ──────────────────────────────────────────────────

ALTER TABLE IF EXISTS trade_history
  ADD COLUMN IF NOT EXISTS venue           TEXT DEFAULT 'velo_perps',
  ADD COLUMN IF NOT EXISTS velo_trade_id   NUMERIC,   -- VeloPerps tradeId (uint256)
  ADD COLUMN IF NOT EXISTS open_tx_hash    TEXT,
  ADD COLUMN IF NOT EXISTS close_tx_hash   TEXT;

CREATE INDEX IF NOT EXISTS trade_history_velo_trade_id_idx
  ON trade_history (velo_trade_id);

-- ── positions additions ──────────────────────────────────────────────────────

ALTER TABLE IF EXISTS positions
  ADD COLUMN IF NOT EXISTS venue          TEXT DEFAULT 'velo_perps',
  ADD COLUMN IF NOT EXISTS velo_trade_id  NUMERIC,
  ADD COLUMN IF NOT EXISTS open_tx_hash   TEXT;

CREATE INDEX IF NOT EXISTS positions_velo_trade_id_idx
  ON positions (velo_trade_id);

-- ── posts additions (for share-to-feed of trades) ────────────────────────────
-- Posts can already reference trade_history rows via existing columns; we add a
-- direct on-chain tx hash so the post survives even if trade_history is purged.

ALTER TABLE IF EXISTS posts
  ADD COLUMN IF NOT EXISTS linked_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS linked_chain   TEXT DEFAULT 'base_sepolia';
