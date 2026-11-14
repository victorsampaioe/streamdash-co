-- Integrations are off until an administrator connects external accounts.
CREATE TABLE IF NOT EXISTS public.observability_integrations (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
  posthog_project_key text NOT NULL DEFAULT '',
  posthog_host text NOT NULL DEFAULT 'https://us.i.posthog.com'
    CHECK (posthog_host IN ('https://us.i.posthog.com','https://eu.i.posthog.com')),
  posthog_enabled boolean NOT NULL DEFAULT false,
  grafana_endpoint text NOT NULL DEFAULT '',
  grafana_stack_id text NOT NULL DEFAULT '',
  grafana_enabled boolean NOT NULL DEFAULT false,
  grafana_last_export_at timestamptz,
  grafana_last_export_status text NOT NULL DEFAULT 'not_configured',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.observability_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.observability_integrations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.observability_integrations TO service_role;
INSERT INTO public.observability_integrations(id) VALUES (1) ON CONFLICT DO NOTHING;

-- No secret ever goes to the browser or to GitHub. Vault stores an encrypted
-- Grafana Cloud MetricsPublisher / OTLP-write-only access-policy token.
CREATE OR REPLACE FUNCTION public.streammonitor_store_grafana_token_service(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE secret_id uuid;
BEGIN
  IF length(p_token)<16 OR length(p_token)>2048 OR p_token~'[[:space:]]'
  THEN RAISE EXCEPTION 'invalid_grafana_token'; END IF;
  SELECT id INTO secret_id FROM vault.secrets
  WHERE name='streammonitor_grafana_otlp_write_token'
  ORDER BY created_at DESC LIMIT 1;
  IF secret_id IS NULL THEN
    PERFORM vault.create_secret(p_token,'streammonitor_grafana_otlp_write_token',
      'Grafana Cloud OTLP write-only token - Stream Monitor service only',NULL);
  ELSE
    PERFORM vault.update_secret(secret_id,p_token,
      'streammonitor_grafana_otlp_write_token',
      'Grafana Cloud OTLP write-only token - Stream Monitor service only',NULL);
  END IF;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.streammonitor_grafana_token_service()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name='streammonitor_grafana_otlp_write_token'
  ORDER BY created_at DESC LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.streammonitor_store_grafana_token_service(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.streammonitor_grafana_token_service() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.streammonitor_store_grafana_token_service(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.streammonitor_grafana_token_service() TO service_role;
