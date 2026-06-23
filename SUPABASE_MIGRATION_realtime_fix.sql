-- ════════════════════════════════════════════════════════════════════════
-- VELO · Supabase migration — enable realtime on all social tables
-- Run once:  Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe & idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Add every table that the social feed subscribes to into the
--       supabase_realtime publication (safe even if already added) ─────────
do $$
declare
  t text;
  tables text[] := array['posts','likes','comments','reposts','profiles','follows','notifications','transactions'];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'Added % to supabase_realtime publication', t;
    else
      raise notice '% already in supabase_realtime publication', t;
    end if;
  end loop;
end $$;

-- ── 2. Ensure REPLICA IDENTITY is FULL on the tables where we need the
--       OLD row on DELETE events (likes, reposts, comments, follows).
--       Without FULL, payload.old only contains the PK columns, so
--       like.user_id / like.post_id are null in the DELETE handler. ─────────
alter table public.likes     replica identity full;
alter table public.reposts   replica identity full;
alter table public.comments  replica identity full;
alter table public.follows   replica identity full;
alter table public.posts     replica identity full;

-- ── 3. RLS: public.posts must be readable by everyone (anon role) so the
--       social feed works without login ─────────────────────────────────────
alter table public.posts enable row level security;
drop policy if exists "velo_posts_select_public" on public.posts;
create policy "velo_posts_select_public"
  on public.posts for select
  using (true);

-- INSERT — only the owning user may create posts
drop policy if exists "velo_posts_insert" on public.posts;
create policy "velo_posts_insert"
  on public.posts for insert
  with check (author_id = auth.uid());

-- DELETE — only the author may delete their own post
drop policy if exists "velo_posts_delete" on public.posts;
create policy "velo_posts_delete"
  on public.posts for delete
  using (author_id = auth.uid());

-- ── 4. RLS: likes (public read, own write) ────────────────────────────────
alter table public.likes enable row level security;
drop policy if exists "velo_likes_select" on public.likes;
create policy "velo_likes_select"
  on public.likes for select using (true);

drop policy if exists "velo_likes_insert" on public.likes;
create policy "velo_likes_insert"
  on public.likes for insert
  with check (user_id = auth.uid());

drop policy if exists "velo_likes_delete" on public.likes;
create policy "velo_likes_delete"
  on public.likes for delete
  using (user_id = auth.uid());

-- ── 5. RLS: reposts (public read, own write) ──────────────────────────────
alter table public.reposts enable row level security;
drop policy if exists "velo_reposts_select" on public.reposts;
create policy "velo_reposts_select"
  on public.reposts for select using (true);

drop policy if exists "velo_reposts_insert" on public.reposts;
create policy "velo_reposts_insert"
  on public.reposts for insert
  with check (user_id = auth.uid());

drop policy if exists "velo_reposts_delete" on public.reposts;
create policy "velo_reposts_delete"
  on public.reposts for delete
  using (user_id = auth.uid());

-- ── 6. RLS: comments (public read, own write/delete) ─────────────────────
alter table public.comments enable row level security;
drop policy if exists "velo_comments_select" on public.comments;
create policy "velo_comments_select"
  on public.comments for select using (true);

drop policy if exists "velo_comments_insert" on public.comments;
create policy "velo_comments_insert"
  on public.comments for insert
  with check (author_id = auth.uid());

drop policy if exists "velo_comments_delete" on public.comments;
create policy "velo_comments_delete"
  on public.comments for delete
  using (author_id = auth.uid());

-- ── 7. RLS: profiles (public read) ───────────────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "velo_profiles_select" on public.profiles;
create policy "velo_profiles_select"
  on public.profiles for select using (true);

-- ── 8. Force PostgREST schema reload ─────────────────────────────────────
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- Done.  All social tables are now in the realtime publication with FULL
-- replica identity, and RLS allows public reads so every browser session
-- (authenticated or not) sees live updates.
-- ════════════════════════════════════════════════════════════════════════
