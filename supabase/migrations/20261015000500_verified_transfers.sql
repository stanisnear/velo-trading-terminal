create table velo_internal.verified_transfers (
  tx_hash text not null, event_index integer not null, target uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(tx_hash,event_index,target)
);
alter table velo_internal.verified_transfers enable row level security;
revoke all on velo_internal.verified_transfers from public,anon,authenticated;
create or replace function public.velo_record_verified_transfer(target uuid,tx_hash text,event_index integer,amount numeric,sender text)
returns void language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden'; end if;
  if amount<=0 or tx_hash !~ '^0x[0-9a-f]{64}$' or sender !~ '^0x[0-9a-f]{40}$' then raise exception 'Invalid transfer'; end if;
  insert into velo_internal.verified_transfers(tx_hash,event_index,target) values(tx_hash,event_index,target) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return; end if;
  insert into public.transactions(user_id,type,amount,status,on_chain,tx_hash,counterparty)
    values(target,'RECEIVE',amount,'COMPLETED',true,tx_hash,sender);
  insert into public.notifications(user_id,type,message,related_id)
    values(target,'TRANSFER_RECEIVED',sender||' sent you '||amount::text||' mUSDC on Base Sepolia',tx_hash);
end; $$;
revoke all on function public.velo_record_verified_transfer(uuid,text,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.velo_record_verified_transfer(uuid,text,integer,numeric,text) to service_role;
