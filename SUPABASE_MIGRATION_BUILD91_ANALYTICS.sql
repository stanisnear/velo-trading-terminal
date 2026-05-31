-- ============================================================================
-- VELO · Build 91 · Admin analytics migration
-- Adds activity tracking so the Protocol Admin dashboard can compute
-- DAU / WAU / MAU and a historical daily-active-users chart.
--
-- Safe to run multiple times (idempotent). Run in the Supabase SQL editor.
-- After running, reload the PostgREST schema cache:
--   Settings → API → "Reload schema cache"  (or it refreshes within ~1 min).
-- ============================================================================

-- 1. Latest-activity stamp on profiles → drives the DAU/WAU/MAU snapshot.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_active
  ON public.profiles (last_active_at);

-- 2. Per-day activity rows → drives the historical daily-active chart.
--    One row per (user, calendar day). Upserted by the heartbeat below.
CREATE TABLE IF NOT EXISTS public.user_activity_daily (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  day     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_activity_daily_day
  ON public.user_activity_daily (day);

-- 3. RLS: users may write only their own activity. Reads are gated to the
--    service role (the admin dashboard reads via /api/user-stats using the
--    service key), so no broad SELECT policy is granted to anon/authenticated.
ALTER TABLE public.user_activity_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own activity insert" ON public.user_activity_daily;
CREATE POLICY "own activity insert"
  ON public.user_activity_daily FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own activity update" ON public.user_activity_daily;
CREATE POLICY "own activity update"
  ON public.user_activity_daily FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. Heartbeat RPC. SECURITY DEFINER so it can stamp both tables under RLS in
--    a single round trip. Called by the client every few minutes while active.
CREATE OR REPLACE FUNCTION public.touch_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;  -- not authenticated; nothing to record
  END IF;

  UPDATE public.profiles
     SET last_active_at = now()
   WHERE id = uid;

  INSERT INTO public.user_activity_daily (user_id, day)
  VALUES (uid, (now() AT TIME ZONE 'utc')::date)
  ON CONFLICT (user_id, day) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_activity() TO authenticated;

-- 5. Backfill: seed last_active_at from the most recent known activity so the
--    first dashboard load isn't empty. Uses trade_history, then created_at.
UPDATE public.profiles p
   SET last_active_at = COALESCE(p.last_active_at, sub.last_trade, p.created_at)
  FROM (
    SELECT user_id, MAX(created_at) AS last_trade
      FROM public.trade_history
     GROUP BY user_id
  ) sub
 WHERE p.id = sub.user_id
   AND p.last_active_at IS NULL;

UPDATE public.profiles
   SET last_active_at = created_at
 WHERE last_active_at IS NULL;

-- ============================================================================
-- Done. The admin dashboard's user metrics will populate on next refresh.
-- ============================================================================
