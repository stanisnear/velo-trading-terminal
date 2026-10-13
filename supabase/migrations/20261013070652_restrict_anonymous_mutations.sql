-- Preserve signed-in app calls and public profile reads. Block anonymous writes.
-- SQL NULL does not satisfy <>; the old balance check failed open without a UID.
create or replace function public.adjust_balance(uid uuid, delta numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or uid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = 'P0001';
  end if;
  update public.profiles set balance = greatest(0, coalesce(balance,0)+delta) where id=uid;
end;
$$;

do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname in (
      'adjust_balance','admin_set_verification','create_notification_for_user',
      'record_transaction_for_user','increment_follow_counts','decrement_follow_counts',
      'delete_comment_as_post_owner','delete_own_auth_user','toggle_comment_like','touch_activity'
    )
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated, service_role', f.signature);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p
    where p.pronamespace='public'::regnamespace and p.proname in ('handle_new_user','rls_auto_enable')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
  end loop;
end;
$$;
