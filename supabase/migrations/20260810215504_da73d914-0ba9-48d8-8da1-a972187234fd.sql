
-- 1. Tabela de Conteúdos Global (Radar Inteligente)
CREATE TABLE IF NOT EXISTS public.iptv_global_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title_key text NOT NULL,
    media_type text NOT NULL, -- 'live', 'movie', 'tv'
    normalized_name text NOT NULL,
    poster_path text,
    tmdb_id integer,
    first_server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
    first_detected_at timestamptz DEFAULT now(),
    last_detected_at timestamptz DEFAULT now(),
    servers_found_count integer DEFAULT 1,
    is_rare boolean DEFAULT false,
    UNIQUE(title_key, media_type)
);

-- 2. Tabela de Vínculo Conteúdo x Servidor
CREATE TABLE IF NOT EXISTS public.iptv_catalog_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id uuid REFERENCES public.iptv_global_catalog(id) ON DELETE CASCADE,
    server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
    external_id text NOT NULL,
    raw_name text NOT NULL,
    detected_at timestamptz DEFAULT now(),
    UNIQUE(catalog_id, server_id)
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_iptv_global_catalog_title_key ON public.iptv_global_catalog(title_key);
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_matches_server_id ON public.iptv_catalog_matches(server_id);
CREATE INDEX IF NOT EXISTS idx_iptv_catalog_matches_catalog_id ON public.iptv_catalog_matches(catalog_id);

-- 4. Permissões
GRANT SELECT ON public.iptv_global_catalog TO authenticated;
GRANT ALL ON public.iptv_global_catalog TO service_role;

GRANT SELECT ON public.iptv_catalog_matches TO authenticated;
GRANT ALL ON public.iptv_catalog_matches TO service_role;

-- 5. RLS
ALTER TABLE public.iptv_global_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iptv_catalog_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read global catalog" ON public.iptv_global_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read catalog matches" ON public.iptv_catalog_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_role_all_global" ON public.iptv_global_catalog FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_matches" ON public.iptv_catalog_matches FOR ALL TO service_role USING (true);

-- 6. Trigger para atualizar contador de servidores
CREATE OR REPLACE FUNCTION public.update_global_catalog_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.iptv_global_catalog
        SET servers_found_count = (SELECT count(*) FROM public.iptv_catalog_matches WHERE catalog_id = NEW.catalog_id),
            last_detected_at = now()
        WHERE id = NEW.catalog_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.iptv_global_catalog
        SET servers_found_count = (SELECT count(*) FROM public.iptv_catalog_matches WHERE catalog_id = OLD.catalog_id)
        WHERE id = OLD.catalog_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_global_catalog_counts
AFTER INSERT OR DELETE ON public.iptv_catalog_matches
FOR EACH ROW EXECUTE FUNCTION public.update_global_catalog_counts();
