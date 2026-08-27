-- 1. Rate limiting
CREATE TABLE public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, key_hash, window_start)
);
GRANT ALL ON public.api_rate_limits TO service_role;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_api_rate_limits_window ON public.api_rate_limits (window_start);

-- 2. Android devices
CREATE TABLE public.android_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  reseller_id uuid,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  client_key text,
  revoked boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.android_devices TO service_role;
GRANT SELECT ON public.android_devices TO authenticated;
ALTER TABLE public.android_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "android_devices_admin_or_owner_read" ON public.android_devices
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR reseller_id = auth.uid());
CREATE INDEX idx_android_devices_reseller ON public.android_devices (reseller_id);

-- 3. Android sessions
CREATE TABLE public.android_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid uuid REFERENCES public.android_devices(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text NOT NULL UNIQUE,
  reseller_id uuid,
  server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  client_key text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['play']::text[],
  expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.android_sessions TO service_role;
ALTER TABLE public.android_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_android_sessions_expires ON public.android_sessions (expires_at);

-- 4. Resolution grants (candidates offered per login attempt)
CREATE TABLE public.android_resolution_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_hash text NOT NULL UNIQUE,
  client_key text NOT NULL,
  candidate_server_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.android_resolution_grants TO service_role;
ALTER TABLE public.android_resolution_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_android_grants_expires ON public.android_resolution_grants (expires_at);

-- 5. Replay protection
CREATE TABLE public.api_request_nonces (
  nonce_hash text PRIMARY KEY,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.api_request_nonces TO service_role;
ALTER TABLE public.api_request_nonces ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_api_request_nonces_expires ON public.api_request_nonces (expires_at);

-- 6. App releases
CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code integer NOT NULL,
  version_name text NOT NULL,
  minimum_version_code integer NOT NULL DEFAULT 1,
  recommended_version_code integer,
  mandatory boolean NOT NULL DEFAULT false,
  message text,
  update_url text NOT NULL,
  sha256 text,
  file_size bigint,
  signing_fingerprint text,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_code)
);
GRANT ALL ON public.app_releases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_releases_admin_all" ON public.app_releases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.app_releases_https_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.update_url IS NOT NULL AND NEW.update_url !~* '^https://' THEN
    RAISE EXCEPTION 'update_url deve usar HTTPS';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_app_releases_https
BEFORE INSERT OR UPDATE ON public.app_releases
FOR EACH ROW EXECUTE FUNCTION public.app_releases_https_only();

-- 7. TMDB cache
CREATE TABLE public.tmdb_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tmdb_cache TO service_role;
ALTER TABLE public.tmdb_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tmdb_cache_expires ON public.tmdb_cache (expires_at);

-- 8. Security audit log
CREATE TABLE public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  target text,
  severity text NOT NULL DEFAULT 'info',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.security_audit_log TO service_role;
GRANT SELECT ON public.security_audit_log TO authenticated;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "security_audit_log_admin_read" ON public.security_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_security_audit_created ON public.security_audit_log (created_at DESC);