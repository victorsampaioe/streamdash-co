ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS kuma_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kuma_http_id integer,
  ADD COLUMN IF NOT EXISTS kuma_ping_id integer,
  ADD COLUMN IF NOT EXISTS kuma_dns_id integer,
  ADD COLUMN IF NOT EXISTS kuma_tcp_id integer,
  ADD COLUMN IF NOT EXISTS kuma_api_id integer,
  ADD COLUMN IF NOT EXISTS kuma_ssl_id integer,
  ADD COLUMN IF NOT EXISTS kuma_tcp_port integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS kuma_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS kuma_error text;

CREATE TABLE IF NOT EXISTS public.kuma_monitor_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  monitor_id integer,
  status text NOT NULL DEFAULT 'pending',
  active boolean NOT NULL DEFAULT true,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric,
  latency_ms integer,
  avg_latency_ms integer,
  last_check_at timestamptz,
  last_down_started_at timestamptz,
  last_down_duration_s integer,
  resolved_ip text,
  cert_days_remaining integer,
  cert_expires_at timestamptz,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, kind)
);

GRANT SELECT ON public.kuma_monitor_status TO authenticated;
GRANT ALL ON public.kuma_monitor_status TO service_role;
ALTER TABLE public.kuma_monitor_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma status" ON public.kuma_monitor_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TRIGGER trg_kuma_status_touch BEFORE UPDATE ON public.kuma_monitor_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.kuma_heartbeats (
  id bigserial PRIMARY KEY,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ok boolean NOT NULL,
  latency_ms integer,
  message text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kuma_hb_server_time ON public.kuma_heartbeats (server_id, kind, checked_at DESC);
GRANT SELECT ON public.kuma_heartbeats TO authenticated;
GRANT ALL ON public.kuma_heartbeats TO service_role;
ALTER TABLE public.kuma_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma heartbeats" ON public.kuma_heartbeats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE IF NOT EXISTS public.kuma_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_s integer,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kuma_inc_server ON public.kuma_incidents (server_id, started_at DESC);
GRANT SELECT ON public.kuma_incidents TO authenticated;
GRANT ALL ON public.kuma_incidents TO service_role;
ALTER TABLE public.kuma_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read kuma incidents" ON public.kuma_incidents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));