-- store_settings: admin only
DROP POLICY IF EXISTS "Users can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "authenticated_select_settings" ON public.store_settings;

-- store_products: consolidate SELECT policies
DROP POLICY IF EXISTS "Anyone can view active products" ON public.store_products;
DROP POLICY IF EXISTS "Users can view active products" ON public.store_products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.store_products;

-- external_service_incidents: admin only (app reads via service role)
DROP POLICY IF EXISTS "Anyone authenticated can read external incidents" ON public.external_service_incidents;
CREATE POLICY "Admins can read external incidents"
  ON public.external_service_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- tmdb_content_history: admin only (app reads via service role)
DROP POLICY IF EXISTS "Anyone authenticated can read history" ON public.tmdb_content_history;
CREATE POLICY "Admins can read tmdb history"
  ON public.tmdb_content_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- reseller_catalog_stats: owner or admin only
DROP POLICY IF EXISTS "Anyone authenticated can read stats" ON public.reseller_catalog_stats;
CREATE POLICY "Owner or admin can read catalog stats"
  ON public.reseller_catalog_stats FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = reseller_catalog_stats.server_id AND s.owner_id = auth.uid()
    )
  );

-- Safe aggregated ranking (names + counters only)
CREATE OR REPLACE FUNCTION public.get_catalog_update_ranking(_limit integer DEFAULT 10)
RETURNS TABLE(name text, updates integer, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.name, 'Servidor Privado'),
         COALESCE(r.updates_last_7d, 0),
         COALESCE(r.total_contents, 0)
  FROM public.reseller_catalog_stats r
  LEFT JOIN public.servers s ON s.id = r.server_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY r.updates_last_7d DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

REVOKE ALL ON FUNCTION public.get_catalog_update_ranking(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_catalog_update_ranking(integer) TO authenticated, service_role;