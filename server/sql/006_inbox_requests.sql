-- Request Inbox: durable capture of webhooks / payment callbacks
-- Public hooks write via SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Authenticated list/clear uses Express + service role, scoped by user_id.

CREATE TABLE IF NOT EXISTS public.inbox_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query JSONB NULL,
  headers JSONB NULL,
  body JSONB NULL,
  ip TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_requests_user_received
  ON public.inbox_requests (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_requests_received
  ON public.inbox_requests (received_at DESC);

ALTER TABLE public.inbox_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbox_requests_select_own
  ON public.inbox_requests FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY inbox_requests_delete_own
  ON public.inbox_requests FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
