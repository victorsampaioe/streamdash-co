-- ============ Servidores lógicos (clusters) do Radar IPTV ============
CREATE TABLE IF NOT EXISTS public.iptv_server_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  primary_server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  members_count integer NOT NULL DEFAULT 1,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.iptv_server_clusters TO authenticated;
GRANT ALL ON public.iptv_server_clusters TO service_role;
ALTER TABLE public.iptv_server_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clusters readable by authenticated" ON public.iptv_server_clusters;
CREATE POLICY "clusters readable by authenticated" ON public.iptv_server_clusters
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "clusters managed by admin" ON public.iptv_server_clusters;
CREATE POLICY "clusters managed by admin" ON public.iptv_server_clusters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.iptv_cluster_members (
  server_id uuid PRIMARY KEY REFERENCES public.servers(id) ON DELETE CASCADE,
  cluster_id uuid NOT NULL REFERENCES public.iptv_server_clusters(id) ON DELETE CASCADE,
  confidence numeric NOT NULL DEFAULT 1,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cluster_members_cluster ON public.iptv_cluster_members(cluster_id);

GRANT SELECT ON public.iptv_cluster_members TO authenticated;
GRANT ALL ON public.iptv_cluster_members TO service_role;
ALTER TABLE public.iptv_cluster_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cluster members readable by authenticated" ON public.iptv_cluster_members;
CREATE POLICY "cluster members readable by authenticated" ON public.iptv_cluster_members
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cluster members managed by admin" ON public.iptv_cluster_members;
CREATE POLICY "cluster members managed by admin" ON public.iptv_cluster_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clusters_touch BEFORE UPDATE ON public.iptv_server_clusters
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ Motor de agrupamento por sinais técnicos ============
CREATE OR REPLACE FUNCTION public.rebuild_iptv_clusters(
  _min_overlap numeric DEFAULT 0.85,
  _min_items integer DEFAULT 300,
  _weak_overlap numeric DEFAULT 0.60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '600s'
AS $function$
DECLARE
  _edges int := 0;
  _clusters int := 0;
  _members int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Impressão digital do catálogo: kind + external_id (ID interno do painel) + title_key
  CREATE TEMP TABLE _fp ON COMMIT DROP AS
    SELECT server_id, kind || ':' || external_id || ':' || title_key AS k
    FROM public.iptv_catalog_items
    WHERE removed_at IS NULL AND kind IN ('vod','series');
  CREATE INDEX ON _fp(k);

  CREATE TEMP TABLE _cnt ON COMMIT DROP AS
    SELECT server_id, count(*)::int AS n FROM _fp GROUP BY 1;

  -- Sinais de rede: último snapshot DNS de cada servidor
  CREATE TEMP TABLE _net ON COMMIT DROP AS
    SELECT DISTINCT ON (server_id) server_id, primary_ip, asn, org
    FROM public.dns_snapshots ORDER BY server_id, checked_at DESC;

  CREATE TEMP TABLE _edges ON COMMIT DROP AS
  WITH inter AS (
    SELECT a.server_id AS a, b.server_id AS b, count(*)::int AS shared
    FROM _fp a JOIN _fp b ON a.k = b.k AND a.server_id < b.server_id
    GROUP BY 1,2
    HAVING count(*) >= _min_items
  )
  SELECT i.a, i.b, i.shared,
         (i.shared::numeric / LEAST(ca.n, cb.n)) AS overlap,
         (na.primary_ip IS NOT NULL AND na.primary_ip = nb.primary_ip) AS same_ip,
         (na.asn IS NOT NULL AND na.asn = nb.asn) AS same_asn,
         na.org AS org_a, nb.org AS org_b
  FROM inter i
  JOIN _cnt ca ON ca.server_id = i.a
  JOIN _cnt cb ON cb.server_id = i.b
  LEFT JOIN _net na ON na.server_id = i.a
  LEFT JOIN _net nb ON nb.server_id = i.b;

  DELETE FROM _edges
  WHERE NOT (
    overlap >= _min_overlap
    OR (overlap >= _weak_overlap AND (same_ip OR same_asn))
  );
  GET DIAGNOSTICS _edges = ROW_COUNT;
  SELECT count(*)::int INTO _edges FROM _edges;

  -- Componentes conexas (união dos aliases)
  CREATE TEMP TABLE _und ON COMMIT DROP AS
    SELECT a, b FROM _edges UNION ALL SELECT b, a FROM _edges;
  CREATE INDEX ON _und(a);

  CREATE TEMP TABLE _comp ON COMMIT DROP AS SELECT server_id, server_id AS root FROM _cnt;
  CREATE UNIQUE INDEX ON _comp(server_id);

  LOOP
    UPDATE _comp c SET root = sub.newroot
    FROM (
      SELECT n.server_id, LEAST(n.root, COALESCE(MIN(o.root), n.root)) AS newroot
      FROM _comp n
      LEFT JOIN _und u ON u.a = n.server_id
      LEFT JOIN _comp o ON o.server_id = u.b
      GROUP BY n.server_id, n.root
    ) sub
    WHERE c.server_id = sub.server_id AND c.root <> sub.newroot;
    EXIT WHEN NOT FOUND;
  END LOOP;

  -- Regrava agrupamentos (não apaga nenhum servidor real)
  DELETE FROM public.iptv_cluster_members;
  DELETE FROM public.iptv_server_clusters;

  CREATE TEMP TABLE _groups ON COMMIT DROP AS
    SELECT root, count(*)::int AS members FROM _comp GROUP BY root HAVING count(*) > 1;

  CREATE TEMP TABLE _primary ON COMMIT DROP AS
    SELECT DISTINCT ON (c.root) c.root, c.server_id, s.name
    FROM _comp c
    JOIN _cnt n ON n.server_id = c.server_id
    JOIN public.servers s ON s.id = c.server_id
    WHERE c.root IN (SELECT root FROM _groups)
    ORDER BY c.root, n.n DESC;

  CREATE TEMP TABLE _newclusters ON COMMIT DROP AS
    SELECT gen_random_uuid() AS id, g.root, p.server_id AS primary_server_id,
           COALESCE(p.name, 'Servidor') AS name, g.members
    FROM _groups g JOIN _primary p ON p.root = g.root;

  INSERT INTO public.iptv_server_clusters (id, name, primary_server_id, members_count, signals)
  SELECT nc.id, nc.name, nc.primary_server_id, nc.members,
         jsonb_build_object(
           'method', 'catalog_fingerprint+network',
           'min_overlap', _min_overlap,
           'min_items', _min_items,
           'aliases', (SELECT jsonb_agg(jsonb_build_object('name', s.name, 'host', s.host))
                       FROM _comp c2 JOIN public.servers s ON s.id = c2.server_id
                       WHERE c2.root = nc.root)
         )
  FROM _newclusters nc;

  INSERT INTO public.iptv_cluster_members (server_id, cluster_id, confidence, signals)
  SELECT c.server_id, nc.id,
         COALESCE((SELECT ROUND(MAX(e.overlap), 4) FROM _edges e
                   WHERE e.a = c.server_id OR e.b = c.server_id), 1),
         COALESCE((SELECT jsonb_build_object('same_ip', bool_or(e.same_ip), 'same_asn', bool_or(e.same_asn),
                                             'shared_items', max(e.shared))
                   FROM _edges e WHERE e.a = c.server_id OR e.b = c.server_id), '{}'::jsonb)
  FROM _comp c JOIN _newclusters nc ON nc.root = c.root;

  SELECT count(*)::int INTO _clusters FROM public.iptv_server_clusters;
  SELECT count(*)::int INTO _members FROM public.iptv_cluster_members;

  -- Recalcula toda a disponibilidade usando servidores lógicos
  PERFORM public.recalc_iptv_availability();

  RETURN jsonb_build_object(
    'edges', _edges, 'clusters', _clusters, 'members', _members,
    'aliases_grouped', GREATEST(_members - _clusters, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rebuild_iptv_clusters(numeric, integer, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.rebuild_iptv_clusters(numeric, integer, numeric) TO authenticated, service_role;

-- ============ Recalcular disponibilidade por servidor lógico ============
CREATE OR REPLACE FUNCTION public.recalc_iptv_availability()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '600s'
AS $function$
DECLARE _n int;
BEGIN
  UPDATE public.iptv_global_catalog g
  SET servers_found_count = x.c
  FROM (
    SELECT m.catalog_id,
           count(DISTINCT COALESCE(cm.cluster_id, m.server_id))::int AS c
    FROM public.iptv_catalog_matches m
    LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
    GROUP BY m.catalog_id
  ) x
  WHERE x.catalog_id = g.id AND g.servers_found_count IS DISTINCT FROM x.c;
  GET DIAGNOSTICS _n = ROW_COUNT;

  UPDATE public.iptv_global_catalog g
  SET servers_found_count = 0
  WHERE g.servers_found_count IS DISTINCT FROM 0
    AND NOT EXISTS (SELECT 1 FROM public.iptv_catalog_matches m WHERE m.catalog_id = g.id);

  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.recalc_iptv_availability() FROM public;
GRANT EXECUTE ON FUNCTION public.recalc_iptv_availability() TO authenticated, service_role;

-- ============ Contadores em tempo real por servidor lógico ============
CREATE OR REPLACE FUNCTION public.update_global_catalog_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cid uuid;
BEGIN
  _cid := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_id ELSE NEW.catalog_id END;
  UPDATE public.iptv_global_catalog
  SET servers_found_count = (
        SELECT count(DISTINCT COALESCE(cm.cluster_id, m.server_id))
        FROM public.iptv_catalog_matches m
        LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
        WHERE m.catalog_id = _cid
      ),
      last_detected_at = CASE WHEN TG_OP = 'INSERT' THEN now() ELSE last_detected_at END
  WHERE id = _cid;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_iptv_catalog_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _cid uuid;
BEGIN
  _cid := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_id ELSE NEW.catalog_id END;
  UPDATE public.iptv_global_catalog
  SET servers_found_count = (
    SELECT count(DISTINCT COALESCE(cm.cluster_id, m.server_id))
    FROM public.iptv_catalog_matches m
    LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
    WHERE m.catalog_id = _cid
  )
  WHERE id = _cid;
  RETURN NULL;
END;
$function$;

-- ============ Disponibilidade exibida (lista) por servidor lógico ============
DROP FUNCTION IF EXISTS public.radar_title_availability(text[], text);
CREATE FUNCTION public.radar_title_availability(_title_keys text[], _media text)
RETURNS TABLE(server_id uuid, name text, is_mine boolean, status text,
              last_sync_at timestamptz, found_at timestamptz, quality text, aliases integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH rows AS (
    SELECT COALESCE(cm.cluster_id, s.id) AS logical_id,
           s.id AS sid, s.owner_id, s.name, s.current_status, s.last_iptv_sync_at,
           m.detected_at, m.raw_name, cl.name AS cluster_name, cl.primary_server_id, cl.members_count
    FROM public.iptv_catalog_matches m
    JOIN public.iptv_global_catalog g ON g.id = m.catalog_id
    JOIN public.servers s ON s.id = m.server_id
    LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = s.id
    LEFT JOIN public.iptv_server_clusters cl ON cl.id = cm.cluster_id
    WHERE g.title_key = ANY(_title_keys)
      AND (_media IS NULL OR g.media_type = _media)
  ), pick AS (
    SELECT DISTINCT ON (logical_id) *
    FROM rows
    ORDER BY logical_id, (primary_server_id IS NOT DISTINCT FROM sid) DESC, detected_at ASC
  )
  SELECT public.mask_server_id(p.sid, p.owner_id),
         COALESCE(p.cluster_name, p.name, 'Servidor Privado'),
         EXISTS (SELECT 1 FROM rows r WHERE r.logical_id = p.logical_id AND r.owner_id = auth.uid()),
         p.current_status::text,
         p.last_iptv_sync_at,
         (SELECT MIN(r.detected_at) FROM rows r WHERE r.logical_id = p.logical_id),
         CASE
           WHEN lower(coalesce(p.raw_name,'')) LIKE '%4k%' THEN '4K'
           WHEN lower(coalesce(p.raw_name,'')) LIKE '%fhd%' OR lower(coalesce(p.raw_name,'')) LIKE '%1080%' THEN 'FHD'
           ELSE 'HD'
         END,
         COALESCE(p.members_count, 1)
  FROM pick p;
$function$;

REVOKE ALL ON FUNCTION public.radar_title_availability(text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.radar_title_availability(text[], text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.radar_title_count(_title_keys text[], _media text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(DISTINCT COALESCE(cm.cluster_id, m.server_id))::int
  FROM public.iptv_catalog_matches m
  JOIN public.iptv_global_catalog g ON g.id = m.catalog_id
  LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
  WHERE g.title_key = ANY(_title_keys)
    AND (_media IS NULL OR g.media_type = _media);
$function$;

-- ============ Diagnóstico administrativo ============
CREATE OR REPLACE FUNCTION public.iptv_cluster_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  _total int; _iptv int; _clusters int; _members int; _matches bigint; _logical bigint; res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO _total FROM public.servers;
  SELECT count(*) INTO _iptv FROM public.servers
    WHERE iptv_username IS NOT NULL AND iptv_username <> '' AND iptv_password IS NOT NULL;
  SELECT count(*) INTO _clusters FROM public.iptv_server_clusters;
  SELECT count(*) INTO _members FROM public.iptv_cluster_members;
  SELECT count(*) INTO _matches FROM public.iptv_catalog_matches;
  SELECT count(*) INTO _logical FROM (
    SELECT DISTINCT m.catalog_id, COALESCE(cm.cluster_id, m.server_id)
    FROM public.iptv_catalog_matches m
    LEFT JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
  ) q;

  SELECT jsonb_build_object(
    'servers_total', _total,
    'servers_iptv', _iptv,
    'logical_servers', GREATEST(_iptv - _members, 0) + _clusters,
    'clusters', _clusters,
    'aliases_grouped', GREATEST(_members - _clusters, 0),
    'matches_before', _matches,
    'matches_after', _logical,
    'matches_redundant', GREATEST(_matches - _logical, 0),
    'estimated_saved_bytes', GREATEST(_matches - _logical, 0) * 120,
    'clusters_detail', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'members', c.members_count,
        'aliases', c.signals->'aliases'
      ) ORDER BY c.members_count DESC) FROM public.iptv_server_clusters c
    ), '[]'::jsonb)
  ) INTO res;
  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.iptv_cluster_diagnostics() FROM public;
GRANT EXECUTE ON FUNCTION public.iptv_cluster_diagnostics() TO authenticated, service_role;

-- ============ Limpeza opcional de vínculos redundantes ============
CREATE OR REPLACE FUNCTION public.prune_redundant_catalog_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '600s'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH ranked AS (
    SELECT m.ctid,
           row_number() OVER (
             PARTITION BY m.catalog_id, cm.cluster_id
             ORDER BY (cl.primary_server_id IS NOT DISTINCT FROM m.server_id) DESC, m.detected_at ASC
           ) AS rn
    FROM public.iptv_catalog_matches m
    JOIN public.iptv_cluster_members cm ON cm.server_id = m.server_id
    JOIN public.iptv_server_clusters cl ON cl.id = cm.cluster_id
  )
  DELETE FROM public.iptv_catalog_matches t
  USING ranked r
  WHERE t.ctid = r.ctid AND r.rn > 1;
  GET DIAGNOSTICS _n = ROW_COUNT;

  PERFORM public.recalc_iptv_availability();
  RETURN _n;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_redundant_catalog_matches() FROM public;
GRANT EXECUTE ON FUNCTION public.prune_redundant_catalog_matches() TO authenticated, service_role;