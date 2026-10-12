// SUPABASE_* is reserved on hosted Edge Functions. Preserve exported Vercel
// values under VELO_IMPORTED_SUPABASE_* rather than silently replacing them.
export function runtimeEnv(name) {
  if (name.startsWith('SUPABASE_')) {
    const imported = Deno.env.get(`VELO_IMPORTED_${name}`);
    if (imported !== undefined) return imported;
  }
  return Deno.env.get(name);
}
