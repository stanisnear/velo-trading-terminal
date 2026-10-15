-- Server-only one-use wallet challenges. No keys or passwords are stored here.
create table if not exists velo_internal.wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  address text not null, message text not null, ip_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  consumed boolean not null default false
);
alter table velo_internal.wallet_challenges enable row level security;
revoke all on velo_internal.wallet_challenges from public, anon, authenticated;
create index if not exists wallet_challenges_created on velo_internal.wallet_challenges(created_at);

create or replace function public.velo_wallet_auth(op text, data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item velo_internal.wallet_challenges; wallet text := lower(data->>'address'); uid uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  if wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'Invalid wallet'; end if;
  if op = 'challenge' then
    -- Serialize issuance so parallel requests cannot bypass per-IP limits.
    perform pg_advisory_xact_lock(826432319);
    delete from velo_internal.wallet_challenges where created_at < now() - interval '10 minutes';
    if (select count(*) from velo_internal.wallet_challenges where created_at > now() - interval '5 minutes') >= 1000
       or (select count(*) from velo_internal.wallet_challenges where address=wallet and created_at > now() - interval '5 minutes') >= 10
       or (select count(*) from velo_internal.wallet_challenges where ip_hash=data->>'ip_hash' and created_at > now() - interval '5 minutes') >= 30 then return '{}'::jsonb; end if;
    if length(data->>'message') > 1024 or length(data->>'ip_hash') <> 64 then raise exception 'Invalid challenge'; end if;
    insert into velo_internal.wallet_challenges(address,message,ip_hash) values(wallet,data->>'message',data->>'ip_hash') returning * into item;
    return jsonb_build_object('id',item.id);
  elsif op = 'consume' then
    update velo_internal.wallet_challenges set consumed=true
      where id=(data->>'id')::uuid and address=wallet and not consumed and expires_at>now() returning * into item;
    return case when item.id is null then '{}'::jsonb else jsonb_build_object('message',item.message) end;
  elsif op = 'secure_user' then
    select id into uid from auth.users where id=(data->>'id')::uuid and email=wallet||'@wallet.velo' for update;
    if uid is null then raise exception 'Account mismatch'; end if;
    -- Retire all pre-signature refresh sessions once, preserving the account ID.
    if not exists(select 1 from auth.users where id=uid and raw_app_meta_data->>'velo_wallet_verified'=wallet) then
      delete from auth.sessions where user_id=uid;
    end if;
    update auth.users set encrypted_password=null,
      raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('velo_wallet_verified',wallet,'velo_auth_version',2)
      where id=uid;
    update public.profiles set wallet_address=wallet where id=uid;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Invalid operation';
end; $$;
revoke all on function public.velo_wallet_auth(text,jsonb) from public,anon,authenticated;
grant execute on function public.velo_wallet_auth(text,jsonb) to service_role;
