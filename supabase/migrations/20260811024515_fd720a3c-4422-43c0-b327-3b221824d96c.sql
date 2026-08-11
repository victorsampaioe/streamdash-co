ALTER TABLE public.iptv_global_catalog
  ADD COLUMN IF NOT EXISTS tmdb_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tmdb_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_year integer,
  ADD COLUMN IF NOT EXISTS vote_average numeric;

UPDATE public.iptv_global_catalog SET tmdb_status = 'found' WHERE tmdb_id IS NOT NULL AND tmdb_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_global_catalog_tmdb_status ON public.iptv_global_catalog (tmdb_status, last_detected_at DESC);

CREATE TABLE IF NOT EXISTS public.iptv_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued',
  created_by uuid,
  total_servers integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  movies_found integer NOT NULL DEFAULT 0,
  series_found integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iptv_sync_jobs TO authenticated;
GRANT ALL ON public.iptv_sync_jobs TO service_role;
ALTER TABLE public.iptv_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sync jobs" ON public.iptv_sync_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_role_all_sync_jobs" ON public.iptv_sync_jobs TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.iptv_sync_job_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.iptv_sync_jobs(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  movies integer NOT NULL DEFAULT 0,
  series integer NOT NULL DEFAULT 0,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, server_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_job_items_pending ON public.iptv_sync_job_items (job_id, status);

GRANT SELECT ON public.iptv_sync_job_items TO authenticated;
GRANT ALL ON public.iptv_sync_job_items TO service_role;
ALTER TABLE public.iptv_sync_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sync job items" ON public.iptv_sync_job_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_role_all_sync_job_items" ON public.iptv_sync_job_items TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_sync_jobs_updated BEFORE UPDATE ON public.iptv_sync_jobs FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
CREATE TRIGGER trg_sync_job_items_updated BEFORE UPDATE ON public.iptv_sync_job_items FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Reconstrucao do catalogo global a partir dos itens ja coletados (somente VOD e series)
INSERT INTO public.iptv_global_catalog (title_key, media_type, normalized_name, first_server_id, first_detected_at, last_detected_at, tmdb_status)
SELECT DISTINCT ON (t.title_key, t.media_type)
  t.title_key, t.media_type, t.name, t.server_id, t.first_seen_at, t.last_seen_at, 'pending'
FROM (
  SELECT title_key,
         CASE WHEN kind = 'series' THEN 'tv' ELSE 'movie' END AS media_type,
         name, server_id, first_seen_at, last_seen_at
  FROM public.iptv_catalog_items
  WHERE removed_at IS NULL AND kind IN ('vod','series') AND title_key IS NOT NULL AND title_key <> ''
) t
ORDER BY t.title_key, t.media_type, t.first_seen_at ASC NULLS LAST
ON CONFLICT (title_key, media_type) DO NOTHING;

ALTER TABLE public.iptv_catalog_matches DISABLE TRIGGER trigger_update_global_catalog_counts;

INSERT INTO public.iptv_catalog_matches (catalog_id, server_id, external_id, raw_name, detected_at)
SELECT DISTINCT ON (g.id, i.server_id)
  g.id, i.server_id, i.external_id, i.name, i.first_seen_at
FROM public.iptv_catalog_items i
JOIN public.iptv_global_catalog g
  ON g.title_key = i.title_key
 AND g.media_type = CASE WHEN i.kind = 'series' THEN 'tv' ELSE 'movie' END
WHERE i.removed_at IS NULL AND i.kind IN ('vod','series') AND i.title_key IS NOT NULL AND i.title_key <> ''
ORDER BY g.id, i.server_id, i.first_seen_at ASC NULLS LAST
ON CONFLICT (catalog_id, server_id) DO NOTHING;

ALTER TABLE public.iptv_catalog_matches ENABLE TRIGGER trigger_update_global_catalog_counts;

UPDATE public.iptv_global_catalog g
SET servers_found_count = c.n
FROM (SELECT catalog_id, count(*) AS n FROM public.iptv_catalog_matches GROUP BY catalog_id) c
WHERE c.catalog_id = g.id AND g.servers_found_count IS DISTINCT FROM c.n;