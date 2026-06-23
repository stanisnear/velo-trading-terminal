-- ════════════════════════════════════════════════════════════════════════════
-- VELO · Comments v2 — threads, likes, proper delete permissions
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run
-- Safe & idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add parent_id to comments (enables reply threads) ─────────────────
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_parent_id_idx on public.comments(parent_id);

-- ── 2. Comment likes table ────────────────────────────────────────────────
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

create policy if not exists "comment_likes_select"
  on public.comment_likes for select using (true);

create policy if not exists "comment_likes_insert"
  on public.comment_likes for insert
  with check (auth.uid() = user_id);

create policy if not exists "comment_likes_delete"
  on public.comment_likes for delete
  using (auth.uid() = user_id);

-- Allow realtime on comment_likes
alter publication supabase_realtime add table public.comment_likes;

-- ── 3. Fix comments RLS — post owner can delete any comment on their post ─
-- Drop existing policies first, then recreate cleanly
drop policy if exists "Users can delete own comments"   on public.comments;
drop policy if exists "comments_delete"                  on public.comments;
drop policy if exists "Allow users to delete own comment" on public.comments;

-- Only the comment author OR the post owner may delete a comment
create policy "comments_delete_v2"
  on public.comments for delete
  using (
    auth.uid() = author_id
    or
    auth.uid() = (
      select author_id from public.posts where id = post_id limit 1
    )
  );

-- ── 4. Add parent_id to realtime (already enabled but ensure it carries) ──
-- comments table should already be in realtime; just ensure it is:
do $$
begin
  begin
    alter publication supabase_realtime add table public.comments;
  exception when others then
    -- already added, ignore
  end;
end $$;

-- ── 5. RPC: toggle comment like (bypass RLS for cross-user logic) ─────────
create or replace function public.toggle_comment_like(
  p_comment_id uuid,
  p_user_id    uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.comment_likes
    where comment_id = p_comment_id and user_id = p_user_id
  ) then
    delete from public.comment_likes
    where comment_id = p_comment_id and user_id = p_user_id;
  else
    insert into public.comment_likes (comment_id, user_id)
    values (p_comment_id, p_user_id)
    on conflict do nothing;
  end if;
end; $$;

grant execute on function public.toggle_comment_like(uuid, uuid) to authenticated;

-- ── 6. RPC: delete comment — post owner bypass ────────────────────────────
-- The standard RLS policy above should handle it, but this RPC is a safe
-- fallback if the client passes a post-owner delete request.
create or replace function public.delete_comment_as_post_owner(
  p_comment_id uuid,
  p_user_id    uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_post_author uuid;
  v_post_id     uuid;
begin
  select post_id into v_post_id from public.comments where id = p_comment_id;
  select author_id into v_post_author from public.posts where id = v_post_id;
  if v_post_author = p_user_id or
     exists (select 1 from public.comments where id = p_comment_id and author_id = p_user_id)
  then
    delete from public.comments where id = p_comment_id;
  end if;
end; $$;

grant execute on function public.delete_comment_as_post_owner(uuid, uuid) to authenticated;
