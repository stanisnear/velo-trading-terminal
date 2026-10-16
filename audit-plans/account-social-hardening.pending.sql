-- Apply only after the signature-login backend and frontend have been verified.
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
update public.profiles set email=null where email is not null;
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

-- Wallet pseudo-accounts never have usable email/password credentials again.
create or replace function velo_internal.wallet_password_disabled() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.email ~ '^0x[0-9a-f]{40}@wallet[.]velo$' then new.encrypted_password=null; end if;
  return new;
end; $$;
create trigger velo_wallet_password_disabled before insert or update of encrypted_password,email on auth.users
  for each row execute function velo_internal.wallet_password_disabled();
update auth.users set encrypted_password=null where email ~ '^0x[0-9a-f]{40}@wallet[.]velo$';
delete from auth.sessions where user_id in (
  select id from auth.users where email ~ '^0x[0-9a-f]{40}@wallet[.]velo$'
    and coalesce(raw_app_meta_data->>'velo_auth_version','') <> '2'
);

-- Restrictive policies prevent old signed JWTs from retaining write access.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' and tablename in
    ('profiles','posts','comments','likes','comment_likes','reposts','follows','positions','open_orders','trade_history','transactions','notifications','user_preferences') loop
    execute format('create policy velo_verified_wallet_session on public.%I as restrictive for all to authenticated using ((select public.velo_verified_session())) with check ((select public.velo_verified_session()))',t.tablename);
  end loop;
end; $$;

-- Keep public social profiles, but protect identity and administrator badges.
create or replace function public.velo_profile_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  new.email=null;
  if current_user in ('authenticated','anon') then
    if tg_op='INSERT' then
      new.verified_reason=null;
      new.wallet_address=auth.jwt()->'app_metadata'->>'velo_wallet_verified';
      new.follower_count=0; new.following_count=0;
    else
      new.verified_reason=old.verified_reason;
      new.wallet_address=old.wallet_address;
      new.follower_count=old.follower_count; new.following_count=old.following_count;
    end if;
  end if;
  return new;
end; $$;
create trigger velo_profile_guard before insert or update on public.profiles for each row execute function public.velo_profile_guard();

-- Replace every notification policy so permissive duplicates cannot expose rows.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
    execute format('drop policy %I on public.notifications',p.policyname);
  end loop;
end; $$;
create policy notifications_owner on public.notifications for all to authenticated
  using (user_id=(select auth.uid()) and (select public.velo_verified_session()))
  with check (user_id=(select auth.uid()) and (select public.velo_verified_session()));

-- Cross-user notifications are generated from committed social actions, never
-- from a caller-provided recipient/message. The old RPC remains a harmless no-op
-- for compatibility with existing tabs; the triggers below are the authority.
create or replace function public.create_notification_for_user(target_user_id uuid,p_type text,p_message text,p_related_id text default null,p_post_id uuid default null,p_comment_id uuid default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not public.velo_verified_session() then raise exception 'Sign in with your wallet'; end if;
end; $$;
revoke all on function public.create_notification_for_user(uuid,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.create_notification_for_user(uuid,text,text,text,uuid,uuid) to authenticated;

create or replace function public.velo_social_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid; target uuid; postid uuid; commentid uuid; kind text; msg text; label text; content text;
begin
  if tg_table_name='follows' then
    actor=coalesce(new.follower_id,old.follower_id); target=coalesce(new.following_id,old.following_id);
    update public.profiles set following_count=(select count(*) from public.follows where follower_id=actor) where id=actor;
    update public.profiles set follower_count=(select count(*) from public.follows where following_id=target) where id=target;
    if tg_op='DELETE' then return old; end if;
    kind='FOLLOW';msg=' started following you';
  elsif tg_table_name in ('likes','reposts') then
    actor=new.user_id;postid=new.post_id;
    select author_id into target from public.posts where id=postid;
    kind=case when tg_table_name='likes' then 'LIKE' else 'REPOST' end;
    msg=case when tg_table_name='likes' then ' liked your post' else ' reposted your post' end;
  elsif tg_table_name='comment_likes' then
    actor=new.user_id;commentid=new.comment_id;
    select author_id,post_id into target,postid from public.comments where id=commentid;
    kind='LIKE';msg=' liked your comment';
  elsif tg_table_name='comments' then
    actor=new.author_id;postid=new.post_id;commentid=new.id;content=new.content;
    if new.parent_id is not null then select author_id into target from public.comments where id=new.parent_id;
    else select author_id into target from public.posts where id=postid; end if;
    kind='COMMENT';msg=' commented: '||left(content,100);
  elsif tg_table_name='posts' then
    actor=new.author_id;postid=new.id;target=new.target_profile_id;content=new.content;
    kind='WALL_POST';msg=' posted on your profile';
  end if;
  select coalesce(handle,username,'A trader') into label from public.profiles where id=actor;
  if target is not null and target<>actor then
    insert into public.notifications(user_id,type,message,related_id,post_id,comment_id)
      values(target,kind,label||msg,coalesce(postid::text,actor::text),postid,commentid);
  end if;
  if content is not null then
    insert into public.notifications(user_id,type,message,related_id,post_id,comment_id)
      select p.id,'MENTION',label||' mentioned you: '||left(content,100),postid::text,postid,commentid
      from public.profiles p where p.id<>actor and p.id is distinct from target
      and lower(p.username) in (select lower(m[1]) from regexp_matches(content,'@([A-Za-z0-9_]{3,20})','g') m);
  end if;
  return new;
end; $$;
create trigger velo_follow_event after insert or delete on public.follows for each row execute function public.velo_social_event();
create trigger velo_like_event after insert on public.likes for each row execute function public.velo_social_event();
create trigger velo_repost_event after insert on public.reposts for each row execute function public.velo_social_event();
create trigger velo_comment_like_event after insert on public.comment_likes for each row execute function public.velo_social_event();
create trigger velo_comment_event after insert on public.comments for each row execute function public.velo_social_event();
create trigger velo_post_event after insert on public.posts for each row execute function public.velo_social_event();
create or replace function public.increment_follow_counts(follower uuid,following uuid) returns void language plpgsql security invoker set search_path='' as $$ begin return; end; $$;
create or replace function public.decrement_follow_counts(follower uuid,following uuid) returns void language plpgsql security invoker set search_path='' as $$ begin return; end; $$;
revoke all on function public.increment_follow_counts(uuid,uuid),public.decrement_follow_counts(uuid,uuid) from public,anon;
grant execute on function public.increment_follow_counts(uuid,uuid),public.decrement_follow_counts(uuid,uuid) to authenticated;

-- Avatar replacement works only inside the signed-in user's own folder.
create policy velo_avatar_owner_insert on storage.objects as restrictive for insert to authenticated
  with check (bucket_id<>'avatars' or ((storage.foldername(name))[1]=(select auth.uid())::text and (select public.velo_verified_session())));
create policy velo_avatar_owner_update on storage.objects as restrictive for update to authenticated
  using (bucket_id<>'avatars' or ((storage.foldername(name))[1]=(select auth.uid())::text and (select public.velo_verified_session())))
  with check (bucket_id<>'avatars' or ((storage.foldername(name))[1]=(select auth.uid())::text and (select public.velo_verified_session())));
create policy velo_avatar_owner_delete on storage.objects as restrictive for delete to authenticated
  using (bucket_id<>'avatars' or ((storage.foldername(name))[1]=(select auth.uid())::text and (select public.velo_verified_session())));
create policy velo_avatar_update on storage.objects for update to authenticated
  using (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.is_velo_admin() returns boolean language sql stable security definer set search_path='' as $$
  select public.velo_verified_session() and exists(select 1 from public.velo_admins where user_id=auth.uid());
$$;
create or replace function public.adjust_balance(uid uuid,delta numeric) returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.velo_verified_session() or uid is distinct from auth.uid() then raise exception 'Forbidden'; end if;
  update public.profiles set balance=greatest(0,coalesce(balance,0)+delta) where id=uid;
end; $$;
create or replace function public.get_public_profiles(lim integer default 100) returns setof public.profiles
language sql security invoker set search_path='' as $$
  select * from public.profiles order by pnl_total desc nulls last limit least(greatest(coalesce(lim,100),1),100);
$$;

-- Unverified cross-user financial activity is no longer accepted.
revoke all on function public.record_transaction_for_user(uuid,text,numeric,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_transaction_for_user(uuid,text,numeric,text,text,boolean) to service_role;
