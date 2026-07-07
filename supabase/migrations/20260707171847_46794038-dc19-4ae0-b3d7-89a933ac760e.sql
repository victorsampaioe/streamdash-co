GRANT SELECT ON public.check_regions TO anon, authenticated;
GRANT ALL ON public.check_regions TO service_role;

GRANT SELECT ON public.region_checks TO anon, authenticated;
GRANT ALL ON public.region_checks TO service_role;