CREATE OR REPLACE FUNCTION public.rebuild_iptv_clusters_service(
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
  _edge_count int := 0;
  _clusters int := 0;
  _members int := 0;
BEGIN
  DROP TABLE IF EXISTS _fp; DROP TABLE IF EXISTS _cnt; DROP TABLE IF EXISTS _net;
  DROP TABLE IF EXISTS _edg; DROP TABLE IF EXISTS _und; DROP TABLE IF EXISTS _comp;
  DROP TABLE IF EXISTS _groups; DROP TABLE IF EXISTS _primary; DROP TABLE IF EXISTS _newclusters;

  CREATE TEMP TABLE _fp ON COMMIT DROP AS
    SELECT server_id, kind || ':' || external_id || ':' || title_key AS k
    FROM public.iptv_catalog_items
    WHERE removed_at IS NULL AND kind IN ('vod','series');
  CREATE INDEX ON _fp(k);

  CREATE TEMP TABLE _cnt ON COMMIT DROP AS
    SELECT server_id, count(*)::int AS n FROM _fp GROUP BY 1;

  CREATE TEMP TABLE _net ON COMMIT DROP AS
    SELECT DISTINCT ON (server_id) server_id, primary_ip, asn, org
    FROM public.dns_snapshots ORDER BY server_id, checked_at DESC;

  CREATE TEMP TABLE _edg ON COMMIT DROP AS
  WITH inter AS (
    SELECT a.server_id AS a, b.server_id AS b, count(*)::int AS shared
    FROM _fp a JOIN _fp b ON a.k = b.k AND a.server_id < b.server_id
    GROUP BY 1,2
    HAVING count(*) >= _min_items
  )
  SELECT i.a, i.b, i.shared,
         (i.shared::numeric / LEAST(ca.n, cb.n)) AS overlap,
         COALESCE(na.primary_ip IS NOT NULL AND na.primary_ip = nb.primary_ip, false) AS same_ip,
         COALESCE(na.asn IS NOT NULL AND na.asn = nb.asn, false) AS same_asn
  FROM inter i
  JOIN _cnt ca ON ca.server_id = i.a
  JOIN _cnt cb ON cb.server_id = i.b
  LEFT JOIN _net na ON na.server_id = i.a
  LEFT JOIN _net nb ON nb.server_id = i.b;

  DELETE FROM _edg
  WHERE NOT (overlap >= _min_overlap OR (overlap >= _weak_overlap AND (same_ip OR same_asn)));
  SELECT count(*)::int INTO _edge_count FROM _edg;

  CREATE TEMP TABLE _und ON COMMIT DROP AS
    SELECT a, b FROM _edg UNION ALL SELECT b, a FROM _edg;
  CREATE INDEX ON _und(a);

  CREATE TEMP TABLE _comp ON COMMIT DROP AS SELECT server_id, server_id AS root FROM _cnt;
  CREATE UNIQUE INDEX ON _comp(server_id);

  LOOP
    UPDATE _comp c SET root = sub.newroot
    FROM (
      SELECT n.server_id,
             LEAST(n.root::text, COALESCE(MIN(o.root::text), n.root::text))::uuid AS newroot
      FROM _comp n
      LEFT JOIN _und u ON u.a = n.server_id
      LEFT JOIN _comp o ON o.server_id = u.b
      GROUP BY n.server_id, n.root
    ) sub
    WHERE c.server_id = sub.server_id AND c.root <> sub.newroot;
    EXIT WHEN NOT FOUND;
  END LOOP;

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
         COALESCE((SELECT ROUND(MAX(e.overlap), 4) FROM _edg e
                   WHERE e.a = c.server_id OR e.b = c.server_id), 1),
         COALESCE((SELECT jsonb_build_object('same_ip', bool_or(e.same_ip), 'same_asn', bool_or(e.same_asn),
                                             'shared_items', max(e.shared))
                   FROM _edg e WHERE e.a = c.server_id OR e.b = c.server_id), '{}'::jsonb)
  FROM _comp c JOIN _newclusters nc ON nc.root = c.root;

  SELECT count(*)::int INTO _clusters FROM public.iptv_server_clusters;
  SELECT count(*)::int INTO _members FROM public.iptv_cluster_members;

  PERFORM public.recalc_iptv_availability();

  RETURN jsonb_build_object(
    'edges', _edge_count, 'clusters', _clusters, 'members', _members,
    'aliases_grouped', GREATEST(_members - _clusters, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rebuild_iptv_clusters_service(numeric, integer, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_iptv_clusters_service(numeric, integer, numeric) TO service_role;

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
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.rebuild_iptv_clusters_service(_min_overlap, _min_items, _weak_overlap);
END;
$function$;