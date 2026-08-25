-- 1. Signup attempts audit log
CREATE TABLE public.signup_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  reason text,
  ip_hash text,
  ip_masked text,
  email_norm text,
  phone_norm text,
  full_name text,
  fingerprint text,
  user_agent text,
  user_id uuid
);
GRANT ALL ON public.signup_attempts TO service_role;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read signup attempts" ON public.signup_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX signup_attempts_created_idx ON public.signup_attempts (created_at DESC);
CREATE INDEX signup_attempts_ip_idx ON public.signup_attempts (ip_hash, created_at DESC);
CREATE UNIQUE INDEX signup_attempts_fingerprint_idx ON public.signup_attempts (fingerprint)
  WHERE fingerprint IS NOT NULL;

-- 2. Temporary blocks
CREATE TABLE public.signup_blocks (
  key text NOT NULL PRIMARY KEY,
  reason text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signup_blocks TO service_role;
ALTER TABLE public.signup_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read signup blocks" ON public.signup_blocks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER signup_blocks_updated_at BEFORE UPDATE ON public.signup_blocks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Normalized phone on profiles (unique)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_normalized text;

UPDATE public.profiles
SET phone_normalized = nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')
WHERE phone_normalized IS NULL;

-- keep only the oldest profile for pre-existing duplicated phones
WITH dups AS (
  SELECT id, row_number() OVER (PARTITION BY phone_normalized ORDER BY created_at) rn
  FROM public.profiles
  WHERE phone_normalized IS NOT NULL AND length(phone_normalized) >= 10
)
UPDATE public.profiles p SET phone_normalized = NULL
FROM dups d WHERE d.id = p.id AND d.rn > 1;

UPDATE public.profiles
SET phone_normalized = NULL
WHERE phone_normalized IS NOT NULL AND length(phone_normalized) < 10;

CREATE UNIQUE INDEX profiles_phone_normalized_key ON public.profiles (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- 4. Unique email (normalized)
CREATE UNIQUE INDEX profiles_email_norm_key ON public.profiles (lower(btrim(email)))
  WHERE email IS NOT NULL;

-- 5. Keep phone_normalized in sync
CREATE OR REPLACE FUNCTION public.profiles_normalize_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.phone_normalized := nullif(regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g'), '');
  IF NEW.phone_normalized IS NOT NULL AND length(NEW.phone_normalized) < 10 THEN
    NEW.phone_normalized := NULL;
  END IF;
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_normalize_phone_trg
  BEFORE INSERT OR UPDATE OF phone, email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_normalize_phone();

-- 6. Admin report
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
        'key', left(key, 12) || '…', 'reason', reason, 'attempts', attempts,
        'blocked_until', blocked_until, 'created_at', created_at
      ) ORDER BY blocked_until DESC), '[]'::jsonb)
      FROM public.signup_blocks WHERE blocked_until > now()
    ),
    'recent', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'created_at', created_at, 'status', status, 'reason', reason,
        'ip_masked', ip_masked, 'email', email_norm, 'phone', phone_norm
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.signup_attempts ORDER BY created_at DESC LIMIT 50) r
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_signup_security_report() TO authenticated;
