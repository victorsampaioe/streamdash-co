-- Reseller-owned, opt-in public status pages.
CREATE TABLE IF NOT EXISTS public.reseller_status_pages (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 80),
 description text NOT NULL DEFAULT '' CHECK(length(description) <= 240),
 is_public boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_status_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner read status pages" ON public.reseller_status_pages;
CREATE POLICY "owner read status pages" ON public.reseller_status_pages FOR SELECT TO authenticated
USING (owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'::public.app_role));
DROP POLICY IF EXISTS "owner create status pages" ON public.reseller_status_pages;
CREATE POLICY "owner create status pages" ON public.reseller_status_pages FOR INSERT TO authenticated
WITH CHECK (owner_id=auth.uid());
DROP POLICY IF EXISTS "owner update status pages" ON public.reseller_status_pages;
CREATE POLICY "owner update status pages" ON public.reseller_status_pages FOR UPDATE TO authenticated
USING (owner_id=auth.uid()) WITH CHECK (owner_id=auth.uid());
DROP POLICY IF EXISTS "owner delete status pages" ON public.reseller_status_pages;
CREATE POLICY "owner delete status pages" ON public.reseller_status_pages FOR DELETE TO authenticated
USING (owner_id=auth.uid());
REVOKE ALL ON public.reseller_status_pages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_status_pages TO authenticated;

-- Explicitly opt-in only. Never reveal host, usernames, passwords, owner id,
-- private notes, payment details, or servers whose public flag is disabled.
CREATE OR REPLACE FUNCTION public.get_public_reseller_status(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public'
AS $$
WITH page AS (
 SELECT owner_id,slug,display_name,description
 FROM public.reseller_status_pages
 WHERE slug=_slug AND is_public=true LIMIT 1
), permitted AS (
 SELECT s.id,s.name,s.description,s.current_status::text AS current_status,
 s.dns_status,s.dns_enabled,s.last_checked_at,s.last_dns_check_at,s.monitoring_paused,
 s.last_latency_ms
 FROM public.servers s JOIN page p ON p.owner_id=s.owner_id
 WHERE s.is_public=true
 ORDER BY s.name LIMIT 50
)
SELECT CASE WHEN EXISTS(SELECT 1 FROM page)
 THEN jsonb_build_object(
 'name',(SELECT display_name FROM page LIMIT 1),
 'description',(SELECT description FROM page LIMIT 1),
 'checked_at',now(),
 'servers',COALESCE((SELECT jsonb_agg(to_jsonb(permitted)) FROM permitted),'[]'::jsonb)
 ) ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.get_public_reseller_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reseller_status(text) TO anon,authenticated;