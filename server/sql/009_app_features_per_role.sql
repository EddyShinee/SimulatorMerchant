-- Per-role feature flags (admin vs member)

ALTER TABLE public.app_features
  ADD COLUMN IF NOT EXISTS admin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS member_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.app_features
SET
  admin_enabled = COALESCE(enabled, TRUE),
  member_enabled = COALESCE(enabled, TRUE);

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
