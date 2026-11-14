ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS acquisition_source text,
  ADD COLUMN IF NOT EXISTS acquisition_platform text,
  ADD COLUMN IF NOT EXISTS acquisition_campaign text,
  ADD COLUMN IF NOT EXISTS acquisition_content text,
  ADD COLUMN IF NOT EXISTS acquisition_placement text;
COMMENT ON COLUMN public.profiles.acquisition_platform IS 'facebook | instagram | messenger | audience_network | other — set once by the server at signup from ad link tags.';
CREATE INDEX IF NOT EXISTS profiles_acquisition_platform_idx ON public.profiles (acquisition_platform) WHERE acquisition_platform IS NOT NULL;