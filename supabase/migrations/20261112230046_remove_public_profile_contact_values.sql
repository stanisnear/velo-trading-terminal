-- Keep private contact settings authoritative. Preserve the public column as
-- a nullable compatibility field for clients that still select profiles.*.
lock table public.profiles in share row exclusive mode;

insert into velo_internal.profile_contacts(user_id, email)
select id, lower(btrim(email))
from public.profiles
where nullif(btrim(email), '') is not null
on conflict (user_id) do nothing;

do $$
begin
  if exists (
    select 1
    from public.profiles p
    left join velo_internal.profile_contacts c on c.user_id = p.id
    where nullif(btrim(p.email), '') is not null
      and lower(btrim(p.email)) is distinct from lower(btrim(c.email))
  ) then
    raise exception 'Legacy contacts conflict with private contact settings';
  end if;
end;
$$;

update public.profiles set email = null where email is not null;
alter table public.profiles add constraint profiles_email_private check (email is null);
