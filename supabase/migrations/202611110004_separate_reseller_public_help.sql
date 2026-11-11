-- Independent reseller public help center. Status page and help center no longer share publication or server toggles.
CREATE TABLE IF NOT EXISTS public.reseller_help_settings (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
 display_name text NOT NULL CHECK(length(trim(display_name)) BETWEEN 2 AND 100),
 tagline text NOT NULL DEFAULT 'Central de Ajuda',
 logo_url text,
 whatsapp text,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reseller_help_servers (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,server_id)
);
CREATE INDEX IF NOT EXISTS idx_reseller_help_servers_owner ON public.reseller_help_servers(owner_id);
ALTER TABLE public.reseller_help_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_help_servers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reseller_help_settings FROM anon;
REVOKE ALL ON public.reseller_help_servers FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reseller_help_settings TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.reseller_help_servers TO authenticated;
DROP POLICY IF EXISTS "owners manage help settings" ON public.reseller_help_settings;
CREATE POLICY "owners manage help settings" ON public.reseller_help_settings
 FOR ALL TO authenticated USING(auth.uid()=owner_id) WITH CHECK(auth.uid()=owner_id);
DROP POLICY IF EXISTS "owners manage listed help servers" ON public.reseller_help_servers;
CREATE POLICY "owners manage listed help servers" ON public.reseller_help_servers
 FOR ALL TO authenticated USING(auth.uid()=owner_id)
 WITH CHECK(auth.uid()=owner_id AND EXISTS(
  SELECT 1 FROM public.servers s WHERE s.id=server_id AND s.owner_id=auth.uid()
 ));
-- Backward compatibility: keep existing help links working, but independent going forward.
INSERT INTO public.reseller_help_settings(owner_id,slug,display_name,tagline,logo_url,whatsapp,enabled)
SELECT owner_id,slug,display_name,COALESCE(tagline,'Central de Ajuda'),logo_url,whatsapp,published
FROM public.reseller_pages
ON CONFLICT(owner_id) DO NOTHING;
INSERT INTO public.reseller_help_servers(owner_id,server_id)
SELECT s.owner_id,s.id FROM public.servers s
WHERE s.show_on_reseller_page=true
AND EXISTS(SELECT 1 FROM public.reseller_help_settings p WHERE p.owner_id=s.owner_id)
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.get_public_reseller_help(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
WITH page AS (
 SELECT owner_id,slug,display_name,tagline,logo_url,whatsapp
 FROM public.reseller_help_settings
 WHERE slug=lower(trim(_slug)) AND enabled=true LIMIT 1
), listed AS (
 SELECT s.id,s.name AS name,
  CASE WHEN s.monitoring_paused OR s.last_checked_at IS NULL
       OR s.last_checked_at < now()-interval '20 minutes'
       OR (s.dns_enabled=true AND (s.last_dns_check_at IS NULL OR s.last_dns_check_at < now()-interval '20 minutes'))
    THEN 'unknown'
    WHEN s.current_status::text='down' THEN 'down'
    WHEN s.dns_enabled=true AND s.dns_status='offline' THEN 'dns_issue'
    WHEN s.current_status::text IN ('degraded','unstable') THEN 'unstable'
    WHEN s.current_status::text='up' THEN 'up'
    ELSE 'unknown'
  END AS status,
  CASE WHEN s.last_checked_at >= now()-interval '20 minutes' THEN s.last_checked_at ELSE NULL END AS checked_at
 FROM public.servers s
 JOIN public.reseller_help_servers allowed ON allowed.server_id=s.id AND allowed.owner_id=s.owner_id
 JOIN page p ON p.owner_id=s.owner_id
 ORDER BY s.name LIMIT 80
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM page) THEN jsonb_build_object(
 'name',(SELECT display_name FROM page),
 'tagline',(SELECT tagline FROM page),
 'logo_url',(SELECT logo_url FROM page),
 'whatsapp',(SELECT whatsapp FROM page),
 'servers',coalesce((SELECT jsonb_agg(to_jsonb(listed)) FROM listed),'[]'::jsonb)
) ELSE NULL END
$fn$;
REVOKE ALL ON FUNCTION public.get_public_reseller_help(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reseller_help(text) TO anon,authenticated,service_role;
