
CREATE TYPE public.iptv_mode AS ENUM ('basic','smart','full');
CREATE TYPE public.iptv_kind AS ENUM ('none','xtream','m3u','both');
CREATE TYPE public.iptv_stream_kind AS ENUM ('live','vod','series');

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS iptv_mode public.iptv_mode NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS iptv_interval_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS iptv_username text,
  ADD COLUMN IF NOT EXISTS iptv_password text,
  ADD COLUMN IF NOT EXISTS iptv_detected public.iptv_kind NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS iptv_sample_size integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS iptv_stream_tests boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS last_iptv_sync_at timestamptz;

CREATE TABLE public.iptv_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  mode public.iptv_mode NOT NULL DEFAULT 'smart',
  synced_at timestamptz NOT NULL DEFAULT now(),
  api_ms integer,
  login_ok boolean,
  json_valid boolean,
  channels integer,
  movies integer,
  series integer,
  categories integer,
  m3u_channels integer,
  m3u_groups integer,
  m3u_bytes integer,
  playlist_ok boolean,
  latency_ms integer,
  health_score integer,
  fastest_region text,
  slowest_region text,
  avg_region_ms integer,
  ip text,
  asn text,
  datacenter text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_syncs_server_time ON public.iptv_syncs(server_id, synced_at DESC);
GRANT SELECT ON public.iptv_syncs TO authenticated;
GRANT ALL ON public.iptv_syncs TO service_role;
ALTER TABLE public.iptv_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv syncs" ON public.iptv_syncs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.iptv_stream_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  sync_id uuid REFERENCES public.iptv_syncs(id) ON DELETE CASCADE,
  kind public.iptv_stream_kind NOT NULL,
  label text,
  ok boolean NOT NULL DEFAULT false,
  start_ms integer,
  total_ms integer,
  bitrate_kbps integer,
  resolution text,
  codec text,
  buffer_ms integer,
  error text,
  tested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_stream_tests_server_time ON public.iptv_stream_tests(server_id, tested_at DESC);
GRANT SELECT ON public.iptv_stream_tests TO authenticated;
GRANT ALL ON public.iptv_stream_tests TO service_role;
ALTER TABLE public.iptv_stream_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv stream tests" ON public.iptv_stream_tests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TABLE public.iptv_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  detail text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_alerts_server_time ON public.iptv_alerts(server_id, created_at DESC);
GRANT SELECT, UPDATE ON public.iptv_alerts TO authenticated;
GRANT ALL ON public.iptv_alerts TO service_role;
ALTER TABLE public.iptv_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads iptv alerts" ON public.iptv_alerts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "owner acks iptv alerts" ON public.iptv_alerts FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

CREATE TABLE public.iptv_ip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  old_ip text,
  new_ip text,
  old_asn text,
  new_asn text,
  datacenter text,
  country text,
  city text,
  isp text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_iptv_ip_history_server_time ON public.iptv_ip_history(server_id, changed_at DESC);
GRANT SELECT ON public.iptv_ip_history TO authenticated;
GRANT ALL ON public.iptv_ip_history TO service_role;
ALTER TABLE public.iptv_ip_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads ip history" ON public.iptv_ip_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
