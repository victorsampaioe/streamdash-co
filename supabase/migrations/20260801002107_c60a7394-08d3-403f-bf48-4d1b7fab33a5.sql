ALTER TABLE public.iptv_syncs
  ADD COLUMN IF NOT EXISTS login_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS diagnostics jsonb;