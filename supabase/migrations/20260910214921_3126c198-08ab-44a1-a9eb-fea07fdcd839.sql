CREATE TABLE public.api_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  description text,
  monthly_price_cents integer CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
  monthly_request_limit bigint NOT NULL CHECK (monthly_request_limit > 0),
  per_minute_limit integer NOT NULL CHECK (per_minute_limit > 0),
  burst_limit integer NOT NULL CHECK (burst_limit > 0),
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3660),
  history_days integer NOT NULL DEFAULT 30 CHECK (history_days BETWEEN 1 AND 3660),
  max_keys integer NOT NULL DEFAULT 3 CHECK (max_keys BETWEEN 1 AND 1000),
  max_webhooks integer NOT NULL DEFAULT 3 CHECK (max_webhooks BETWEEN 0 AND 1000),
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_plans TO authenticated;
GRANT ALL ON public.api_plans TO service_role;
ALTER TABLE public.api_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_plans_read_available ON public.api_plans FOR SELECT TO authenticated USING (is_public OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY api_plans_admin_manage ON public.api_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.api_plans(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','trial','active','past_due','suspended','cancelled','expired')),
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('live','test')),
  starts_at timestamptz,
  expires_at timestamptz,
  monthly_limit_override bigint CHECK (monthly_limit_override IS NULL OR monthly_limit_override > 0),
  per_minute_limit_override integer CHECK (per_minute_limit_override IS NULL OR per_minute_limit_override > 0),
  burst_limit_override integer CHECK (burst_limit_override IS NULL OR burst_limit_override > 0),
  extra_requests bigint NOT NULL DEFAULT 0 CHECK (extra_requests >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, environment)
);
GRANT SELECT ON public.api_subscriptions TO authenticated;
GRANT ALL ON public.api_subscriptions TO service_role;
ALTER TABLE public.api_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_subscriptions_owner_read ON public.api_subscriptions FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_subscriptions_admin_manage ON public.api_subscriptions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.api_subscriptions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  environment text NOT NULL CHECK (environment IN ('live','test')),
  key_prefix text NOT NULL UNIQUE,
  key_hash text NOT NULL UNIQUE,
  last_four text NOT NULL CHECK (char_length(last_four) = 4),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  rotated_from_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  per_minute_limit_override integer CHECK (per_minute_limit_override IS NULL OR per_minute_limit_override > 0),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_owner_read ON public.api_keys FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_keys_owner_create ON public.api_keys FOR INSERT TO authenticated WITH CHECK (account_id = public.get_owner_account_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY api_keys_owner_update ON public.api_keys FOR UPDATE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid())) WITH CHECK (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_keys_owner_delete ON public.api_keys FOR DELETE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_key_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('servers:read','monitoring:read','performance:read','incidents:read','analytics:read','ai:read','webhooks:manage')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key_id, scope)
);
GRANT SELECT, INSERT, DELETE ON public.api_key_scopes TO authenticated;
GRANT ALL ON public.api_key_scopes TO service_role;
ALTER TABLE public.api_key_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_key_scopes_owner_read ON public.api_key_scopes FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_key_scopes_owner_create ON public.api_key_scopes FOR INSERT TO authenticated WITH CHECK (account_id = public.get_owner_account_id(auth.uid()) AND EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = key_id AND k.account_id = public.get_owner_account_id(auth.uid())));
CREATE POLICY api_key_scopes_owner_delete ON public.api_key_scopes FOR DELETE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_allowed_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cidr cidr NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(key_id, cidr)
);
GRANT SELECT, INSERT, DELETE ON public.api_allowed_ips TO authenticated;
GRANT ALL ON public.api_allowed_ips TO service_role;
ALTER TABLE public.api_allowed_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_allowed_ips_owner_read ON public.api_allowed_ips FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_allowed_ips_owner_create ON public.api_allowed_ips FOR INSERT TO authenticated WITH CHECK (account_id = public.get_owner_account_id(auth.uid()) AND EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = key_id AND k.account_id = public.get_owner_account_id(auth.uid())));
CREATE POLICY api_allowed_ips_owner_delete ON public.api_allowed_ips FOR DELETE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_allowed_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid REFERENCES public.api_keys(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin ~ '^https://[^/]+(:[0-9]+)?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, key_id, origin)
);
GRANT SELECT, INSERT, DELETE ON public.api_allowed_origins TO authenticated;
GRANT ALL ON public.api_allowed_origins TO service_role;
ALTER TABLE public.api_allowed_origins ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_allowed_origins_owner_read ON public.api_allowed_origins FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_allowed_origins_owner_create ON public.api_allowed_origins FOR INSERT TO authenticated WITH CHECK (account_id = public.get_owner_account_id(auth.uid()) AND (key_id IS NULL OR EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = key_id AND k.account_id = public.get_owner_account_id(auth.uid()))));
CREATE POLICY api_allowed_origins_owner_delete ON public.api_allowed_origins FOR DELETE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_resource_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('server','incident')),
  internal_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE CHECK (public_id ~ '^(srv|inc)_[A-Za-z0-9_-]{16,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, resource_type, internal_id)
);
GRANT SELECT ON public.api_resource_ids TO authenticated;
GRANT ALL ON public.api_resource_ids TO service_role;
ALTER TABLE public.api_resource_ids ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_resource_ids_owner_read ON public.api_resource_ids FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  account_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  environment text CHECK (environment IN ('live','test')),
  method text NOT NULL,
  endpoint text NOT NULL,
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  ip_hash text,
  user_agent text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_request_logs_owner_read ON public.api_request_logs FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_request_logs_admin_read ON public.api_request_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_date date NOT NULL,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  environment text NOT NULL CHECK (environment IN ('live','test')),
  endpoint text NOT NULL,
  request_count bigint NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  success_count bigint NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  error_count bigint NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  rate_limited_count bigint NOT NULL DEFAULT 0 CHECK (rate_limited_count >= 0),
  total_duration_ms bigint NOT NULL DEFAULT 0 CHECK (total_duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(usage_date, account_id, key_id, environment, endpoint)
);
GRANT SELECT ON public.api_usage_daily TO authenticated;
GRANT ALL ON public.api_usage_daily TO service_role;
ALTER TABLE public.api_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_usage_daily_owner_read ON public.api_usage_daily FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_usage_daily_admin_read ON public.api_usage_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.api_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  url text NOT NULL CHECK (url ~ '^https://'),
  event_types text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  secret_ciphertext text NOT NULL,
  secret_last_four text NOT NULL CHECK (char_length(secret_last_four) = 4),
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_delivery_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_webhooks TO authenticated;
GRANT ALL ON public.api_webhooks TO service_role;
ALTER TABLE public.api_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_webhooks_owner_read ON public.api_webhooks FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_webhooks_owner_create ON public.api_webhooks FOR INSERT TO authenticated WITH CHECK (account_id = public.get_owner_account_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY api_webhooks_owner_update ON public.api_webhooks FOR UPDATE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid())) WITH CHECK (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_webhooks_owner_delete ON public.api_webhooks FOR DELETE TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  resource_type text,
  resource_public_id text,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_webhook_events TO authenticated;
GRANT ALL ON public.api_webhook_events TO service_role;
ALTER TABLE public.api_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_webhook_events_owner_read ON public.api_webhook_events FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  webhook_id uuid NOT NULL REFERENCES public.api_webhooks(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.api_webhook_events(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','retrying','failed')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 10),
  response_status integer,
  response_excerpt text,
  error_code text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(webhook_id, event_id)
);
GRANT SELECT ON public.api_webhook_deliveries TO authenticated;
GRANT ALL ON public.api_webhook_deliveries TO service_role;
ALTER TABLE public.api_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_webhook_deliveries_owner_read ON public.api_webhook_deliveries FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));

CREATE TABLE public.api_usage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('usage_80','usage_100','abuse','delivery_failures')),
  period_key text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('pending','sent','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, alert_type, period_key)
);
GRANT SELECT ON public.api_usage_alerts TO authenticated;
GRANT ALL ON public.api_usage_alerts TO service_role;
ALTER TABLE public.api_usage_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_usage_alerts_owner_read ON public.api_usage_alerts FOR SELECT TO authenticated USING (account_id = public.get_owner_account_id(auth.uid()));
CREATE POLICY api_usage_alerts_admin_read ON public.api_usage_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX api_subscriptions_account_status_idx ON public.api_subscriptions(account_id, status);
CREATE INDEX api_keys_account_status_idx ON public.api_keys(account_id, status, expires_at);
CREATE INDEX api_keys_subscription_idx ON public.api_keys(subscription_id);
CREATE INDEX api_key_scopes_key_idx ON public.api_key_scopes(key_id);
CREATE INDEX api_allowed_ips_key_idx ON public.api_allowed_ips(key_id);
CREATE INDEX api_allowed_origins_account_idx ON public.api_allowed_origins(account_id);
CREATE INDEX api_resource_ids_lookup_idx ON public.api_resource_ids(account_id, resource_type, internal_id);
CREATE INDEX api_request_logs_account_time_idx ON public.api_request_logs(account_id, created_at DESC);
CREATE INDEX api_request_logs_key_time_idx ON public.api_request_logs(key_id, created_at DESC);
CREATE INDEX api_request_logs_endpoint_time_idx ON public.api_request_logs(endpoint, created_at DESC);
CREATE INDEX api_usage_daily_account_date_idx ON public.api_usage_daily(account_id, usage_date DESC);
CREATE INDEX api_webhooks_account_status_idx ON public.api_webhooks(account_id, status);
CREATE INDEX api_webhook_events_account_time_idx ON public.api_webhook_events(account_id, created_at DESC);
CREATE INDEX api_webhook_deliveries_due_idx ON public.api_webhook_deliveries(status, next_attempt_at) WHERE status IN ('pending','retrying');
CREATE INDEX api_webhook_deliveries_webhook_time_idx ON public.api_webhook_deliveries(webhook_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.api_validate_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.starts_at IS NOT NULL AND NEW.expires_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'expires_at must be after starts_at';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_validate_expiry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_validate_expiry() TO service_role;
CREATE TRIGGER api_subscriptions_validate_expiry BEFORE INSERT OR UPDATE ON public.api_subscriptions FOR EACH ROW EXECUTE FUNCTION public.api_validate_expiry();

CREATE OR REPLACE FUNCTION public.api_validate_key_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at <= NEW.created_at THEN
    RAISE EXCEPTION 'key expiry must be after creation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.api_validate_key_expiry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_validate_key_expiry() TO service_role;
CREATE TRIGGER api_keys_validate_expiry BEFORE INSERT OR UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.api_validate_key_expiry();

CREATE TRIGGER api_plans_updated_at BEFORE UPDATE ON public.api_plans FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER api_subscriptions_updated_at BEFORE UPDATE ON public.api_subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER api_keys_updated_at BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER api_usage_daily_updated_at BEFORE UPDATE ON public.api_usage_daily FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER api_webhooks_updated_at BEFORE UPDATE ON public.api_webhooks FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER api_webhook_deliveries_updated_at BEFORE UPDATE ON public.api_webhook_deliveries FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.api_plans (code, name, description, monthly_price_cents, monthly_request_limit, per_minute_limit, burst_limit, retention_days, history_days, max_keys, max_webhooks, features, is_active, is_public)
VALUES
('api_pro', 'API PRO', 'Para integrações profissionais e automações.', NULL, 50000, 60, 20, 30, 30, 3, 3, '{"operational":true,"analytics":true,"ai_context":false}'::jsonb, false, false),
('api_business', 'API BUSINESS', 'Para painéis, aplicativos e operações em crescimento.', NULL, 250000, 180, 60, 90, 90, 10, 10, '{"operational":true,"analytics":true,"ai_context":true}'::jsonb, false, false),
('api_ai', 'API AI', 'Para assistentes e processamento intensivo de contexto.', NULL, 1000000, 500, 150, 365, 365, 25, 25, '{"operational":true,"analytics":true,"ai_context":true,"priority":true}'::jsonb, false, false),
('enterprise', 'ENTERPRISE', 'Limites e recursos personalizados.', NULL, 5000000, 1000, 300, 730, 730, 100, 100, '{"operational":true,"analytics":true,"ai_context":true,"priority":true,"custom":true}'::jsonb, false, false);