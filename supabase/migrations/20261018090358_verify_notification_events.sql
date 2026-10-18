-- Legacy activity insertion is replaced by the receipt-verified server endpoint.
revoke all on function public.record_transaction_for_user(uuid,text,numeric,text,text,boolean) from public,anon,authenticated;

create or replace function public.create_notification_for_user(
  target_user_id uuid, p_type text, p_message text, p_related_id text default null,
  p_post_id uuid default null, p_comment_id uuid default null
) returns void language plpgsql security definer set search_path='' as $$
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
  if not coalesce(allowed,false) then raise exception 'Event not found' using errcode='42501'; end if;
  -- Repeated retries of the same event should not spam the recipient.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',actor,target_user_id,p_type,reference,p_comment_id),0));
  insert into public.notifications(user_id,type,message,related_id,post_id,comment_id)
    select target_user_id,p_type,canonical_message,reference,p_post_id,p_comment_id
    where not exists(select 1 from public.notifications n
      where n.user_id=target_user_id and n.type=p_type and n.message=canonical_message
        and n.related_id is not distinct from reference
        and n.post_id is not distinct from p_post_id and n.comment_id is not distinct from p_comment_id
        and n.created_at>now()-interval '24 hours');
end;
$$;
revoke all on function public.create_notification_for_user(uuid,text,text,text,uuid,uuid) from public,anon;
grant execute on function public.create_notification_for_user(uuid,text,text,text,uuid,uuid) to authenticated;

