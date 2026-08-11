
-- MIGRATION: Corrigir vínculo de disponibilidade do Radar IPTV e contadores.
-- Este script garante que o `servers_found_count` seja derivado diretamente da `iptv_catalog_matches`.

-- 1. Recalcular contadores na iptv_global_catalog baseado nos vínculos reais.
WITH availability_counts AS (
  SELECT catalog_id, COUNT(DISTINCT server_id) as real_count
  FROM public.iptv_catalog_matches
  GROUP BY catalog_id
)
UPDATE public.iptv_global_catalog gc
SET servers_found_count = ac.real_count
FROM availability_counts ac
WHERE gc.id = ac.catalog_id;

-- 2. Zerar contadores de quem não tem vínculo real.
UPDATE public.iptv_global_catalog
SET servers_found_count = 0
WHERE id NOT IN (SELECT DISTINCT catalog_id FROM public.iptv_catalog_matches);

-- 3. Trigger para manter o contador atualizado automaticamente.
CREATE OR REPLACE FUNCTION public.sync_iptv_catalog_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.iptv_global_catalog
    SET servers_found_count = (
      SELECT COUNT(DISTINCT server_id) 
      FROM public.iptv_catalog_matches 
      WHERE catalog_id = NEW.catalog_id
    )
    WHERE id = NEW.catalog_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.iptv_global_catalog
    SET servers_found_count = (
      SELECT COUNT(DISTINCT server_id) 
      FROM public.iptv_catalog_matches 
      WHERE catalog_id = OLD.catalog_id
    )
    WHERE id = OLD.catalog_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_sync_iptv_catalog_count ON public.iptv_catalog_matches;
CREATE TRIGGER tr_sync_iptv_catalog_count
AFTER INSERT OR DELETE ON public.iptv_catalog_matches
FOR EACH ROW EXECUTE FUNCTION public.sync_iptv_catalog_count();

GRANT EXECUTE ON FUNCTION public.sync_iptv_catalog_count() TO service_role;
