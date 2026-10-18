create table public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('insightful', 'celebrate', 'bullish')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_reactions_user_idx on public.post_reactions(user_id);
alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from anon, authenticated;
grant select on public.post_reactions to anon, authenticated;
grant insert, update, delete on public.post_reactions to authenticated;
create policy reactions_read on public.post_reactions for select to anon, authenticated using (true);
create policy reactions_insert on public.post_reactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reactions_update on public.post_reactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reactions_delete on public.post_reactions for delete to authenticated using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.post_reactions;
