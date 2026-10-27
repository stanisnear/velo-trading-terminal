-- Images are public; only the authenticated owner may write within their folder.
drop policy if exists "Auth upload avatars" on storage.objects;
create policy "Own insert profile images" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Own update profile images" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A share retains a snapshot and the chain reference. Current values are read
-- from the engine/receipts; user-supplied snapshots never receive a verified badge.
alter table public.posts add column if not exists trade_snapshot jsonb;
alter table public.posts add constraint posts_trade_snapshot_object
check (trade_snapshot is null or (jsonb_typeof(trade_snapshot) = 'object' and octet_length(trade_snapshot::text) <= 8192));
