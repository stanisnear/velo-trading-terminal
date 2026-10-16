-- Additive contact API and a narrow notification-read restriction.
-- Does not delete credentials, sessions, emails, or alter other table policies.
create or replace function public.velo_verified_session()
returns boolean language sql stable set search_path='' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'email','') !~ '^0x[0-9a-f]{40}@wallet[.]velo$'
    or (auth.jwt()->'app_metadata'->>'velo_wallet_verified' = split_part(auth.jwt()->>'email','@',1)
        and auth.jwt()->'app_metadata'->>'velo_auth_version'='2'));
$$;
revoke all on function public.velo_verified_session() from public;
grant execute on function public.velo_verified_session() to anon,authenticated,service_role;

create table if not exists velo_internal.profile_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null, updated_at timestamptz not null default now()
);
alter table velo_internal.profile_contacts enable row level security;
revoke all on velo_internal.profile_contacts from public,anon,authenticated;
insert into velo_internal.profile_contacts(user_id,email)
  select id,email from public.profiles where nullif(trim(email),'') is not null
  on conflict(user_id) do nothing;
create or replace function public.get_my_contact_email() returns text
language plpgsql security definer set search_path='' as $$
begin
  if not public.velo_verified_session() then raise exception 'Sign in with your wallet'; end if;
  return (select email from velo_internal.profile_contacts where user_id=auth.uid());
end; $$;
create or replace function public.set_my_contact_email(contact_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.velo_verified_session() then raise exception 'Sign in with your wallet'; end if;
  if length(contact_email)>254 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  insert into velo_internal.profile_contacts(user_id,email) values(auth.uid(),lower(trim(contact_email)))
    on conflict(user_id) do update set email=excluded.email,updated_at=now();
end; $$;
revoke all on function public.get_my_contact_email(),public.set_my_contact_email(text) from public,anon;
grant execute on function public.get_my_contact_email(),public.set_my_contact_email(text) to authenticated;


create policy notifications_private_read on public.notifications as restrictive for select to public
  using (user_id=(select auth.uid()));
