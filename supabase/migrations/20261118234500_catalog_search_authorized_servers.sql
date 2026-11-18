-- Server-only permission gate for catalog title availability queries.
-- A server is searchable only when:
--  * owned by the authenticated caller (caller ID checked separately in server middleware);
--  * Xtream credentials exist, latest checked login is valid, the monitor recognizes Xtream;
--  * a nonremoved catalog entry exists, sync succeeded and monitoring is not paused;
--  * caller is also checked for active credits/subscription on each server request.
CREATE OR REPLACE FUNCTION public.get_searchable_catalog_servers(_owner_id uuid)
RETURNS TABLE(id uuid,name text,catalog_synced_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$
 SELECT s.id,s.name,s.catalog_synced_at
 FROM public.servers s
 WHERE s.owner_id=_owner_id
   AND s.catalog_synced_at IS NOT NULL
   AND NULLIF(s.iptv_username,'') IS NOT NULL
   AND NULLIF(s.iptv_password,'') IS NOT NULL
   AND s.iptv_detected::text IN ('xtream','both')
   AND s.monitoring_paused IS DISTINCT FROM TRUE
   AND EXISTS (
      SELECT 1 FROM public.iptv_catalog_items c
      WHERE c.server_id=s.id AND c.removed_at IS NULL
   )
   AND EXISTS (
      SELECT 1 FROM LATERAL (
        SELECT v.login_ok,v.json_valid
        FROM public.iptv_syncs v
        WHERE v.server_id=s.id AND v.login_checked IS TRUE
        ORDER BY v.synced_at DESC LIMIT 1
      ) latest
      WHERE latest.login_ok IS TRUE AND latest.json_valid IS TRUE
   )
 ORDER BY s.name LIMIT 300
$$;
-- Revoke default PUBLIC privileges. Only the trusted application server
-- holds service_role; do not expose this RPC to ordinary Supabase API callers.
REVOKE ALL ON FUNCTION public.get_searchable_catalog_servers(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_searchable_catalog_servers(uuid) TO service_role;
