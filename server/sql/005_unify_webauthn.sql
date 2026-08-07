-- One-time: migrate legacy vault passkeys → auth_webauthn_credentials, then drop vault table.
-- Production already applied via Supabase migration `unify_webauthn_drop_vault_table`.

DO $$
BEGIN
  IF to_regclass('public.merchant_vault_webauthn') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.auth_webauthn_credentials
    (user_id, email, credential_id, public_key, counter, transports)
  SELECT
    v.user_id,
    lower(u.email::text),
    v.credential_id,
    v.public_key,
    COALESCE(v.counter, 0),
    v.transports
  FROM public.merchant_vault_webauthn v
  JOIN auth.users u ON u.id = v.user_id
  WHERE u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.auth_webauthn_credentials a
      WHERE a.credential_id = v.credential_id
    );

  DROP TABLE public.merchant_vault_webauthn;
END $$;
