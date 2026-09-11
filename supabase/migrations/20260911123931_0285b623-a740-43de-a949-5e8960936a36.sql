ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_norm_key
  ON public.profiles (lower(btrim(username)))
  WHERE username IS NOT NULL;

ALTER TABLE public.signup_attempts
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS identity_hash text,
  ADD COLUMN IF NOT EXISTS risk_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS technical_detail text;

CREATE INDEX IF NOT EXISTS signup_attempts_identity_idx
  ON public.signup_attempts (identity_hash, created_at DESC)
  WHERE identity_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS signup_attempts_risk_ip_idx
  ON public.signup_attempts (ip_hash, created_at DESC)
  WHERE risk_score > 0;

CREATE OR REPLACE FUNCTION public.admin_signup_security_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT jsonb_build_object(
    'created_24h', (SELECT count(*) FROM public.signup_attempts WHERE status = 'created' AND created_at > now() - interval '24 hours'),
    'rejected_24h', (SELECT count(*) FROM public.signup_attempts WHERE status <> 'created' AND created_at > now() - interval '24 hours'),
    'by_category_24h', (
      SELECT coalesce(jsonb_object_agg(category, c), '{}'::jsonb) FROM (
        SELECT coalesce(category,
          CASE
            WHEN status = 'created' THEN 'created'
            WHEN reason IN ('duplicate_email', 'duplicate_phone', 'duplicate_username') THEN 'existing_account'
            WHEN reason LIKE 'invalid_%' THEN 'invalid_data'
            WHEN reason IN ('rate_limit_exceeded', 'temporarily_blocked') THEN 'rate_limited'
            WHEN reason = 'turnstile_rejected' THEN 'turnstile'
            WHEN reason IN ('honeypot_triggered', 'duplicate_request') THEN 'bot'
            ELSE 'internal_failure'
          END
        ) category, count(*) c
        FROM public.signup_attempts
        WHERE created_at > now() - interval '24 hours'
        GROUP BY 1
      ) t
    ),
    'by_reason_24h', (
      SELECT coalesce(jsonb_object_agg(reason, c), '{}'::jsonb) FROM (
        SELECT coalesce(reason, 'unknown') reason, count(*) c
        FROM public.signup_attempts
        WHERE status <> 'created' AND created_at > now() - interval '24 hours'
        GROUP BY 1
      ) t
    ),
    'active_blocks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'key', key, 'reason', reason, 'attempts', attempts,
        'blocked_until', blocked_until, 'created_at', created_at
      ) ORDER BY blocked_until DESC), '[]'::jsonb)
      FROM public.signup_blocks WHERE blocked_until > now()
    ),
    'recent', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'created_at', created_at, 'status', status, 'reason', reason,
        'category', coalesce(category,
          CASE
            WHEN status = 'created' THEN 'created'
            WHEN reason IN ('duplicate_email', 'duplicate_phone', 'duplicate_username') THEN 'existing_account'
            WHEN reason LIKE 'invalid_%' THEN 'invalid_data'
            WHEN reason IN ('rate_limit_exceeded', 'temporarily_blocked') THEN 'rate_limited'
            WHEN reason = 'turnstile_rejected' THEN 'turnstile'
            WHEN reason IN ('honeypot_triggered', 'duplicate_request') THEN 'bot'
            ELSE 'internal_failure'
          END
        ),
        'risk_score', risk_score, 'technical_detail', technical_detail,
        'ip_masked', ip_masked, 'email', email_norm, 'phone', phone_norm,
        'full_name', full_name, 'user_agent', user_agent
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.signup_attempts ORDER BY created_at DESC LIMIT 100) r
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_signup_security_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unblock_signup(_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  DELETE FROM public.signup_blocks WHERE key = _key;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unblock_signup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unblock_signup(text) TO authenticated;