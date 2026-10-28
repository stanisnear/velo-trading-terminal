-- Live DB integration test. Every fixture, counter and notification rolls back.
begin;
do $test$
declare a uuid; b uuid; p uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); n integer;
begin
 select id into a from public.profiles order by id limit 1;
 select id into b from public.profiles where id<>a order by id limit 1;
 if a is null or b is null then raise exception 'Two test profiles required'; end if;
 insert into public.posts(id,author_id,content) values(p,b,'Rollback-only social lifecycle fixture');
 insert into public.comments(id,post_id,author_id,content) values(c,p,b,'Rollback-only reply');
 delete from public.follows where follower_id=a and following_id=b;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.likes(user_id,post_id) values(a,p);
 perform public.create_notification_for_user(b,'LIKE','untrusted',null,p);
 perform public.create_notification_for_user(b,'LIKE','retry',null,p);
 delete from public.likes where user_id=a and post_id=p;
 perform public.create_notification_for_user(b,'LIKE','late retry',null,p);
 reset role;
 if exists(select 1 from public.notifications where post_id=p and retracted_at is null) then raise exception 'Unlike left an active notification'; end if;
 if (select count(*) from public.notifications where post_id=p)<>1 then raise exception 'Retry duplicated notification'; end if;
 set local role authenticated;
 insert into public.likes(user_id,post_id) values(a,p);
 perform public.create_notification_for_user(b,'LIKE','relike',null,p);
 insert into public.comment_likes(user_id,comment_id) values(a,c);
 perform public.create_notification_for_user(b,'LIKE','comment',null,p,c);
 delete from public.comment_likes where user_id=a and comment_id=c;
 insert into public.reposts(user_id,post_id) values(a,p);
 perform public.create_notification_for_user(b,'REPOST','repost',null,p);
 delete from public.reposts where user_id=a and post_id=p;
 insert into public.follows(follower_id,following_id) values(a,b);
 perform public.create_notification_for_user(b,'FOLLOW','follow');
 delete from public.follows where follower_id=a and following_id=b;
 -- RLS still prevents the actor from reading or modifying the recipient's rows.
 select count(*) into n from public.notifications where user_id=b and post_id=p;
 if n<>0 then raise exception 'Recipient notification leaked through RLS'; end if;
 reset role;
 if (select count(*) from public.notifications where post_id=p and retracted_at is null)<>1 then raise exception 'Relike or undo lifecycle failed'; end if;
 if exists(select 1 from public.notifications where actor_id=a and user_id=b and type='FOLLOW' and retracted_at is null) then raise exception 'Unfollow notification remained'; end if;
 -- Delete cascades remove dependent comment notifications as before.
 delete from public.comments where id=c;
 if exists(select 1 from public.notifications where comment_id=c) then raise exception 'Deleted reply retained notification'; end if;
end $test$;
rollback;
select 'PASS: unlike, relike, comment unlike, unrepost, unfollow, late retries, RLS and deletion cascades; all fixtures rolled back' as result;
