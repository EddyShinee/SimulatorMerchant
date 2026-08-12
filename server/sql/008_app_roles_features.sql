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
  admin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  member_enabled BOOLEAN NOT NULL DEFAULT TRUE,
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

INSERT INTO public.app_features (key, enabled, admin_enabled, member_enabled) VALUES
  ('dashboard', TRUE, TRUE, TRUE),
  ('payment-flow', TRUE, TRUE, TRUE),
  ('payment-token', TRUE, TRUE, TRUE),
  ('payment-options', TRUE, TRUE, TRUE),
  ('payment-option-details', TRUE, TRUE, TRUE),
  ('do-payment', TRUE, TRUE, TRUE),
  ('payment-action', TRUE, TRUE, TRUE),
  ('transaction-status-inquiry', TRUE, TRUE, TRUE),
  ('payment-inquiry', TRUE, TRUE, TRUE),
  ('payment-pos', TRUE, TRUE, TRUE),
  ('analysis', TRUE, TRUE, TRUE),
  ('payout-create', TRUE, TRUE, TRUE),
  ('payout-inquiry', TRUE, TRUE, TRUE),
  ('pos-standalone', TRUE, TRUE, TRUE),
  ('inbox', TRUE, TRUE, TRUE),
  ('registration', TRUE, TRUE, TRUE),
  ('merchant-vault', TRUE, TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;
