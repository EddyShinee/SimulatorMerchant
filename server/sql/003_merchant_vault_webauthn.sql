-- Merchant vault WebAuthn / Touch ID credentials
CREATE TABLE IF NOT EXISTS public.merchant_vault_webauthn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NULL,
  device_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_vault_webauthn_user_id
  ON public.merchant_vault_webauthn (user_id);

ALTER TABLE public.merchant_vault_webauthn ENABLE ROW LEVEL SECURITY;
