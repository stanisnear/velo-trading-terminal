begin;
do $test$
declare a uuid; b uuid; n integer; original_count integer;
begin
 select id into a from public.profiles order by id limit 1;
 select id into b from public.profiles where id<>a order by id limit 1;
 delete from public.follows where follower_id=a and following_id=b;
 select follower_count into original_count from public.profiles where id=b;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.set_following(b,true);
 perform public.set_following(b,true);
 select count(*) into n from public.follows where follower_id=a and following_id=b;
 if n<>1 then raise exception 'FAIL duplicate follow'; end if;
 select follower_count into n from public.profiles where id=b;
 if n<>original_count+1 then raise exception 'FAIL follow count'; end if;
 perform public.increment_follow_counts(a,b);
 select follower_count into n from public.profiles where id=b;
 if n<>original_count+1 then raise exception 'FAIL legacy double count'; end if;
 update public.profiles set following_count=999999 where id=a;
 select following_count into n from public.profiles where id=a;
 if n<>(select count(*) from public.follows where follower_id=a) then raise exception 'FAIL forged profile count'; end if;
 begin
  insert into public.follows(follower_id,following_id) values(b,a);
  raise exception 'FAIL forged follower';
 exception when insufficient_privilege then null; end;
 begin
  perform public.set_following(a,true);
  raise exception 'FAIL self follow';
 exception when insufficient_privilege then null; end;
 perform public.set_following(b,false);
 perform public.set_following(b,false);
 select follower_count into n from public.profiles where id=b;
 if n<>original_count then raise exception 'FAIL unfollow count'; end if;
 reset role;
 set local role anon;
 perform count(*) from public.follows;
 begin
  perform public.set_following(b,true);
  raise exception 'FAIL anonymous follow';
 exception when insufficient_privilege then null; end;
 reset role;
end $test$;
rollback;
select 'PASS: follow/unfollow idempotence, database counts, legacy compatibility, forged-owner/self/anonymous rejection, public reads; fixtures rolled back' as result;
