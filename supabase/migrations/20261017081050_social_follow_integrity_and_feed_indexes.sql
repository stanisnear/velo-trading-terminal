-- Preserve social data while making follows idempotent and counters database-owned.
set lock_timeout = '5s';
create index if not exists follows_following_lookup on public.follows(following_id, follower_id);
create index if not exists posts_feed_created on public.posts(created_at desc, id);
create index if not exists posts_author_created on public.posts(author_id, created_at desc);
create index if not exists likes_post_lookup on public.likes(post_id, user_id);
create index if not exists reposts_post_lookup on public.reposts(post_id, user_id);
create index if not exists notifications_owner_created on public.notifications(user_id, created_at desc);

alter table public.follows enable row level security;
do $policies$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='follows' loop
    execute format('drop policy %I on public.follows',p.policyname);
  end loop;
end $policies$;
create policy follows_public_read on public.follows for select to anon, authenticated using (true);
create policy follows_owner_insert on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower_id and follower_id <> following_id);
create policy follows_owner_delete on public.follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

-- One-time reconciliation from actual relationships. No accounts or follows are removed.
update public.profiles p set
  follower_count=(select count(*) from public.follows f where f.following_id=p.id),
  following_count=(select count(*) from public.follows f where f.follower_id=p.id);

create or replace function public.maintain_follow_counts() returns trigger
language plpgsql security definer set search_path = '' as $body$
declare a uuid; b uuid; delta integer;
begin
  if tg_op='INSERT' then a:=new.follower_id; b:=new.following_id; delta:=1;
  else a:=old.follower_id; b:=old.following_id; delta:=-1; end if;
  -- Stable lock ordering prevents reciprocal follows from deadlocking.
  perform id from public.profiles where id in(a,b) order by id for update;
  update public.profiles set following_count=greatest(0,coalesce(following_count,0)+delta) where id=a;
  update public.profiles set follower_count=greatest(0,coalesce(follower_count,0)+delta) where id=b;
  return null;
end $body$;
revoke all on function public.maintain_follow_counts() from public, anon, authenticated;
create trigger follows_maintain_counts after insert or delete on public.follows
for each row execute function public.maintain_follow_counts();

create or replace function public.protect_follow_counts() returns trigger
language plpgsql security invoker set search_path = '' as $body$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then new.follower_count:=0; new.following_count:=0;
    else new.follower_count:=old.follower_count; new.following_count:=old.following_count; end if;
  end if;
  return new;
end $body$;
revoke all on function public.protect_follow_counts() from public, anon, authenticated;
create trigger profiles_protect_follow_counts before insert or update on public.profiles
for each row execute function public.protect_follow_counts();

-- Older clients still call these after modifying follows. Counts are now maintained by the trigger.
create or replace function public.increment_follow_counts(follower uuid, following uuid) returns void
language plpgsql security invoker set search_path = '' as $body$
begin
  if (select auth.uid()) is distinct from follower then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end $body$;
create or replace function public.decrement_follow_counts(follower uuid, following uuid) returns void
language plpgsql security invoker set search_path = '' as $body$
begin
  if (select auth.uid()) is distinct from follower then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end $body$;
revoke all on function public.increment_follow_counts(uuid,uuid) from public, anon;
revoke all on function public.decrement_follow_counts(uuid,uuid) from public, anon;
grant execute on function public.increment_follow_counts(uuid,uuid), public.decrement_follow_counts(uuid,uuid) to authenticated;

create or replace function public.set_following(target uuid, enabled boolean) returns boolean
language plpgsql security invoker set search_path = '' as $body$
declare actor uuid := (select auth.uid());
begin
  if actor is null or target is null or actor=target or enabled is null then
    raise exception 'Invalid follow request' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
  if enabled then
    insert into public.follows(follower_id,following_id) values(actor,target)
      on conflict(follower_id,following_id) do nothing;
  else
    delete from public.follows where follower_id=actor and following_id=target;
  end if;
  return enabled;
end $body$;
revoke all on function public.set_following(uuid,boolean) from public, anon;
grant execute on function public.set_following(uuid,boolean) to authenticated;
