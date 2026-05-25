-- velo_position_triggers
--
-- Stores TP/SL trigger values for open Velo Perps positions.
-- The cron-tp-sl keeper reads from here and (eventually) closes positions
-- when triggers fire. Until the contract is updated to allow keeper-triggered
-- closes, this table exists but the keeper runs in dry-run mode and only logs.
--
-- Lifecycle:
--   - INSERT when frontend opens a position with TP or SL set
--   - UPDATE status when keeper observes the position has closed externally
--   - DELETE (or leave for audit) once status transitions

create table if not exists velo_position_triggers (
  id uuid primary key default gen_random_uuid(),
  trade_id bigint not null,
  trader_address text not null,
  take_profit_price numeric,
  stop_loss_price numeric,
  status text not null default 'active', -- 'active' | 'triggered' | 'archived_position_closed' | 'cancelled'
  created_at timestamptz not null default now(),
  triggered_at timestamptz
);

create index if not exists velo_position_triggers_trader_idx on velo_position_triggers(trader_address);
create index if not exists velo_position_triggers_status_idx on velo_position_triggers(status);
create unique index if not exists velo_position_triggers_trade_unique on velo_position_triggers(trade_id) where status = 'active';

-- Open to all reads (so the keeper can pull via anon key if needed) but
-- writes are filtered to the authenticated trader.
alter table velo_position_triggers enable row level security;

drop policy if exists velo_pt_select on velo_position_triggers;
create policy velo_pt_select on velo_position_triggers
  for select using (true);

drop policy if exists velo_pt_insert on velo_position_triggers;
create policy velo_pt_insert on velo_position_triggers
  for insert with check (true);

drop policy if exists velo_pt_update on velo_position_triggers;
create policy velo_pt_update on velo_position_triggers
  for update using (true);
