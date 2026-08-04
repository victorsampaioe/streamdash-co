ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp text;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
