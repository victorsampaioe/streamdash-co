-- Config columns on servers
ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS dns_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dns_interval_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS last_dns_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS dns_health_score integer;

-- Snapshots
CREATE TABLE public.dns_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  health_score integer,
  resolvers jsonb NOT NULL DEFAULT '[]'::jsonb,
  consistent boolean,
  resolved_ok integer NOT NULL DEFAULT 0,
  resolver_count integer NOT NULL DEFAULT 0,
  avg_response_ms integer,
  min_response_ms integer,
  max_response_ms integer,
  propagation_pct integer,
  propagation jsonb NOT NULL DEFAULT '[]'::jsonb,
  records jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_ip text,
  ipv4 text[],
  ipv6 text[],
  nameservers text[],
  ttl_seconds integer,
  dnssec boolean,
  cloudflare_proxy boolean,
  asn text,
  org text,
  country text,
  city text,
  datacenter text,
  domain_expires_at timestamptz,
  registrar text,
  status text NOT NULL DEFAULT 'ok',
  diagnosis text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_snapshots_server_time ON public.dns_snapshots(server_id, checked_at DESC);

GRANT SELECT ON public.dns_snapshots TO authenticated;
GRANT ALL ON public.dns_snapshots TO service_role;
ALTER TABLE public.dns_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_snapshots_owner_select" ON public.dns_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- IP history
CREATE TABLE public.dns_ip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  old_ip text,
  new_ip text,
  old_asn text,
  new_asn text,
  record_type text NOT NULL DEFAULT 'A',
  seconds_since_previous integer,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_ip_history_server_time ON public.dns_ip_history(server_id, changed_at DESC);

GRANT SELECT ON public.dns_ip_history TO authenticated;
GRANT ALL ON public.dns_ip_history TO service_role;
ALTER TABLE public.dns_ip_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_ip_history_owner_select" ON public.dns_ip_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- Alerts
CREATE TABLE public.dns_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  detail text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dns_alerts_server_time ON public.dns_alerts(server_id, created_at DESC);

GRANT SELECT, UPDATE ON public.dns_alerts TO authenticated;
GRANT ALL ON public.dns_alerts TO service_role;
ALTER TABLE public.dns_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dns_alerts_owner_select" ON public.dns_alerts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "dns_alerts_owner_ack" ON public.dns_alerts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));