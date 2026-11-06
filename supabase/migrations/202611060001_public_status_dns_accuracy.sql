CREATE OR REPLACE FUNCTION public.get_public_status_v2(_slug text)
RETURNS TABLE(
 id uuid,
 name text,
 description text,
 current_status public.server_status,
 last_latency_ms integer,
 last_checked_at timestamptz,
 ssl_days_remaining integer,
 dns_status text,
 last_dns_check_at timestamptz,
 monitoring_paused boolean,
 dns_enabled boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
 SELECT s.id, s.name, s.description, s.current_status,
        s.last_latency_ms, s.last_checked_at, s.ssl_days_remaining,
        s.dns_status, s.last_dns_check_at, s.monitoring_paused, s.dns_enabled
 FROM public.servers s
 WHERE s.is_public = true AND s.public_slug = _slug
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_status_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_status_v2(text) TO anon, authenticated;