
-- Regiões de monitoramento
CREATE TABLE public.check_regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  flag text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.check_regions TO anon, authenticated;
GRANT ALL ON public.check_regions TO service_role;

ALTER TABLE public.check_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Regions readable by everyone"
  ON public.check_regions FOR SELECT
  USING (true);

-- Checks por região
CREATE TABLE public.region_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  region_code text NOT NULL REFERENCES public.check_regions(code) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('up','down','degraded','unknown','pending')),
  http_status int,
  latency_ms int,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_region_checks_server_time ON public.region_checks(server_id, checked_at DESC);
CREATE INDEX idx_region_checks_server_region_time ON public.region_checks(server_id, region_code, checked_at DESC);

GRANT SELECT ON public.region_checks TO anon, authenticated;
GRANT INSERT ON public.region_checks TO authenticated;
GRANT ALL ON public.region_checks TO service_role;

ALTER TABLE public.region_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own region checks"
  ON public.region_checks FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = region_checks.server_id AND s.owner_id = auth.uid()));

CREATE POLICY "Public reads region checks of public servers"
  ON public.region_checks FOR SELECT
  TO anon
  USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = region_checks.server_id AND s.is_public = true));

-- Seed regiões
INSERT INTO public.check_regions (code, name, city, country, flag, latitude, longitude) VALUES
  ('origin',        'Origem (Lovable)',   'Origem',    'Global',    '🌐', 0,        0),
  ('sa-east-1',     'AWS São Paulo',      'São Paulo', 'Brasil',    '🇧🇷', -23.5505, -46.6333),
  ('us-east-1',     'AWS Virgínia',       'Ashburn',   'EUA',       '🇺🇸', 39.0438,  -77.4874),
  ('eu-central-1',  'AWS Frankfurt',      'Frankfurt', 'Alemanha',  '🇩🇪', 50.1109,  8.6821),
  ('ap-northeast-1','AWS Tóquio',         'Tóquio',    'Japão',     '🇯🇵', 35.6762,  139.6503);
