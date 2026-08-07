-- Merchant credentials vault (Simulator Merchant)
-- Project: https://xakmpzrpmawzojplvunm.supabase.co
--
-- Server CRUD uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Vault unlock is enforced in Express via X-Vault-Token.

CREATE TABLE IF NOT EXISTS public.merchant_vault (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_vault ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.merchant_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  mid TEXT NOT NULL,
  secret_key TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT 'uat'
    CHECK (environment IN ('uat', 'production')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_credentials_user_id
  ON public.merchant_credentials (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_credentials_user_mid_env_uidx
  ON public.merchant_credentials (user_id, mid, environment);

ALTER TABLE public.merchant_credentials ENABLE ROW LEVEL SECURITY;

-- Use (select auth.uid()) so Postgres evaluates once per statement (RLS initplan).
CREATE POLICY merchant_vault_select_own
  ON public.merchant_vault FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY merchant_vault_insert_own
  ON public.merchant_vault FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY merchant_vault_update_own
  ON public.merchant_vault FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY merchant_credentials_select_own
  ON public.merchant_credentials FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY merchant_credentials_insert_own
  ON public.merchant_credentials FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY merchant_credentials_update_own
  ON public.merchant_credentials FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY merchant_credentials_delete_own
  ON public.merchant_credentials FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);
