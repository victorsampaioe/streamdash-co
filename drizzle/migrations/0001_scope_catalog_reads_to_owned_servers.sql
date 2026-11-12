ALTER POLICY "Allow authenticated read catalog matches"
ON public.iptv_catalog_matches
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.servers s
    WHERE s.id = iptv_catalog_matches.server_id
      AND s.owner_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Allow authenticated read global catalog"
ON public.iptv_global_catalog
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.iptv_catalog_matches m
    JOIN public.servers s ON s.id = m.server_id
    WHERE m.catalog_id = iptv_global_catalog.id
      AND s.owner_id = (SELECT auth.uid())
  )
);
