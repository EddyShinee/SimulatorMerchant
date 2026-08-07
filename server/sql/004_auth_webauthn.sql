-- Auth passkeys (Touch ID login / register)
CREATE TABLE IF NOT EXISTS public.auth_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_webauthn_email
  ON public.auth_webauthn_credentials (lower(email));

CREATE INDEX IF NOT EXISTS idx_auth_webauthn_user_id
  ON public.auth_webauthn_credentials (user_id);

ALTER TABLE public.auth_webauthn_credentials ENABLE ROW LEVEL SECURITY;
