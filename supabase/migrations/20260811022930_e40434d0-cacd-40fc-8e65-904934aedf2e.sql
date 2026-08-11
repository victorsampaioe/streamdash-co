-- 1. Fix search_path for all public functions to prevent 'Function Search Path Mutable'
-- Security best practice: explicitly set search_path to public for SECURITY DEFINER functions

-- has_role
ALTER FUNCTION public.has_role(_user_id uuid, _role public.app_role) SET search_path = public;

-- run_due_checks (if exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'run_due_checks') THEN
        EXECUTE 'ALTER FUNCTION public.run_due_checks() SET search_path = public';
    END IF;
END $$;

-- get_iptv_radar_stats
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_iptv_radar_stats') THEN
        EXECUTE 'ALTER FUNCTION public.get_iptv_radar_stats() SET search_path = public';
    END IF;
END $$;

-- run_radar_batch_sync
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'run_radar_batch_sync') THEN
        EXECUTE 'ALTER FUNCTION public.run_radar_batch_sync() SET search_path = public';
    END IF;
END $$;

-- 2. Correct RLS for store tables
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store settings are viewable by everyone" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can manage store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Anyone can view store settings" ON public.store_settings;

CREATE POLICY "Admins can manage store settings"
ON public.store_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view store settings"
ON public.store_settings
FOR SELECT
TO authenticated
USING (true);

-- store_products RLS
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.store_products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.store_products;
DROP POLICY IF EXISTS "Anyone can view products" ON public.store_products;

CREATE POLICY "Admins can manage products"
ON public.store_products
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view active products"
ON public.store_products
FOR SELECT
TO authenticated
USING (true);

-- Ensure grants are correct
GRANT SELECT ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

GRANT SELECT ON public.store_products TO authenticated;
GRANT ALL ON public.store_products TO service_role;
