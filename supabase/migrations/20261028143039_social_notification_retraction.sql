-- Social notifications describe an action that still exists. Financial receipts are unchanged.
alter table public.notifications add column if not exists actor_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists retracted_at timestamptz;
create index if not exists notifications_active_actor_event_idx on public.notifications(actor_id,type,post_id,comment_id) where retracted_at is null;
-- Only recover actor identity from canonical, exact handles (never message LIKE patterns).
update public.notifications n set actor_id=p.id from public.profiles p
 where n.actor_id is null and n.type in ('LIKE','REPOST','FOLLOW','COMMENT','MENTION','WALL_POST')
 and split_part(n.message,' ',1)=coalesce(p.handle,'@'||p.username);
CREATE OR REPLACE FUNCTION public.create_notification_for_user(target_user_id uuid, p_type text, p_message text, p_related_id text DEFAULT NULL::text, p_post_id uuid DEFAULT NULL::uuid, p_comment_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  actor_handle text;
  target_handle text;
  body text;
  allowed boolean := false;
  canonical_message text;
  reference text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if target_user_id=actor then return; end if;
  select coalesce(handle,'@'||username) into actor_handle from public.profiles where id=actor;
  select lower(ltrim(coalesce(handle,username),'@')) into target_handle from public.profiles where id=target_user_id;
  if actor_handle is null or target_handle is null then raise exception 'Profile not found' using errcode='42501'; end if;
  -- Serialize creation and undo for the same actor/event, including late retries.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','velo-notification',actor,p_type,p_post_id,p_comment_id),0));
  reference := p_post_id::text;
  case p_type
    when 'FOLLOW' then
      allowed := p_post_id is null and p_comment_id is null and exists(
        select 1 from public.follows where follower_id=actor and following_id=target_user_id);
      canonical_message := actor_handle||' started following you';
      reference := actor::text;
    when 'LIKE' then
      if p_comment_id is not null then
        allowed := exists(select 1 from public.comments c join public.comment_likes l on l.comment_id=c.id
          where c.id=p_comment_id and c.post_id=p_post_id and c.author_id=target_user_id and l.user_id=actor);
        canonical_message := actor_handle||' liked your comment';
      else
        allowed := exists(select 1 from public.posts p join public.likes l on l.post_id=p.id
          where p.id=p_post_id and p.author_id=target_user_id and l.user_id=actor);
        canonical_message := actor_handle||' liked your post';
      end if;
    when 'REPOST' then
      allowed := p_comment_id is null and exists(select 1 from public.posts p join public.reposts r on r.post_id=p.id
        where p.id=p_post_id and p.author_id=target_user_id and r.user_id=actor);
      canonical_message := actor_handle||' reposted your post';
    when 'COMMENT' then
      select c.content into body from public.comments c join public.posts p on p.id=c.post_id
        left join public.comments parent on parent.id=c.parent_id
        where c.id=p_comment_id and c.post_id=p_post_id and c.author_id=actor
          and ((c.parent_id is null and p.author_id=target_user_id) or parent.author_id=target_user_id);
      allowed := found;
      canonical_message := actor_handle||' replied: "'||left(body,80)||'"';
    when 'WALL_POST' then
      allowed := p_comment_id is null and exists(select 1 from public.posts
        where id=p_post_id and author_id=actor and target_profile_id=target_user_id);
      canonical_message := actor_handle||' posted on your profile';
    when 'MENTION' then
      if p_comment_id is not null then
        select content into body from public.comments where id=p_comment_id and post_id=p_post_id and author_id=actor;
      else
        select content into body from public.posts where id=p_post_id and author_id=actor;
      end if;
      allowed := body is not null and exists(
        select 1 from regexp_matches(lower(body),'@([a-z0-9_]+)','g') as mention
        where mention[1]=target_handle);
      canonical_message := actor_handle||' mentioned you: "'||left(body,80)||'"';
    else
      raise exception 'Unsupported notification event' using errcode='42501';
  end case;
  if not coalesce(allowed,false) then return; end if;
  -- Repeated retries of the same event should not spam the recipient.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',actor,target_user_id,p_type,reference,p_comment_id),0));
  insert into public.notifications(user_id,type,message,related_id,post_id,comment_id,actor_id)
    select target_user_id,p_type,canonical_message,reference,p_post_id,p_comment_id,actor
    where not exists(select 1 from public.notifications n
      where n.user_id=target_user_id and n.type=p_type and n.message=canonical_message
        and n.related_id is not distinct from reference
        and n.post_id is not distinct from p_post_id and n.comment_id is not distinct from p_comment_id
        and n.actor_id=actor and n.retracted_at is null);
end;
$function$;

-- Trigger runs with bounded elevated rights because an actor cannot update a
-- recipient's rows under RLS. It is private and not callable by API clients.
create schema if not exists private;
create or replace function private.retract_social_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; event_kind text; post uuid; comment uuid; recipient uuid;
begin
  if tg_table_name='follows' then actor:=old.follower_id; event_kind:='FOLLOW'; recipient:=old.following_id;
  elsif tg_table_name='comment_likes' then actor:=old.user_id; event_kind:='LIKE'; comment:=old.comment_id;
    select post_id into post from public.comments where id=comment;
  else actor:=old.user_id; post:=old.post_id; event_kind:=case when tg_table_name='likes' then 'LIKE' else 'REPOST' end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':','velo-notification',actor,event_kind,post,comment),0));
  update public.notifications n set retracted_at=now()
    where n.actor_id=actor and n.type=event_kind and n.retracted_at is null
      and ((event_kind='FOLLOW' and n.user_id=recipient)
        or (event_kind<>'FOLLOW' and n.post_id=post and n.comment_id is not distinct from comment));
  return old;
end $$;
revoke all on function private.retract_social_notification() from public,anon,authenticated;
create trigger likes_retract_notification after delete on public.likes for each row execute function private.retract_social_notification();
create trigger comment_likes_retract_notification after delete on public.comment_likes for each row execute function private.retract_social_notification();
create trigger reposts_retract_notification after delete on public.reposts for each row execute function private.retract_social_notification();
create trigger follows_retract_notification after delete on public.follows for each row execute function private.retract_social_notification();
-- Remove stale legacy social alerts as well, while retaining rows for recovery/audit.
update public.notifications n set retracted_at=now()
where n.retracted_at is null and n.actor_id is not null and (
 (n.type='FOLLOW' and not exists(select 1 from public.follows f where f.follower_id=n.actor_id and f.following_id=n.user_id))
 or (n.type='LIKE' and n.comment_id is null and not exists(select 1 from public.likes l where l.user_id=n.actor_id and l.post_id=n.post_id))
 or (n.type='LIKE' and n.comment_id is not null and not exists(select 1 from public.comment_likes l where l.user_id=n.actor_id and l.comment_id=n.comment_id))
 or (n.type='REPOST' and not exists(select 1 from public.reposts r where r.user_id=n.actor_id and r.post_id=n.post_id))
);
