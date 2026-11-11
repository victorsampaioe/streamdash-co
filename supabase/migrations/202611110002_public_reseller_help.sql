-- Public customer help center. Only explicitly published, opted-in servers.
-- Excludes hostnames, credentials, incident internals and owner identity.
CREATE OR REPLACE FUNCTION public.get_public_reseller_help(_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
WITH page AS (
 SELECT owner_id,slug,display_name,tagline,intro,logo_url,primary_color,accent_color,whatsapp
 FROM public.reseller_pages
 WHERE slug=lower(trim(_slug)) AND published=true LIMIT 1
), listed AS (
 SELECT
   s.id,
   COALESCE(NULLIF(s.public_display_name,''),s.name) AS name,
   CASE WHEN (SELECT show_dns FROM public.reseller_pages WHERE owner_id=s.owner_id AND published=true LIMIT 1)
     THEN COALESCE(NULLIF(s.public_dns_label,''),'DNS monitorado') ELSE NULL END AS dns_label,
   CASE
     WHEN s.monitoring_paused OR s.last_checked_at IS NULL OR s.last_checked_at < now()-interval '20 minutes' OR (s.dns_enabled=true AND (s.last_dns_check_at IS NULL OR s.last_dns_check_at < now()-interval '20 minutes'))
       THEN 'unknown'
     WHEN s.current_status::text = 'down' THEN 'down'
     WHEN s.dns_enabled=true AND s.dns_status='offline'
       AND s.last_dns_check_at >= now()-interval '20 minutes' THEN 'dns_issue'
     WHEN s.current_status::text IN ('degraded','unstable') THEN 'unstable'
     WHEN s.current_status::text = 'up' THEN 'up'
     ELSE 'unknown'
   END AS status,
   CASE WHEN s.last_checked_at >= now()-interval '20 minutes'
     THEN s.last_checked_at ELSE NULL END AS checked_at
 FROM public.servers s
 JOIN page p ON s.owner_id=p.owner_id
 WHERE s.show_on_reseller_page=true
 ORDER BY s.name
 LIMIT 80
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM page) THEN jsonb_build_object(
 'name',(SELECT display_name FROM page),'tagline',(SELECT tagline FROM page),
 'intro',(SELECT intro FROM page),'logo_url',(SELECT logo_url FROM page),
 'primary_color',(SELECT primary_color FROM page),'accent_color',(SELECT accent_color FROM page),
 'whatsapp',(SELECT whatsapp FROM page),
 'servers',coalesce((SELECT jsonb_agg(to_jsonb(listed)) FROM listed),'[]'::jsonb)
) ELSE NULL END
$fn$;
REVOKE ALL ON FUNCTION public.get_public_reseller_help(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reseller_help(text) TO anon,authenticated,service_role;
