-- Last login, last updated, and active/blocked status on member profiles

ALTER TABLE public.app_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.app_profiles
  DROP CONSTRAINT IF EXISTS app_profiles_status_check;

ALTER TABLE public.app_profiles
  ADD CONSTRAINT app_profiles_status_check
  CHECK (status IN ('active', 'blocked'));
