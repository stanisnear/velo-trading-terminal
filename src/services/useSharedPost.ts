import { useEffect, useRef, useState } from 'react';
import type { Post } from '../utils/types';
import { fetchPostById } from './supabaseStore';

/** A failed request is not evidence that a shared post was deleted. */
export function useSharedPost(postId: string, commentId: string | null, onLoaded: (post: Post) => void) {
  const [attempt, setAttempt] = useState(0);
  const key = `${postId}/${commentId || ''}/${attempt}`;
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'missing' | 'error'; post: Post | null }>({ key, status: 'loading', post: null });
  const callback = useRef(onLoaded);
  callback.current = onLoaded;
  useEffect(() => {
    let active = true;
    setState({ key, status: 'loading', post: null });
    fetchPostById(postId).then(post => {
      if (!active) return;
      if (post) callback.current(post);
      setState({ key, status: post ? 'ready' : 'missing', post });
    }).catch(() => { if (active) setState({ key, status: 'error', post: null }); });
    return () => { active = false; };
  }, [key, postId]);
  return { ...(state.key === key ? state : { status: 'loading' as const, post: null }), retry: () => setAttempt(n => n + 1) };
}
