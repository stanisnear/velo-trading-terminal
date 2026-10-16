BEGIN;
DO $test$
DECLARE a uuid; b uuid; p uuid := gen_random_uuid(); q uuid := gen_random_uuid();
r uuid := gen_random_uuid(); c uuid := gen_random_uuid(); g uuid := gen_random_uuid(); n integer;
BEGIN
  SELECT id INTO a FROM public.profiles ORDER BY id LIMIT 1;
  SELECT id INTO b FROM public.profiles WHERE id<>a ORDER BY id LIMIT 1;
  INSERT INTO public.posts(id,author_id,content) VALUES (p,a,'Rollback-only thread fixture'),(q,b,'Rollback-only second post');
  INSERT INTO public.comments(id,post_id,author_id,content,parent_id) VALUES
    (r,p,a,'root',null),(c,p,b,'child',r),(g,p,a,'grandchild',c);
  BEGIN
    INSERT INTO public.comments(post_id,author_id,content,parent_id) VALUES(q,b,'invalid parent',r);
    RAISE EXCEPTION 'FAIL: cross-post parent accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE public.comments SET parent_id=g WHERE id=r;
    RAISE EXCEPTION 'FAIL: reparenting accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.comments(id,post_id,author_id,content,parent_id) VALUES(c,p,b,'child',r) ON CONFLICT(id) DO NOTHING;
  DELETE FROM public.comments WHERE id=r;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'FAIL: another author deleted root'; END IF;
  BEGIN
    INSERT INTO public.comments(post_id,author_id,content) VALUES(p,a,'forged author');
    RAISE EXCEPTION 'FAIL: forged author accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.comments WHERE id=g AND post_id=p;
  IF n<>1 THEN RAISE EXCEPTION 'FAIL: anonymous nested reply read'; END IF;
  RESET ROLE;
  DELETE FROM public.comments WHERE id=r;
  IF EXISTS(SELECT 1 FROM public.comments WHERE id IN(r,c,g)) THEN RAISE EXCEPTION 'FAIL: recursive cascade'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: nested anonymous read, same-post FK, immutable thread, idempotent own insert, author RLS, recursive cascade; all fixture rows rolled back' AS verification;
