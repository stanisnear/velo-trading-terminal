begin;
do $test$
declare a uuid; b uuid; p uuid; n integer;
begin
 select id into a from public.profiles order by id limit 1;
 select id into b from public.profiles where id<>a order by id limit 1;
 select id into p from public.posts order by id limit 1;
 if a is null or b is null or p is null then raise exception 'Test fixtures missing'; end if;
 delete from public.post_reactions where post_id=p and user_id in (a,b);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.post_reactions(post_id,user_id,kind) values(p,a,'insightful');
 insert into public.post_reactions(post_id,user_id,kind) values(p,a,'bullish') on conflict(post_id,user_id) do update set kind=excluded.kind;
 select count(*) into n from public.post_reactions where post_id=p and user_id=a and kind='bullish';
 if n<>1 then raise exception 'Duplicate or missing reaction'; end if;
 begin
  insert into public.post_reactions(post_id,user_id,kind) values(p,b,'celebrate');
  raise exception 'Forged user accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.post_reactions set user_id=b where post_id=p and user_id=a;
  raise exception 'Owner change accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.post_reactions set kind='invalid' where post_id=p and user_id=a;
  raise exception 'Invalid reaction accepted';
 exception when check_violation then null; end;
 delete from public.post_reactions where post_id=p and user_id=a;
 reset role;
 set local role anon;
 perform count(*) from public.post_reactions;
 begin
  insert into public.post_reactions(post_id,user_id,kind) values(p,a,'insightful');
  raise exception 'Anonymous write accepted';
 exception when insufficient_privilege then null; end;
 reset role;
end $test$;
rollback;
select 'PASS: reaction upsert, owner checks, kind constraint, anonymous reads, anonymous write rejection; changes rolled back' as result;
