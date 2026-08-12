-- Roles + global feature flags (applied on production via app_roles_and_features)

ALTER TABLE public.app_profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

ALTER TABLE public.app_profiles
  DROP CONSTRAINT IF EXISTS app_profiles_role_check;

ALTER TABLE public.app_profiles
  ADD CONSTRAINT app_profiles_role_check
  CHECK (role IN ('admin', 'member'));

CREATE TABLE IF NOT EXISTS public.app_features (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read features" ON public.app_features;
CREATE POLICY "Authenticated can read features"
  ON public.app_features
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.app_features (key, enabled) VALUES
  ('dashboard', TRUE),
  ('payment-flow', TRUE),
  ('payment-token', TRUE),
  ('payment-options', TRUE),
  ('payment-option-details', TRUE),
  ('do-payment', TRUE),
  ('payment-action', TRUE),
  ('transaction-status-inquiry', TRUE),
  ('payment-inquiry', TRUE),
  ('payment-pos', TRUE),
  ('analysis', TRUE),
  ('payout-create', TRUE),
  ('payout-inquiry', TRUE),
  ('pos-standalone', TRUE),
  ('inbox', TRUE),
  ('registration', TRUE),
  ('merchant-vault', TRUE)
ON CONFLICT (key) DO NOTHING;
