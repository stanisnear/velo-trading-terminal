begin;
do $test$
declare
  a uuid; b uuid; p uuid := gen_random_uuid(); own_post uuid := gen_random_uuid();
  parent uuid := gen_random_uuid(); reply uuid := gen_random_uuid(); n integer; handle_b text;
begin
  select id into a from public.profiles order by id limit 1;
  select id, coalesce(handle,'@'||username) into b,handle_b from public.profiles where id<>a order by id limit 1;
  if a is null or b is null then raise exception 'Test profiles missing'; end if;
  insert into public.posts(id,author_id,content) values(p,b,'Notification regression fixture'),(own_post,a,'Hello '||handle_b);
  insert into public.comments(id,post_id,author_id,content,parent_id) values
    (parent,p,b,'Parent reply',null),(reply,p,a,'Nested reply',parent);
  delete from public.follows where follower_id=a and following_id=b;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  set local role authenticated;
  -- A late retry after an unfollow is a no-op, not a new alert.
  perform public.create_notification_for_user(b,'FOLLOW','forged');
  begin
    perform public.create_notification_for_user(b,'TRANSFER_RECEIVED','forged');
    raise exception 'Unverified transfer notification accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_transaction_for_user(b,'RECEIVE',500,'forged','confirmed',false);
    raise exception 'Unverified transaction accepted';
  exception when insufficient_privilege then null; end;
  insert into public.follows(follower_id,following_id) values(a,b);
  perform public.create_notification_for_user(b,'FOLLOW','forged');
  insert into public.likes(user_id,post_id) values(a,p);
  perform public.create_notification_for_user(b,'LIKE','forged',null,p);
  perform public.create_notification_for_user(b,'LIKE','forged again',null,p);
  insert into public.reposts(user_id,post_id) values(a,p);
  perform public.create_notification_for_user(b,'REPOST','forged',null,p);
  insert into public.comment_likes(user_id,comment_id) values(a,parent);
  perform public.create_notification_for_user(b,'LIKE','forged',null,p,parent);
  perform public.create_notification_for_user(b,'COMMENT','forged',null,p,reply);
  perform public.create_notification_for_user(b,'MENTION','forged',null,own_post);
  perform public.create_notification_for_user(b,'COMMENT','forged',null,own_post,reply); -- nonexistent event must produce no row
  perform public.create_notification_for_user(b,'MENTION','forged',null,p); -- nonexistent event must produce no row
  reset role;
  select count(*) into n from public.notifications where user_id=b and post_id in(p,own_post);
  if n<>5 then raise exception 'Expected five canonical events, got %',n; end if;
  if exists(select 1 from public.notifications where user_id=b and post_id in(p,own_post) and message like 'forged%') then
    raise exception 'Client message was trusted';
  end if;
  set local role anon;
  begin
    perform public.create_notification_for_user(b,'FOLLOW','forged');
    raise exception 'Anonymous notification accepted';
  exception when insufficient_privilege then null; end;
  reset role;
end $test$;
rollback;
select 'PASS: valid events, canonical messages, deduplication, parent ownership, forged financial events and anonymous access; fixtures rolled back' as result;
