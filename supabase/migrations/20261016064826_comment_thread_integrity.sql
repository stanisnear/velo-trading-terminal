-- Only comment relationships/indexes; no account, email, session or policy cutover.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
CREATE INDEX IF NOT EXISTS comments_post_created_id_idx ON public.comments (post_id, created_at, id);
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);
ALTER TABLE public.comments ADD CONSTRAINT comments_id_post_unique UNIQUE (id, post_id);
ALTER TABLE public.comments ADD CONSTRAINT comments_no_self_parent CHECK (parent_id IS DISTINCT FROM id);
ALTER TABLE public.comments ADD CONSTRAINT comments_parent_same_post_fkey
  FOREIGN KEY (parent_id, post_id) REFERENCES public.comments (id, post_id) ON DELETE CASCADE;
CREATE OR REPLACE FUNCTION public.keep_comment_thread_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.post_id IS DISTINCT FROM OLD.post_id
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'Comment identity and thread cannot be changed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER comments_keep_thread_identity BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.keep_comment_thread_identity();
