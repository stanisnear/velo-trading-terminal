-- PnL snapshots have their own public image bucket. Only the owner may write
-- inside their authenticated UUID folder; uploads are immutable unique names.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('post-images','post-images',true,5242880,array['image/png'])
on conflict (id) do nothing;
create policy "Public PnL images" on storage.objects for select to public
using (bucket_id = 'post-images');
create policy "Upload own PnL images" on storage.objects for insert to authenticated
with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own PnL images" on storage.objects for delete to authenticated
using (bucket_id = 'post-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
