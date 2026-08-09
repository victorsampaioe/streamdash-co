
CREATE TABLE IF NOT EXISTS public.tmdb_content_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title_key text NOT NULL,
    media_type text NOT NULL,
    tmdb_id integer,
    first_detected_at timestamptz DEFAULT now(),
    last_detected_at timestamptz DEFAULT now(),
    discovery_server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
    servers_found_count integer DEFAULT 1,
    UNIQUE (title_key, media_type)
);

GRANT SELECT, INSERT, UPDATE ON public.tmdb_content_history TO authenticated;
GRANT ALL ON public.tmdb_content_history TO service_role;
ALTER TABLE public.tmdb_content_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read history" ON public.tmdb_content_history
    FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.reseller_catalog_stats (
    server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
    updates_last_7d integer DEFAULT 0,
    total_contents integer DEFAULT 0,
    last_sync_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reseller_catalog_stats TO authenticated;
GRANT ALL ON public.reseller_catalog_stats TO service_role;
ALTER TABLE public.reseller_catalog_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read stats" ON public.reseller_catalog_stats
    FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_catalog_stats(_server_id uuid, _added_count integer, _total integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.reseller_catalog_stats (server_id, updates_last_7d, total_contents, last_sync_at)
    VALUES (_server_id, _added_count, _total, now())
    ON CONFLICT (server_id) DO UPDATE SET
        updates_last_7d = reseller_catalog_stats.updates_last_7d + EXCLUDED.updates_last_7d,
        total_contents = EXCLUDED.total_contents,
        last_sync_at = now();
END;
$$;
