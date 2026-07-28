
-- Remove public access to servers table (leaked host to anyone)
DROP POLICY IF EXISTS "servers: public read" ON public.servers;
DROP POLICY IF EXISTS "servers: public read auth" ON public.servers;

-- Secure RPC for the public status page (no host exposed)
CREATE OR REPLACE FUNCTION public.get_public_status(_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  current_status server_status,
  last_latency_ms integer,
  last_checked_at timestamptz,
  ssl_days_remaining integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, description, current_status, last_latency_ms, last_checked_at, ssl_days_remaining
  FROM public.servers
  WHERE public_slug = _slug AND is_public = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_status(text) TO anon, authenticated;

-- Secure RPC for last N checks of a public server
CREATE OR REPLACE FUNCTION public.get_public_checks(_slug text, _limit integer DEFAULT 60)
RETURNS TABLE (
  status server_status,
  checked_at timestamptz,
  latency_ms integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.status, c.checked_at, c.latency_ms
  FROM public.checks c
  JOIN public.servers s ON s.id = c.server_id
  WHERE s.public_slug = _slug AND s.is_public = true
  ORDER BY c.checked_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.get_public_checks(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checks(text, integer) TO anon, authenticated;
