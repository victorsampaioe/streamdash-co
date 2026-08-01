CREATE TABLE public.reseller_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  tagline text NOT NULL DEFAULT '🚀 Seu entretenimento completo em um só lugar',
  intro text,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#22c55e',
  accent_color text NOT NULL DEFAULT '#0ea5e9',
  whatsapp text,
  telegram text,
  show_servers boolean NOT NULL DEFAULT true,
  show_dns boolean NOT NULL DEFAULT true,
  show_novidades boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reseller_pages_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_pages TO authenticated;
GRANT ALL ON public.reseller_pages TO service_role;

ALTER TABLE public.reseller_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own page" ON public.reseller_pages
  FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owner creates own page" ON public.reseller_pages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner updates own page" ON public.reseller_pages
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner deletes own page" ON public.reseller_pages
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER reseller_pages_touch BEFORE UPDATE ON public.reseller_pages
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS show_on_reseller_page boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_dns_label text,
  ADD COLUMN IF NOT EXISTS public_display_name text;

CREATE OR REPLACE FUNCTION public.get_reseller_page(_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pg public.reseller_pages%ROWTYPE;
  srv jsonb;
  news jsonb;
BEGIN
  SELECT * INTO pg FROM public.reseller_pages WHERE slug = lower(_slug) AND published = true;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO srv
  FROM (
    SELECT jsonb_build_object(
      'id', s.id,
      'name', COALESCE(s.public_display_name, s.name),
      'status', s.current_status,
      'health', COALESCE(s.health_score, s.dns_health_score),
      'latency_ms', s.last_latency_ms,
      'last_checked_at', s.last_checked_at,
      'dns', s.public_dns_label
    ) AS x
    FROM public.servers s
    WHERE s.owner_id = pg.owner_id AND s.show_on_reseller_page = true
  ) q;

  SELECT COALESCE(jsonb_agg(y ORDER BY y->>'detected_at' DESC), '[]'::jsonb) INTO news
  FROM (
    SELECT jsonb_build_object(
      'kind', c.kind,
      'name', c.name,
      'category', c.category,
      'detected_at', c.detected_at
    ) AS y
    FROM public.iptv_catalog_changes c
    JOIN public.servers s ON s.id = c.server_id
    WHERE s.owner_id = pg.owner_id
      AND s.show_on_reseller_page = true
      AND c.action = 'added'
      AND c.detected_at > now() - interval '7 days'
    ORDER BY c.detected_at DESC
    LIMIT 60
  ) q2;

  RETURN jsonb_build_object(
    'page', jsonb_build_object(
      'slug', pg.slug,
      'display_name', pg.display_name,
      'tagline', pg.tagline,
      'intro', pg.intro,
      'logo_url', pg.logo_url,
      'primary_color', pg.primary_color,
      'accent_color', pg.accent_color,
      'whatsapp', pg.whatsapp,
      'telegram', pg.telegram,
      'show_servers', pg.show_servers,
      'show_dns', pg.show_dns,
      'show_novidades', pg.show_novidades
    ),
    'servers', COALESCE(srv, '[]'::jsonb),
    'news', COALESCE(news, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reseller_page(text) TO anon, authenticated;