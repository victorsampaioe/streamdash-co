ALTER TABLE public.reactivation_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reactivation_campaigns FROM anon;
GRANT ALL ON public.reactivation_campaigns TO service_role;
GRANT SELECT ON public.reactivation_campaigns TO authenticated;
DROP POLICY IF EXISTS "Admins manage reactivation campaigns" ON public.reactivation_campaigns;
CREATE POLICY "Admins manage reactivation campaigns"
  ON public.reactivation_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "clusters readable by authenticated" ON public.iptv_server_clusters;
CREATE POLICY "clusters readable by admin or owner"
  ON public.iptv_server_clusters FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.iptv_cluster_members m
      JOIN public.servers s ON s.id = m.server_id
      WHERE m.cluster_id = iptv_server_clusters.id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cluster members readable by authenticated" ON public.iptv_cluster_members;
CREATE POLICY "cluster members readable by admin or owner"
  ON public.iptv_cluster_members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.servers s
      WHERE s.id = iptv_cluster_members.server_id AND s.owner_id = auth.uid()
    )
  );