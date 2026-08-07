import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

let client = null

/** Server-side Supabase client (Auth + optional table access). */
export function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY

  if (!url || !key) return null

  if (!client) {
    client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      // Node 18 has no global WebSocket; realtime needs an explicit transport.
      realtime: { transport: ws },
    })
  }
  return client
}

export function isSupabaseConfigured() {
  return Boolean(getSupabase())
}
